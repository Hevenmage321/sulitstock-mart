import { applyInventory, readInventory } from './market-state.js';
import { getFulfillmentOptions, pickFulfillment, shipmentDetails } from './delivery.js';
import { categoriesById, offersById, productsById, suppliersById } from './catalog-records.js';
import {
  calculateBulkSavings, calculateOrderSubtotal, getApplicablePricingTier,
  getOffersByProduct, getProductsByCategory, getReachablePricingTiers, offsetQuantity, validateQuantity,
} from './procurement.js';
import {
  describeStock, formatPrice, formatQuantity, initializeMarketplace, offerUrl, quantityError, renderOffer,
  setMerchantLogo, setSupplierContact, showProductImage, supplierLink, supplierUrl, updateDistances, wholesaleRange,
} from './marketplace-ui.js';

const byId = id => document.getElementById(id);
const setText = (id, text) => { byId(id).textContent = text; };
let refreshComparison = () => {};
const getBuyerLocation = initializeMarketplace(() => {
  updateDistances(getBuyerLocation());
  refreshComparison();
}, () => window.location.reload());
const catalogOffer = offersById.get(new URLSearchParams(window.location.search).get('offer'));
const offer = catalogOffer && applyInventory(catalogOffer, readInventory());

function populateFacts(element, entries) {
  for (const [label, value] of entries) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const definition = document.createElement('dd');
    term.textContent = label;
    definition.textContent = value;
    row.append(term, definition);
    element.append(row);
  }
}

function renderTiers(offerRecord, unit, reachable) {
  const table = byId('pricing-tiers');
  return offerRecord.priceTiers.map((tier, index, allTiers) => {
    const row = document.createElement('tr');
    const quantity = document.createElement('th');
    const price = document.createElement('td');
    const state = document.createElement('td');
    quantity.scope = 'row';
    const next = allTiers[index + 1];
    const end = next && offsetQuantity(next.minimumQuantity, -offerRecord.quantityIncrement);
    quantity.textContent = !next
      ? `${formatQuantity(tier.minimumQuantity, unit)} and up`
      : end === tier.minimumQuantity
        ? formatQuantity(tier.minimumQuantity, unit)
        : `${formatQuantity(tier.minimumQuantity, unit)}–${formatQuantity(end, unit)}`;
    price.textContent = `${formatPrice(tier.unitPriceCentavos)}/${unit}`;
    row.dataset.tierStart = tier.minimumQuantity;
    row.dataset.tierState = reachable.includes(tier) ? 'available' : 'unreachable';
    state.textContent = reachable.includes(tier) ? 'Available' : 'Stock too low';
    row.append(quantity, price, state);
    table.append(row);
    return { row, state, tier };
  });
}

function renderComparison(offerRecord, product) {
  const comparison = byId('supplier-comparison');
  const alternatives = getOffersByProduct(product.id).filter(other => other.id !== offerRecord.id);
  if (!alternatives.length) comparison.textContent = 'No other demo suppliers list this product.';
  return alternatives.map(other => {
    const supplier = suppliersById.get(other.supplierId);
    const card = byId('comparison-template').content.cloneNode(true);
    card.querySelector('article').dataset.offerId = other.id;
    const set = (field, text) => { card.querySelector(`.comparison-${field}`).textContent = text; };
    card.querySelector('.comparison-supplier').append(supplierLink(supplier.id));
    set('location', supplier.location.label);
    card.querySelector('.comparison-distance').dataset.distanceSupplier = supplier.id;
    describeStock(card.querySelector('.comparison-stock'), other, product.unit);
    set('range', `${wholesaleRange(other)}/${product.unit}`);
    set('moq-price', `${formatPrice(other.priceTiers[0].unitPriceCentavos)}/${product.unit}`);
    set('moq', formatQuantity(other.minimumOrderQuantity, product.unit));
    set('packaging', other.packaging);
    const link = card.querySelector('.button');
    link.href = offerUrl(other.id);
    link.setAttribute('aria-label', `View Offer from ${supplier.name}`);
    const quantity = card.querySelector('.comparison-quantity');
    comparison.append(card);
    return { other, quantity };
  });
}

