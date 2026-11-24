import { applyInventory, readInventory, withMarketWrite } from './market-state.js';
import { estimateShipments } from './checkout.js';
import { fulfillmentKey, readFulfillmentChoices, saveFulfillmentChoice } from './delivery.js';
import { fulfillmentMessage, renderFulfillmentOptions } from './fulfillment-ui.js';
import { offersById, productsById, suppliersById } from './catalog-records.js';
import { cartStorageKey, cartStore, getCartLine, summarizeCart } from './cart-store.js';
import { calculateSupplierDistance, offsetQuantity } from './procurement.js';
import {
  describeStock, formatPrice, formatQuantity, initializeMarketplace, offerUrl,
  quantityError, showProductImage, supplierLink, updateCartCount,
} from './marketplace-ui.js';

const byId = id => document.getElementById(id);
const layout = byId('cart-layout');
const groups = byId('cart-groups');
const empty = byId('empty-cart');
const selectAll = byId('select-all');
const checkout = byId('checkout');
const drafts = new Map();
const rowViews = new Map();
const groupViews = new Map();
let snapshot;

let choices = readFulfillmentChoices();
const getBuyer = initializeMarketplace(renderValues);

function say(message) {
  byId('cart-announcement').textContent = message;
}

function updateCheck(checkbox, selected, total) {
  checkbox.checked = total > 0 && selected === total;
  checkbox.indeterminate = selected > 0 && selected < total;
}

function renderRow(item) {
  const offer = applyInventory(offersById.get(item.offerId), snapshot.inventory);
  const product = productsById.get(offer.productId);
  const supplier = suppliersById.get(offer.supplierId);
  const row = byId('cart-item-template').content.firstElementChild.cloneNode(true);
  const find = selector => row.querySelector(selector);
  const check = find('.select-item');
  const quantity = find('.cart-quantity-input');
  const remove = find('.cart-remove');
  const photo = find('.cart-photo');
  const link = find('.cart-product-link');
  const error = find('.cart-item-error');
  const tier = find('.cart-item-tier');
  row.dataset.offerId = item.offerId;
  check.dataset.selectOffer = item.offerId;
  find('.cart-item-check span').textContent = `Select ${product.name} from ${supplier.name}`;
  photo.href = link.href = offerUrl(offer.id);
  photo.setAttribute('aria-label', `View ${product.name} from ${supplier.name}`);
  showProductImage(photo, product, { decorative: true, offer });
  link.textContent = product.name;
  find('.cart-item-supplier').append(supplierLink(supplier.id));
  describeStock(find('.cart-item-stock'), offer, product.unit);
  find('.cart-item-moq').textContent = `Min. order ${formatQuantity(offer.minimumOrderQuantity, product.unit)}`;
  quantity.id = `quantity-${offer.id}`;
  quantity.dataset.quantityOffer = offer.id;
  quantity.min = offer.minimumOrderQuantity;
  quantity.max = offer.availableStock;
  quantity.step = offer.quantityIncrement;
  quantity.value = drafts.get(item.offerId) ?? item.quantity;
  const label = find('.cart-quantity-label');
  label.htmlFor = quantity.id;
  label.textContent = `Quantity (${product.unit})`;
  quantity.setAttribute('aria-label', `Quantity in ${product.unit} for ${product.name} from ${supplier.name}`);
  error.id = `cart-error-${offer.id}`;
  tier.id = `cart-tier-${offer.id}`;
  quantity.setAttribute('aria-describedby', `${error.id} ${tier.id}`);
  remove.dataset.removeOffer = offer.id;
  remove.setAttribute('aria-label', `Remove ${product.name} from ${supplier.name}`);
  rowViews.set(item.offerId, {
    check, quantity, error, tier, unit: product.unit,
    price: find('.cart-unit-price'), subtotal: find('.cart-item-subtotal'), savings: find('.cart-item-savings'),
  });
  return row;
}

function renderGroup(supplierId) {
  const supplier = suppliersById.get(supplierId);
  const group = byId('cart-group-template').content.firstElementChild.cloneNode(true);
  const name = group.querySelector('.cart-supplier-name');
  const check = group.querySelector('.select-supplier');
  name.append(supplierLink(supplierId));
  name.id = `supplier-${supplierId}`;
  group.setAttribute('aria-labelledby', name.id);
  check.dataset.selectSupplier = supplierId;
  check.setAttribute('aria-label', `Select all offers from ${supplier.name}`);
  const fulfillment = group.querySelector('.cart-fulfillment');
  fulfillment.dataset.fulfillment = supplierId;
  fulfillment.setAttribute('aria-label', `Fulfillment for ${supplier.name}`);
  const view = { fulfillment, shipment: group.querySelector('.cart-shipment'), distance: group.querySelector('.cart-supplier-distance'), check, items: group.querySelector('.cart-group-items'), subtotal: group.querySelector('.supplier-subtotal') };
  groupViews.set(supplierId, view);
  groups.append(group);
  return view;
}

