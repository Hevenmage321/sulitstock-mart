import { productsById, suppliersById } from './catalog-records.js';
import { paymentMethods } from './checkout.js';
import { paymentLabels } from './order-store.js';
import { getFulfillmentOptions, pickFulfillment, shipmentDetails } from './delivery.js';
import { getOffersBySupplier, getReachablePricingTiers, getApplicableWholesalePrice, calculateOrderSubtotal, calculateBulkSavings, validateQuantity } from './procurement.js';
import { formatPrice, formatQuantity, quantityError, wholesaleRange } from './marketplace-ui.js';
import { scopedOffer } from './messaging-store.js';

const clean = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
const aliases = {
  'chicken-breast': ['dibdib ng manok', 'pitso', 'chicken breast', 'breast fillet'],
  'chicken-thigh': ['hita ng manok', 'chicken thigh', 'thigh fillet'],
  'whole-chicken': ['buong manok', 'whole chicken'], 'pork-belly': ['liempo', 'pork belly'],
  'ground-pork': ['giniling na baboy', 'ground pork'], 'ground-beef': ['giniling na baka', 'ground beef'],
  prawns: ['hipon', 'shrimp', 'prawn', 'prawns'], bangus: ['milkfish', 'bangus'], squid: ['pusit', 'squid'],
  'red-onions': ['sibuyas', 'onion', 'onions'], garlic: ['bawang', 'garlic'],
  tomatoes: ['kamatis', 'tomato', 'tomatoes'], potatoes: ['patatas', 'potato', 'potatoes'],
  carrots: ['karot', 'carrot', 'carrots'], cabbage: ['repolyo', 'cabbage'],
  'jasmine-rice': ['jasmine rice', 'jasmine bigas'], 'well-milled-rice': ['well milled rice'],
  'glutinous-rice': ['malagkit', 'sticky rice'], 'cooking-oil': ['cooking oil', 'mantika'],
  'soy-sauce': ['toyo', 'soy sauce'], 'cane-vinegar': ['suka', 'vinegar'], 'fish-sauce': ['patis', 'fish sauce'],
  'chicken-eggs': ['itlog', 'eggs', 'egg'], 'whole-milk': ['gatas', 'milk'], flour: ['harina', 'flour'],
  'rice-vermicelli': ['bihon', 'rice noodles'], mangoes: ['mangga', 'mango'], 'saba-bananas': ['saging', 'saba'],
};
const groups = {
  manok: ['chicken-breast', 'chicken-thigh', 'whole-chicken'], chicken: ['chicken-breast', 'chicken-thigh', 'whole-chicken'],
  bigas: ['jasmine-rice', 'well-milled-rice', 'glutinous-rice'], rice: ['jasmine-rice', 'well-milled-rice', 'glutinous-rice'],
  baboy: ['pork-belly', 'ground-pork'], pork: ['pork-belly', 'ground-pork'],
  baka: ['beef-chuck', 'ground-beef'], beef: ['beef-chuck', 'ground-beef'],
  isda: ['bangus', 'tilapia', 'tuna-loin'], fish: ['bangus', 'tilapia', 'tuna-loin'],
};
const hasPhrase = (text, phrase) => ` ${text} `.includes(` ${phrase} `);

function productMatches(text) {
  const matches = [];
  for (const product of productsById.values()) {
    const name = clean(product.name);
    const phrases = [name, product.id.replaceAll('-', ' '), ...(aliases[product.id] ?? [])];
    const matching = phrases.filter(phrase => hasPhrase(text, phrase));
    if (matching.length) matches.push({ id: product.id, phrases: matching });
  }
  if (matches.length) {
    return matches.filter(entry => entry.phrases.some(phrase => !matches.some(other =>
      other.id !== entry.id && other.phrases.some(longer => longer.length > phrase.length && hasPhrase(longer, phrase))
    ))).map(entry => entry.id);
  }
  return [...new Set(Object.entries(groups).filter(([word]) => hasPhrase(text, word) || hasPhrase(text, `${word}s`)).flatMap(([, ids]) => ids))];
}

function requestedQuantity(message, text) {
  const explicit = [...message.matchAll(/(?<![\d.\-])(-?\d[\d,]*(?:\.\d+)?)\s*(kilograms?|kilos?|kg|grams?|g|liters?|litres?|l|sacks?|trays?|packs?|boxes|box)\b/gi)];
  if (explicit.length > 1) return { ambiguous: true };
  if (explicit.length) {
    const [, raw, unit] = explicit[0];
    const abbreviations = { kg: 'kg', kilo: 'kg', kilogram: 'kg', g: 'g', gram: 'g', l: 'L', liter: 'L', litre: 'L', sack: 'sack', tray: 'pack', pack: 'pack', box: 'box', boxes: 'box' };
    return { amount: Number(raw.replaceAll(',', '')), unit: abbreviations[unit.toLowerCase()] ?? abbreviations[unit.toLowerCase().replace(/s$/, '')] };
  }
  const implicit = message.trim().match(/^(?:(?:what about|how about|paano kung|kung|and)\s+)?(-?\d[\d,]*(?:\.\d+)?)\s*[?!.]*$/i);
  const addressed = text.match(/\b(?:for|ng|kung) (\d+)\b/);
  return implicit ? { amount: Number(implicit[1].replaceAll(',', '')) } : addressed ? { amount: Number(addressed[1]) } : {};
}

