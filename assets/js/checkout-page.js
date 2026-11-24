import { orderStore, selectionSignature, serializeOrderWrite } from './order-store.js';
import { fillLocationSelect } from './locations.js';
import { fulfillmentKey, readFulfillmentChoices, saveFulfillmentChoice } from './delivery.js';
import { fulfillmentMessage, renderFulfillmentOptions } from './fulfillment-ui.js';
import { productsById } from './catalog-records.js';
import { cartStorageKey, cartStore } from './cart-store.js';
import { buildCheckout, paymentMethods } from './checkout.js';
import { formatPrice, formatQuantity, initializeMarketplace, offerUrl, showProductImage, supplierLink, updateCartCount } from './marketplace-ui.js';

const byId = id => document.getElementById(id);
const form = byId('checkout-form');
const fields = form.elements;
const groupsElement = byId('checkout-groups');
const status = byId('checkout-status');
const submit = byId('place-order');
const requestId = crypto.randomUUID();
let submitting = false;
let choices = readFulfillmentChoices();
const groupViews = new Map();
let snapshot;
let model;

const getBuyer = initializeMarketplace(() => {
  fields.city.value = getBuyer().id;
  if (snapshot) recalculate(true);
});
fillLocationSelect(fields.city);
fields.city.value = getBuyer().id;

function setStatus(message) {
  status.textContent = message;
  status.hidden = !message;
}

function renderGroup(group) {
  const { supplier, lines, totals } = group;
  const node = byId('checkout-group-template').content.firstElementChild.cloneNode(true);
  const find = selector => node.querySelector(selector);
  const title = find('.checkout-supplier-name');
  title.id = `fulfillment-${supplier.id}`;
  title.append(supplierLink(supplier.id));
  node.setAttribute('aria-labelledby', title.id);
  node.dataset.supplierId = supplier.id;
  find('.checkout-supplier-location').textContent = supplier.location.label;
  for (const line of lines) {
    const { offer } = line;
    const product = productsById.get(offer.productId);
    const row = byId('checkout-line-template').content.firstElementChild.cloneNode(true);
    row.dataset.offerId = offer.id;
    const link = row.querySelector('.checkout-product');
    link.href = offerUrl(offer.id);
    link.textContent = product.name;
    showProductImage(row.querySelector('.checkout-thumbnail'), product, { decorative: true, offer });
    row.querySelector('.checkout-line-price').textContent = line.error
      ? `${formatQuantity(line.quantity, product.unit)} · Review quantity in cart`
      : `${formatQuantity(line.quantity, product.unit)} × ${formatPrice(line.unitPrice)}/${product.unit}`;
    row.querySelector('.checkout-line-subtotal').textContent = line.error ? '—' : formatPrice(line.subtotal);
    find('.checkout-lines').append(row);
  }
  find('.supplier-checkout-subtotal strong').textContent = totals.invalid ? '—' : formatPrice(totals.subtotal);
  const select = find('.fulfillment-select');
  const feedback = find('.fulfillment-feedback');
  select.id = `delivery-${supplier.id}`;
  select.dataset.fulfillment = supplier.id;
  select.setAttribute('aria-label', `Fulfillment method for ${supplier.name}`);
  feedback.id = `delivery-feedback-${supplier.id}`;
  select.setAttribute('aria-describedby', feedback.id);
  find('.fulfillment-label').htmlFor = select.id;
  const [start, end] = supplier.delivery.leadTimeHours;
  find('.supplier-schedule').textContent = `Lead time ${start}–${end} hours · ${supplier.operatingHours}`;
  const provincial = supplier.delivery.coverage.slice(17);
  find('.supplier-coverage').textContent = `Coverage: Metro Manila${provincial.length ? ` · ${provincial.join(', ')}` : ''}.`;
  groupViews.set(supplier.id, { select, feedback });
  groupsElement.append(node);
}

function updateFulfillment(group, rebuildOptions) {
  const { select, feedback } = groupViews.get(group.supplier.id);
  if (rebuildOptions) {
    renderFulfillmentOptions(select, group);
    select.setCustomValidity('');
  }
  feedback.dataset.unavailable = String(!group.fulfillment || group.fulfillment.fee === null);
  feedback.textContent = fulfillmentMessage(group);

}

function updateSummary() {
  const { totals, cartError, groups, deliveryTotal, payable } = model;
  const show = (id, value) => { byId(id).textContent = value === null ? '—' : formatPrice(value); };
  show('checkout-merchandise', cartError ? null : totals.subtotal);
  show('checkout-savings', cartError ? null : totals.savings);
  show('checkout-delivery', deliveryTotal);
  show('checkout-payable', payable);
  byId('supplier-fees').replaceChildren(...groups.map(group => {
    const row = document.createElement('li');
    const name = supplierLink(group.supplier.id);
    const fee = document.createElement('strong');
    fee.textContent = group.fulfillment?.fee != null ? formatPrice(group.fulfillment.fee) : '—';
    row.append(name, fee);
    return row;
  }));
  const delivering = groups.some(group => group.fulfillment && group.fulfillment.method !== 'Pickup');
  fields.address.required = fields.barangay.required = delivering;
  if (!delivering) {
    fields.address.setCustomValidity('');
    fields.barangay.setCustomValidity('');
  }
  submit.disabled = submitting || Boolean(cartError);
}