function activeLines(items) {
  const inventory = readInventory();
  return items.map(item => getCartLine(item, drafts.get(item.offerId) ?? item.quantity, inventory));
}

function renderValues() {
  const lines = activeLines(snapshot.items);
  const totals = summarizeCart(lines);
  const bySupplier = new Map();
  for (const line of lines) {
    const supplierId = line.offer.supplierId;
    if (!bySupplier.has(supplierId)) bySupplier.set(supplierId, []);
    bySupplier.get(supplierId).push(line);

    const view = rowViews.get(line.offerId);
    view.check.checked = line.selected;
    const invalid = Boolean(line.error);
    if (invalid) view.quantity.setAttribute('aria-invalid', 'true');
    else view.quantity.removeAttribute('aria-invalid');
    view.error.hidden = !invalid;
    view.error.textContent = invalid ? quantityError(line.offer, view.unit, line.error) : '';
    view.price.textContent = invalid ? '—' : `${formatPrice(line.unitPrice)}/${view.unit}`;
    view.subtotal.textContent = invalid ? '—' : formatPrice(line.subtotal);
    view.savings.textContent = invalid ? '—' : formatPrice(line.savings);
    view.tier.hidden = invalid;
    view.tier.textContent = line.nextTier
      ? `Add ${formatQuantity(offsetQuantity(line.nextTier.minimumQuantity, -line.quantity), view.unit)} to reach ${formatPrice(line.nextTier.unitPriceCentavos)}/${view.unit}.`
      : 'Highest available pricing tier reached.';
  }

  for (const [supplierId, supplierLines] of bySupplier) {
    const view = groupViews.get(supplierId);
    const supplierTotals = summarizeCart(supplierLines);
    updateCheck(view.check, supplierTotals.selected, supplierLines.length);
    view.subtotal.textContent = formatPrice(supplierTotals.subtotal);
  }
  const buyer = getBuyer();
  const estimate = estimateShipments(lines, buyer, choices);
  const shippingGroups = new Map(estimate.groups.map(group => [group.supplier.id, group]));
  const quote = value => value == null ? '—' : formatPrice(value);
  byId('cart-delivery').textContent = quote(estimate.deliveryTotal);
  byId('cart-payable').textContent = quote(estimate.payable);
  for (const [supplierId, view] of groupViews) {
    const supplier = suppliersById.get(supplierId);
    const group = shippingGroups.get(supplierId);
    view.shipment.hidden = !group;
    const distance = calculateSupplierDistance(supplier.location, buyer);
    view.distance.textContent = `${supplier.location.label} · ${distance.toFixed(1)} km straight-line`;
    if (!group) continue;
    renderFulfillmentOptions(view.fulfillment, group);
    view.shipment.querySelector('.cart-delivery-feedback').textContent = fulfillmentMessage(group);
    view.shipment.querySelector('.cart-supplier-fee').textContent = quote(group.fulfillment?.fee);
    view.shipment.querySelector('.cart-supplier-total').textContent = quote(group.fulfillment?.fee == null || group.totals.invalid
      ? null : group.totals.subtotal + group.fulfillment.fee);
  }
  updateCheck(selectAll, totals.selected, lines.length);
  byId('cart-line-count').textContent = `${lines.length} supplier ${lines.length === 1 ? 'offer' : 'offers'}`;
  byId('summary-selection').textContent = `${totals.selected} of ${lines.length} offers selected`;
  byId('summary-subtotal').textContent = formatPrice(totals.subtotal);
  byId('summary-savings').textContent = formatPrice(totals.savings);
  const warning = byId('checkout-warning');
  warning.hidden = totals.invalid === 0 && (totals.selected === 0 || snapshot.persistent);
  warning.textContent = totals.invalid
    ? 'Selected offers with invalid quantities are excluded from the totals. Correct or deselect them to continue.'
    : snapshot.persistent ? '' : 'Enable browser storage to carry this selection to checkout.';
  checkout.disabled = !totals.selected || Boolean(totals.invalid) || !snapshot.persistent;

  const storageNote = byId('cart-storage-note');
  const notices = [];
  if (!snapshot.persistent) notices.push('Browser storage is unavailable. This cart is temporary.');
  if (snapshot.repaired) notices.push('Some saved cart entries were invalid or duplicated. Review the remaining offers.');
  storageNote.hidden = notices.length === 0;
  storageNote.textContent = notices.join(' ');
  updateCartCount(snapshot.items);
}