function deliveryText(supplier, buyer, offer, quantity) {
  if (!buyer) return 'Choose a buyer location for a demo delivery estimate.';
  if (!supplier.delivery.coverageIds.includes(buyer.id)) return `${buyer.label} is outside this supplier’s delivery coverage.${supplier.delivery.methods.includes('Pickup') ? ' Pickup is available.' : ''}`;
  if (!offer) return `This supplier covers ${buyer.label}. Choose a product and quantity for a delivery estimate.`;
  const amount = quantity ?? offer.minimumOrderQuantity;
  const unit = productsById.get(offer.productId).unit;
  if (validateQuantity(offer, amount)) return 'A delivery estimate requires a quantity within the current purchasing limits.';
  const options = getFulfillmentOptions(supplier, buyer, shipmentDetails([{ offer, quantity: amount }]));
  const delivery = pickFulfillment(options.filter(option => option.method !== 'Pickup'));
  if (!delivery) return `No compatible delivery method for this product to ${buyer.label}.${options.some(option => option.method === 'Pickup') ? ' Pickup is available.' : ''}`;
  if (delivery.fee == null) return `Delivery needs a quotation: ${delivery.reason}.`;
  const total = calculateOrderSubtotal(offer, amount) + delivery.fee;
  return `${delivery.label} to your selected buyer location, ${buyer.label}: estimated ${formatPrice(delivery.fee)} for ${formatQuantity(amount, unit)}. Estimated delivered total ${formatPrice(total)}. Lead time ${supplier.delivery.leadTimeHours.join('–')} hours.`;
}