function updateComparison(alternatives, current, product, quantity) {
  const { unit } = product;
  const samePurchasingUnit = offer => ['kg', 'g', 'L'].includes(unit) || offer.packaging === current.packaging;
  function estimate(offer) {
    if (!samePurchasingUnit(offer) || validateQuantity(offer, quantity)) return null;
    const subtotal = calculateOrderSubtotal(offer, quantity);
    const supplier = suppliersById.get(offer.supplierId);
    const options = getFulfillmentOptions(supplier, getBuyerLocation(), shipmentDetails([{ offer, quantity }]));
    const delivery = pickFulfillment(options.filter(option => option.method !== 'Pickup'));
    return { subtotal, delivery, landed: delivery?.fee != null ? subtotal + delivery.fee : null };
  }
  const standalone = estimate(current);
  setText('standalone-delivery', !standalone ? '' : standalone.landed != null
    ? `Standalone delivery ${formatPrice(standalone.delivery.fee)} · Estimated landed total ${formatPrice(standalone.landed)}.`
    : standalone.delivery ? `Standalone delivery quotation required: ${standalone.delivery.reason}.`
      : 'Compatible delivery unavailable at this destination. Check pickup options in the cart.');
  const candidates = [current, ...alternatives.map(entry => entry.other)]
    .map(offer => ({ offer, ...estimate(offer) })).filter(entry => entry.landed != null)
    .sort((a, b) => a.landed - b.landed);
  const cheapest = candidates[0];
  const recommendation = byId('landed-recommendation');
  recommendation.replaceChildren();
  if (cheapest) {
    recommendation.append('Lowest estimated delivered total: ', supplierLink(cheapest.offer.supplierId), ` · ${formatPrice(cheapest.landed)}.`);
  }
  for (const { other, quantity: output } of alternatives) {
    const samePackaging = samePurchasingUnit(other);
    const error = validateQuantity(other, quantity);
    output.dataset.invalid = String(Boolean(error) && error !== 'invalid-quantity' && samePackaging);
    if (!samePackaging) {
      output.textContent = 'Different packaging. Review this offer before comparing order totals.';
    } else if (!Number.isFinite(quantity) || quantity <= 0) {
      output.textContent = 'Enter a positive quantity to compare offers.';
    } else if (error) {
      output.textContent = `Cannot fulfill ${formatQuantity(quantity, unit)}. ${quantityError(other, unit, error)}`;
    } else {
      const tier = getApplicablePricingTier(other, quantity);
      const { subtotal, delivery, landed } = estimate(other);
      const shipping = landed != null
        ? `Standalone delivery ${formatPrice(delivery.fee)} · Landed total ${formatPrice(landed)} · Effective ${formatPrice(Math.round(landed / quantity))}/${unit}.`
        : delivery ? `Delivery quotation required: ${delivery.reason}. Pickup may be available.` : 'Compatible delivery unavailable. Pickup may be available.';
      output.textContent = `At ${formatQuantity(quantity, unit)} · ${formatPrice(tier.unitPriceCentavos)}/${unit} · ${formatPrice(subtotal)} subtotal. ${shipping}`;
    }
  }
}

function renderRelated(product) {
  const candidates = getProductsByCategory(product.categoryId).filter(other => other.id !== product.id);
  candidates.sort((a, b) => Number(b.subcategoryId === product.subcategoryId) - Number(a.subcategoryId === product.subcategoryId)
    || Number(Boolean(b.image)) - Number(Boolean(a.image)));
  const related = candidates.flatMap(other => {
    const available = getOffersByProduct(other.id).find(candidate => getReachablePricingTiers(candidate).length);
    return available ? [available] : [];
  }).slice(0, 4);
  byId('related-section').hidden = !related.length;
  byId('related-products').append(...related.map(renderOffer));
}