function renderCart(next = cartStore.read()) {
  snapshot = next;
  groups.replaceChildren();
  rowViews.clear();
  groupViews.clear();
  const hasItems = snapshot.items.length > 0;
  empty.hidden = hasItems;
  layout.hidden = !hasItems;

  for (const item of snapshot.items) {
    const supplierId = offersById.get(item.offerId).supplierId;
    const view = groupViews.get(supplierId) ?? renderGroup(supplierId);
    view.items.append(renderRow(item));
  }
  renderValues();
}

function updateSnapshot(next) {
  if (next.items.length !== rowViews.size || next.items.some(item => !rowViews.has(item.offerId))) {
    renderCart(next);
  } else {
    snapshot = next;
    renderValues();
  }
}

groups.addEventListener('input', async event => {
  const field = event.target;
  const id = field.dataset.quantityOffer;
  if (!id) return;
  const quantity = field.valueAsNumber;
  drafts.set(id, quantity);
  const next = await withMarketWrite(() => cartStore.updateQuantity(id, quantity));
  if (next.error === 'storage') { say('The cart could not be updated. Try again.'); return; }
  if (next.error === 'missing-offer') {
    drafts.delete(id);
    renderCart(next);
    say('This offer is no longer in your cart.');
    byId('cart-title').focus();
    return;
  }
  if (!next.error && Object.is(drafts.get(id), quantity)) drafts.delete(id);
  updateSnapshot(next);
});

layout.addEventListener('change', async event => {
  const field = event.target;
  if (field.dataset.fulfillment) {
    saveFulfillmentChoice(choices, field.dataset.fulfillment, field.value);
    renderValues();
    return;
  }
  if (field.type !== 'checkbox') return;
  let ids;
  if (field === selectAll) ids = snapshot.items.map(item => item.offerId);
  else if (field.dataset.selectSupplier) {
    ids = snapshot.items.filter(item => offersById.get(item.offerId).supplierId === field.dataset.selectSupplier).map(item => item.offerId);
  } else if (field.dataset.selectOffer) ids = [field.dataset.selectOffer];
  if (!ids) return;
  const checked = field.checked;
  const next = await withMarketWrite(() => cartStore.select(ids, checked));
  if (next.error) { renderCart(); say('The selection could not be updated. Try again.'); return; }
  updateSnapshot(next);
});

groups.addEventListener('click', async event => {
  const button = event.target.closest('[data-remove-offer]');
  if (!button) return;
  const id = button.dataset.removeOffer;
  const index = snapshot.items.findIndex(item => item.offerId === id);
  const product = productsById.get(offersById.get(id).productId);
  drafts.delete(id);
  const next = await withMarketWrite(() => cartStore.remove(id));
  if (next.error) { say('The offer could not be removed. Try again.'); return; }
  renderCart(next);
  say(`${product.name} was removed from your cart.`);
  const nextItem = snapshot.items[Math.min(index, snapshot.items.length - 1)];
  (rowViews.get(nextItem?.offerId)?.check ?? byId('cart-title')).focus();
});

checkout.addEventListener('click', async () => {
  // Validate the latest saved cumulative quantities before moving to checkout.
  const latest = await withMarketWrite(() => cartStore.read());
  if (latest.error) { say('Checkout is unavailable. Try again.'); return; }
  const totals = summarizeCart(activeLines(latest.items));
  if (!totals.selected || totals.invalid || !latest.persistent) {
    const changed = JSON.stringify(latest.items) !== JSON.stringify(snapshot.items);
    if (changed) {
      drafts.clear();
      renderCart(latest);
    }
    checkout.disabled = true;
    say('Review the selected cart quantities before continuing.');
    return;
  }
  window.location.assign('checkout.html');
});

function refreshCart() {
  drafts.clear();
  renderCart();
}

window.addEventListener('storage', event => {
  if (event.key === fulfillmentKey) {
    choices = readFulfillmentChoices();
    renderValues();
  }
  if (event.key === cartStorageKey || event.key === null) refreshCart();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) { choices = readFulfillmentChoices(); refreshCart(); }
});
renderCart();