export function answerSupplier({ supplierId, message, offerId, buyer, inventory, chosenOfferId }) {
  const supplier = suppliersById.get(supplierId);
  if (!supplier) return { text: 'This demo supplier could not be found.' };
  const text = clean(message);
  const offers = getOffersBySupplier(supplierId, inventory);
  const available = offers.filter(offer => getReachablePricingTiers(offer).length);
  const found = chosenOfferId ? [] : productMatches(text);
  const matches = offers.filter(offer => found.includes(offer.productId));
  const quantity = requestedQuantity(message, text);
  const quote = /\b(quote|quotation|rfq|recurring|repeat order|weekly|monthly|araw araw|linggo linggo|regular order|oversized)\b/.test(text);
  const alternate = /\b(alternative[s]?|substitute[s]?|recommend|other products|ano pa|kapalit|iba pang)\b/.test(text);
  const delivery = /\b(deliver\w*|shipping|coverage|ship|padala|magpadala|ipadala|hatid|ihatid|abot)\b/.test(text);
  const pickup = /\b(pickup|pick up|collect|kunin|kuha)\b/.test(text);
  const hours = /\b(hours|open|close|opening|oras|bukas|schedule)\b/.test(text) && !delivery;
  const payments = /\b(payment[s]?|pay|gcash|cod|bank transfer|bayad|pagbabayad)\b/.test(text);
  const pricing = /\b(price[s]?|pricing|cost|much|magkano|presyo|subtotal|discount[s]?|savings|wholesale|bulk|tier[s]?|bawas)\b/.test(text);
  const stock = /\b(stock|inventory|available|availability|mayroon|meron|may|in stock|ubos)\b/.test(text);
  const minimum = /\b(moq|minimum|min order|minimo|pinakamababa|ilang kilo)\b/.test(text);
  const current = offers.find(offer => offer.id === (chosenOfferId ?? offerId));
  const offer = matches.length === 1 ? matches[0] : current;
  const response = (value, extra = {}) => ({ text: value, offerId: offer?.id ?? null, ...extra });

  const namedObject = text.match(/\b(?:do you have|mayroon ba kayong|mayroon ba|may ba kayong|may kayong|meron ba kayong|meron ba|may stock ba ng|stock ng|price of|presyo ng|magkano ang) (.+)/)?.[1] ?? text.match(/\b(?:for|ng|na) [\d ]+(?:kg|kilos?|kilograms?|grams?|liters?|sacks?|trays?|packs?|boxes) (?:of |na |ng )?([a-z].+)/)?.[1];
  const unknownObject = namedObject && !/^(?:\d|(?:this|that|it|stock|available|delivery|pickup|discount|wholesale|gcash|cod|discounts|payment)\b)/.test(namedObject);
  if (!chosenOfferId && !found.length && unknownObject) return response('I couldn’t match that product to this supplier’s catalog. Try its listing name or choose an offer.', { choices: available.slice(0, 5).map(item => item.id), pending: message });
  if (found.length && !matches.length) return response('This supplier does not list that product. I can show items from this supplier.', { offers: available.slice(0, 3).map(item => item.id) });
  if (found.length > 1 && matches.length > 0 && !chosenOfferId) return response('Which product did you mean? Choose an offer below and I’ll use it for your question.', { choices: matches.map(item => item.id), pending: message });
  if (quantity.ambiguous) return response('Please ask about one quantity at a time, using the unit shown on the product.');
  if (alternate) {
    const alternatives = available.filter(item => item.id !== offer?.id)
      .sort((a, b) => Number(productsById.get(b.productId).categoryId === productsById.get(offer?.productId)?.categoryId)
        - Number(productsById.get(a.productId).categoryId === productsById.get(offer?.productId)?.categoryId)).slice(0, 3);
    return response(alternatives.length ? 'Here are other available offers from this supplier. Check their specifications before substituting.' : 'This supplier has no other currently purchasable offers.', { offers: alternatives.map(item => item.id) });
  }
  if (quote) return response('You can save a simulated quotation request. Pricing, future stock and delivery dates would need confirmation in a real transaction.', { quote: true, quantity: quantity.unit && offer && quantity.unit !== productsById.get(offer.productId).unit ? undefined : quantity.amount });
  const facts = [];
  if (payments) facts.push(`Demo checkout methods: ${paymentMethods.map(key => paymentLabels[key]).join(', ')}.`);
  if (hours) facts.push(`Operating hours: ${supplier.operatingHours}.`);
  if (pickup) facts.push(supplier.delivery.methods.includes('Pickup') ? `Pickup is available in ${supplier.location.label} with no delivery fee.` : 'This supplier does not list pickup.');
  if (offer) {
    const product = productsById.get(offer.productId);
    if (quantity.unit && quantity.unit !== product.unit) return response(`${product.name} is priced per ${product.unit}. Please specify the quantity in that unit.`, { offers: [offer.id] });
    const amount = quantity.amount;
    if (stock || minimum || pricing || amount != null || matches.length) {
      facts.push(`${product.name}: ${formatQuantity(offer.availableStock, product.unit)} currently available. Minimum order ${formatQuantity(offer.minimumOrderQuantity, product.unit)}.`);
      if (amount == null && (pricing || matches.length)) {
        facts.push(`Current listed wholesale price: ${wholesaleRange(offer)} per ${product.unit}.`);
        const tiers = getReachablePricingTiers(offer);
        if (pricing && tiers.length > 1) facts.push(`Reachable tiers: ${tiers.map(tier => `${formatQuantity(tier.minimumQuantity, product.unit)} at ${formatPrice(tier.unitPriceCentavos)}/${product.unit}`).join('; ')}.`);
      }
    }
    if (amount != null) {
      const error = validateQuantity(offer, amount);
      if (error) return response(`${facts.join(' ')} ${quantityError(offer, product.unit, error)}`.trim(), {
        offers: [offer.id], quote: amount > offer.availableStock && Number.isFinite(amount), quantity: amount,
      });
      const price = getApplicableWholesalePrice(offer, amount);
      const next = getReachablePricingTiers(offer).find(tier => tier.minimumQuantity > amount);
      facts.push(`${formatQuantity(amount, product.unit)} at ${formatPrice(price)}/${product.unit}: subtotal ${formatPrice(calculateOrderSubtotal(offer, amount))}. Savings ${formatPrice(calculateBulkSavings(offer, amount))} compared with the minimum-order rate. ${next ? `Next discount at ${formatQuantity(next.minimumQuantity, product.unit)} (${formatPrice(next.unitPriceCentavos)}/${product.unit}).` : 'This is the best tier reachable with current stock.'}`);
    }
  } else if (pricing || stock || minimum || quantity.amount != null) {
    facts.push('Which product should I check? Choose an offer or type the product name.');
    if (!delivery && !facts.slice(0, -1).length) return response(facts[0], { choices: available.slice(0, 5).map(item => item.id), pending: message });
  }
  if (delivery) {
    if (/\b(areas|locations|cities|deliver to where|saan)\b/.test(text)) {
      facts.push(`Coverage: ${supplier.delivery.coverage.join(', ')}.`);
    }
    facts.push(deliveryText(supplier, buyer, offer, quantity.amount));
  }
  if (!facts.length) return response('I can check demo stock, wholesale prices, minimums, coverage, pickup, business hours, and payment options. I don’t have information beyond this catalog.');
  return response(facts.join(' '), {
    offers: offer && (pricing || stock || minimum || matches.length || quantity.amount != null) ? [offer.id] : [],
    quote: delivery && facts.at(-1).startsWith('Delivery needs a quotation'),
    quantity: quantity.amount,
  });
}

export function validQuotation(fields, supplierId) {
  const offer = scopedOffer(fields.offerId, supplierId);
  const quantity = Number(fields.quantity);
  const date = fields.date;
  const dateValue = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
  return Boolean(offer && Number.isFinite(quantity) && quantity > 0 && quantity <= 1e9
    && ['once', 'weekly', 'monthly', 'other'].includes(fields.frequency)
    && dateValue && !Number.isNaN(dateValue.getTime()) && dateValue.toISOString().slice(0, 10) === date);
}