function initializeOffer(offerRecord) {
  const product = productsById.get(offerRecord.productId);
  const supplier = suppliersById.get(offerRecord.supplierId);
  const { unit } = product;
  const category = categoriesById.get(product.categoryId);
  const subcategory = category.subcategories.find(item => item.id === product.subcategoryId);
  const { minimumOrderQuantity: minimum, availableStock: stock, quantityIncrement: increment } = offerRecord;

  document.title = `${product.name} · ${supplier.name} | SulitStock Mart`;
  setText('breadcrumb-current', product.name);
  setText('product-title', product.name);
  setText('product-description', product.description);
  setText('product-price-range', wholesaleRange(offerRecord));
  setText('product-price-unit', `/ ${unit}`);
  setText('product-moq', `Min. order ${formatQuantity(minimum, unit)}`);
  byId('supplier-name').append(supplierLink(supplier.id));
  setMerchantLogo(byId('supplier-logo'), supplier.id);
  setText('supplier-description', supplier.type);
  byId('merchant-shop').href = supplierUrl(supplier.id);
  setSupplierContact(byId('merchant-chat'), supplier, offerRecord.id);
  const badge = document.querySelector('.merchant-badge');
  const tooltip = badge.parentElement;
  function dismissVerification() {
    tooltip.removeAttribute('data-tooltip-open');
    tooltip.setAttribute('data-tooltip-dismissed', '');
  }
  badge.addEventListener('click', () => {
    if (tooltip.hasAttribute('data-tooltip-open')) dismissVerification();
    else {
      tooltip.removeAttribute('data-tooltip-dismissed');
      tooltip.setAttribute('data-tooltip-open', '');
    }
  });
  badge.addEventListener('blur', () => {
    tooltip.removeAttribute('data-tooltip-open');
    tooltip.removeAttribute('data-tooltip-dismissed');
  });
  tooltip.addEventListener('pointerleave', () => {
    if (document.activeElement !== badge) tooltip.removeAttribute('data-tooltip-dismissed');
  });
  badge.addEventListener('keydown', event => {
    if (event.key === 'Escape') dismissVerification();
  });

  setText('supplier-location', supplier.location.label);
  byId('supplier-distance').dataset.distanceSupplier = supplier.id;
  showProductImage(document.querySelector('.product-photo'), product, { lazy: false, offer: offerRecord });
  describeStock(byId('product-stock'), offerRecord, unit);
  populateFacts(byId('product-specifications'), [
    ['Category', category.label], ['Subcategory', subcategory.label], ['Purchasing unit', unit],
    ['Package size', offerRecord.packaging], ['Shipping pack', offerRecord.shipping.package],
    ['Estimated gross shipping weight', `${offerRecord.shipping.grossKgPerUnit < .01
      ? formatQuantity(offerRecord.shipping.grossKgPerUnit * 1000, 'g')
      : formatQuantity(offerRecord.shipping.grossKgPerUnit, 'kg')} per ${unit}`], ['Storage', product.storage],
  ]);
  const [leadFrom, leadTo] = supplier.delivery.leadTimeHours;
  populateFacts(byId('supplier-delivery'), [
    ['Business', supplier.description], ['Coverage', supplier.delivery.coverage.join(', ')], ['Lead time', `${leadFrom}–${leadTo} hours`],
    ['Fulfillment', supplier.delivery.methods.join(', ')], ['Operating hours', supplier.operatingHours],
  ]);

  const availableTiers = getReachablePricingTiers(offerRecord);
  const canPurchase = availableTiers.length > 0;
  const tierRows = renderTiers(offerRecord, unit, availableTiers);
  const alternatives = renderComparison(offerRecord, product);
  renderRelated(product);
  const quantity = byId('purchase-quantity');
  const minus = byId('quantity-minus');
  const plus = byId('quantity-plus');
  const add = byId('purchase-add');
  const quotation = document.querySelector('[data-demo="quotation"]');
  const errorMessage = byId('quantity-error');
  const moqPrice = offerRecord.priceTiers[0].unitPriceCentavos;
  setText('quantity-unit', `(${unit})`);
  setText('quantity-help', `Minimum ${formatQuantity(minimum, unit)} · Step ${formatQuantity(increment, unit)}`);
  quantity.min = minimum;
  quantity.max = stock;
  quantity.step = increment;
  quantity.value = minimum;
  quantity.disabled = !canPurchase;
  setSupplierContact(byId('supplier-contact'), supplier, offerRecord.id);
  setSupplierContact(quotation, supplier, offerRecord.id);
  quotation.dataset.quantityInput = quantity.id;
  add.dataset.addOffer = offerRecord.id;
  add.dataset.quantityInput = quantity.id;

  function updatePurchase() {
    const value = quantity.valueAsNumber;
    const error = validateQuantity(offerRecord, value);
    const tier = getApplicablePricingTier(offerRecord, value);
    const valid = tier !== null;
    const price = tier?.unitPriceCentavos;
    const nextTier = valid ? availableTiers.find(item => item.minimumQuantity > value) : null;
    for (const { row, state, tier: candidate } of tierRows) {
      const stateName = candidate === tier ? 'active' : availableTiers.includes(candidate) ? 'available' : 'unreachable';
      row.dataset.tierState = stateName;
      state.textContent = { active: 'Selected', available: 'Available', unreachable: 'Stock too low' }[stateName];
    }
    if (canPurchase && !valid) quantity.setAttribute('aria-invalid', 'true');
    else quantity.removeAttribute('aria-invalid');
    errorMessage.hidden = valid;
    errorMessage.textContent = valid ? '' : quantityError(offerRecord, unit, error);
    add.disabled = !valid;
    const lower = offsetQuantity(value, -increment);
    const higher = offsetQuantity(value, increment);
    minus.disabled = !valid || validateQuantity(offerRecord, lower) !== null;
    plus.disabled = !valid || validateQuantity(offerRecord, higher) !== null;
    setText('current-unit-price', valid ? `${formatPrice(price)}/${unit}` : '—');
    setText('unit-savings', valid ? `${formatPrice(moqPrice - price)}/${unit}` : '—');
    setText('total-savings', valid ? formatPrice(calculateBulkSavings(offerRecord, value)) : '—');
    setText('purchase-subtotal', valid ? formatPrice(calculateOrderSubtotal(offerRecord, value)) : '—');
    const tierMessage = nextTier
      ? `Add ${formatQuantity(offsetQuantity(nextTier.minimumQuantity, -value), unit)} to unlock ${formatPrice(nextTier.unitPriceCentavos)}/${unit}.`
      : valid ? 'Highest available discount tier reached for this supplier’s current stock.' : '';
    byId('next-tier').hidden = !tierMessage;
    setText('next-tier', tierMessage);
    updateComparison(alternatives, offerRecord, product, value);
  }

  refreshComparison = () => updateComparison(alternatives, offerRecord, product, quantity.valueAsNumber);
  quantity.addEventListener('input', updatePurchase);
  quantity.addEventListener('change', updatePurchase);
  for (const [button, change] of [[minus, -increment], [plus, increment]]) {
    button.addEventListener('click', () => {
      quantity.value = offsetQuantity(quantity.valueAsNumber, change);
      updatePurchase();
      if (button.disabled) quantity.focus();
    });
  }
  // Recheck the current editable value before the shared demo handler opens.
  add.addEventListener('click', updatePurchase);
  updatePurchase();
  updateDistances(getBuyerLocation());
  byId('product-content').hidden = false;
}

if (offer) initializeOffer(offer);
else byId('missing-offer').hidden = false;