function recalculate(rebuildOptions = false) {
  model = buildCheckout(snapshot.items, getBuyer(), choices);
  for (const group of model.groups) updateFulfillment(group, rebuildOptions);
  updateSummary();
}

function render(next, changed = false) {
  snapshot = next;
  updateCartCount(snapshot.items);
  model = buildCheckout(snapshot.items, getBuyer(), choices);
  const { cartError, groups } = model;
  form.hidden = cartError === 'empty';
  byId('checkout-empty').hidden = cartError !== 'empty';
  groupsElement.replaceChildren();
  groupViews.clear();
  for (const group of groups) {
    renderGroup(group);
    updateFulfillment(group, true);
  }
  updateSummary();

  if (!snapshot.persistent) setStatus('Browser storage is unavailable. Return to the cart to review your selection.');
  else if (cartError === 'invalid-quantity') setStatus('A selected offer no longer meets its stock or quantity rules. Return to the cart to correct or deselect it.');
  else if (changed) setStatus('Your cart selection changed. Review the offers and fees before continuing.');
  else if (snapshot.repaired) setStatus('Some saved cart entries needed review. Check the remaining offers before continuing.');
  else setStatus('');
}

function refresh() {
  const latest = cartStore.read();
  if (selectionSignature(latest.items) !== selectionSignature(snapshot.items) || latest.persistent !== snapshot.persistent) {
    render(latest, true);
  } else {
    updateCartCount(latest.items);
  }
}

form.addEventListener('input', event => {
  const field = event.target;
  if (!field.matches('input, textarea')) return;
  field.setCustomValidity('');
});
form.addEventListener('change', event => {
  const select = event.target;
  if (select === fields.city) {
    const header = byId('buyer-location');
    header.value = select.value;
    header.dispatchEvent(new Event('change'));
    return;
  }
  if (!select.dataset.fulfillment) return;
  saveFulfillmentChoice(choices, select.dataset.fulfillment, select.value);
  select.setCustomValidity('');
  recalculate();
});

function validateBuyer() {
  for (const field of [fields.business, fields.contact, fields.address, fields.barangay]) {
    field.setCustomValidity(field.required && field.value && !field.value.trim() ? 'Enter a value for this field.' : '');
  }
  const phone = fields.phone.value.trim();
  const validPhone = /^\+?[\d ().-]+$/.test(phone) && /^\d{7,15}$/.test(phone.replace(/\D/g, ''));
  fields.phone.setCustomValidity(fields.phone.value && !validPhone ? 'Enter a contact number with 7 to 15 digits.' : '');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submitting) return;
  const latest = cartStore.read();
  if (selectionSignature(latest.items) !== selectionSignature(snapshot.items) || !latest.persistent) {
    render(latest, true);
    if (!status.hidden) status.focus();
    return;
  }
  recalculate();
  if (model.cartError) {
    render(latest);
    if (!status.hidden) status.focus();
    return;
  }
  validateBuyer();
  for (const group of model.groups) {
    const { select } = groupViews.get(group.supplier.id);
    select.setCustomValidity(group.fulfillment?.fee != null ? '' : 'Choose a quoted delivery option or pickup before continuing.');
  }
  if (!form.reportValidity()) return;
  const payment = new FormData(form).get('payment');
  if (!paymentMethods.includes(payment) || model.payable === null) {
    setStatus('Choose a simulated payment method and a fulfillment method for each supplier.');
    status.focus();
    return;
  }
  submitting = true;
  submit.disabled = true;
  const buyer = Object.fromEntries(new FormData(form));
  const request = {
    requestId, buyer: { ...buyer, invoice: buyer.invoice === 'on' }, payment,
    selection: selectionSignature(latest.items), destinationId: getBuyer().id,
    methods: new Map(choices), expectedPayable: model.payable,
  };
  const result = await serializeOrderWrite(() => orderStore.place(request));
  if (result.order) {
    window.location.replace(`order-confirmation.html?order=${encodeURIComponent(result.order.id)}`);
    return;
  }
  submitting = false;
  render(cartStore.read(), true);
  const errors = {
    storage: 'The order could not be saved. Check browser storage and try again. Your inventory and cart were not changed by this attempt.',
    'selection-changed': 'Your cart changed before submission. Review the selected offers and try again.',
    'estimate-changed': 'The order estimate changed. Review the updated totals and try again.',
    fulfillment: 'The selected fulfillment is no longer available. Review the supplier options.',
    buyer: 'Check required buyer information and try again.',
    empty: 'Select offers in the cart before placing an order.',
    'invalid-quantity': 'Stock or quantity limits changed. Review your cart before trying again.',
  };
  setStatus(errors[result.error] ?? 'The order could not be placed. Review checkout and try again.');
  status.focus();
});

window.addEventListener('storage', event => {
  if (event.key === fulfillmentKey) {
    choices = readFulfillmentChoices();
    recalculate(true);
  }
  if (event.key === cartStorageKey || event.key === null) refresh();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) { choices = readFulfillmentChoices(); refresh(); recalculate(true); }
});
render(cartStore.read());
