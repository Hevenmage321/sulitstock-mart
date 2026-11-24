import { offersById, productsById, suppliersById } from './catalog-records.js';
import { resolvePhoto } from './product-photos.js';
import { cartStore } from './cart-store.js';
import { marketStorageKey } from './market-state.js';
import { canCancel, nextSupplierStatus, orderStore, orderTab, reorderLines, paymentLabels, serializeOrderWrite, statusLabels, statusPath } from './order-store.js';
import { formatPrice, formatQuantity, initializeMarketplace, offerUrl, setMerchantLogo, showProductImage, supplierLink, updateCartCount } from './marketplace-ui.js';

const byId = id => document.getElementById(id);
const content = byId('order-content');
const notice = byId('order-notice');
const dialog = byId('demo-dialog');
const view = document.body.dataset.orderView;
const reference = new URLSearchParams(location.search).get('order');
const dateFormat = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
});
const tabs = [
  ['active', 'Active Orders', 'No active orders'],
  ['completed', 'Completed', 'No completed orders'],
  ['cancelled', 'Cancelled', 'No cancelled orders'],
];
let activeTab = 'active';
let returnFocus;
let busy = false;

initializeMarketplace(() => {});

function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function actionLink(label, href, primary = false) {
  const link = node('a', label, `button ${primary ? 'primary' : 'cart-outline'}`);
  link.href = href;
  return link;
}

function actionButton(label, action, groupId) {
  const button = node('button', label, 'button cart-outline');
  button.type = 'button';
  button.dataset.action = action;
  if (groupId) button.dataset.group = groupId;
  return button;
}

function orderStatus(order) {
  const states = new Set(order.suppliers.map(group => group.status));
  if (states.size === 1) return statusLabels[order.suppliers[0].status];
  const completed = order.suppliers.filter(group => group.status === 'completed').length;
  const cancelled = order.suppliers.filter(group => group.status === 'cancelled').length;
  return [completed ? `${completed} completed` : '', cancelled ? `${cancelled} cancelled` : '',
    order.suppliers.length > completed + cancelled ? `${order.suppliers.length - completed - cancelled} active` : '',
  ].filter(Boolean).join(' · ');
}

function dateLabel(value) {
  return dateFormat.format(new Date(value));
}

function displayLine(line) {
  const row = node('div', '', 'order-line');
  const photo = node('div', '', 'order-thumbnail');
  photo.append(node('img'), node('span', 'Photo unavailable', 'image-fallback'));
  photo.lastChild.hidden = true;
  const photoSource = line.image ?? resolvePhoto(productsById.get(line.productId), offersById.get(line.offerId));
  showProductImage(photo, { ...line, image: photoSource }, { decorative: true });
  const product = node('a', line.name, 'order-product');
  product.href = offerUrl(line.offerId);
  const amount = node('div', '', 'order-line-amount');
  amount.append(node('p', `${formatQuantity(line.quantity, line.unit)} × ${formatPrice(line.unitPrice)}/${line.unit}`, 'cart-muted'),
    node('strong', formatPrice(line.subtotal)));
  row.append(photo, product, amount);
  return row;
}

function displayTimeline(group) {
  const timeline = node('ol', '', 'order-timeline');
  timeline.setAttribute('aria-label', `Fulfillment tracking for ${group.name}`);
  const steps = group.status === 'cancelled' ? group.events.map(event => event.status) : statusPath(group.method);
  for (const step of steps) {
    const event = group.events.find(item => item.status === step);
    const point = node('li', '', event ? 'timeline-reached' : '');
    if (group.status === step) point.setAttribute('aria-current', 'step');
    point.append(node('strong', statusLabels[step]));
    if (event) point.append(node('span', dateLabel(event.at), 'cart-muted'));
    timeline.append(point);
  }
  return timeline;
}

function displaySupplier(group, order, track = false) {
  const section = node('section', '', 'cart-panel order-supplier');
  const heading = node('div', '', 'order-supplier-heading');
  const supplierName = node('h3', '', 'order-merchant');
  if (suppliersById.has(group.supplierId)) {
    const logo = node('img', '', 'merchant-logo');
    logo.alt = '';
    logo.width = logo.height = 32;
    logo.loading = 'lazy';
    setMerchantLogo(logo, group.supplierId);
    supplierName.append(logo);
  }
  supplierName.append(supplierLink(group.supplierId, group.name));
  heading.append(supplierName, node('span', statusLabels[group.status], 'order-badge'));
  section.append(heading, node('p', `${group.id} · ${group.methodLabel}`, 'cart-muted'));
  section.append(node('p', group.method === 'Pickup'
    ? `Pickup at ${group.location} · Lead time ${group.leadTimeHours.join('–')} hours`
    : `Deliver to ${order.destination} · Estimated lead time ${group.leadTimeHours.join('–')} hours`, 'cart-muted'));
  section.append(...group.lines.map(displayLine));
  section.append(node('p', `Merchandise ${formatPrice(group.subtotal)} · Delivery ${formatPrice(group.deliveryFee)} · Total ${formatPrice(group.subtotal + group.deliveryFee)}`, 'order-supplier-total'));
  if (track) {
    section.append(displayTimeline(group));
    const next = nextSupplierStatus(group);
    if (next) section.append(actionButton(`Demo: Advance to ${statusLabels[next]}`, 'advance', group.id));
  }
  return section;
}

function orderSummary(order) {
  const panel = node('aside', '', 'cart-panel order-summary');
  panel.append(node('h2', 'Order Summary'), node('p', orderStatus(order), 'order-badge'));
  const totals = node('dl', '', 'cart-totals');
  for (const [label, value] of [['Merchandise subtotal', order.subtotal], ['Wholesale savings', order.savings], ['Delivery fees', order.deliveryTotal], ['Order total', order.total]]) {
    const row = node('div');
    row.append(node('dt', label), node('dd', formatPrice(value)));
    totals.append(row);
  }
  panel.append(totals, node('p', paymentLabels[order.payment], 'order-payment'),
    node('p', orderStatus(order) === statusLabels.cancelled ? 'Cancelled · No payment collected' : 'Unpaid · Simulated payment', 'cart-muted'));
  if (order.suppliers.some(group => group.method !== 'Pickup')) {
    panel.append(node('p', `Delivery address: ${order.buyer.address}, ${order.buyer.barangay}, ${order.destination}`, 'cart-muted'));
  }
  if (order.buyer.invoice) panel.append(node('p', 'Sales invoice requested', 'cart-muted'));
  return panel;
}

function renderHistory(orders) {
  byId('order-subtitle').textContent = 'Simulated orders saved in this browser.';
  const tabList = node('div', '', 'order-tabs');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Order status');
  const panel = node('section');
  panel.id = 'order-tab-panel';
  panel.tabIndex = 0;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', `order-tab-${activeTab}`);
  const grouped = Object.fromEntries(tabs.map(([id]) => [id, orders.filter(order => orderTab(order) === id)]));
  for (const [id, label] of tabs) {
    const tab = node('button', `${label} (${grouped[id].length})`, 'order-tab');
    tab.type = 'button';
    tab.id = `order-tab-${id}`;
    tab.dataset.tab = id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.setAttribute('aria-selected', String(id === activeTab));
    tab.tabIndex = id === activeTab ? 0 : -1;
    tabList.append(tab);
  }
  content.append(tabList, panel);
  const current = grouped[activeTab];
  if (!current.length) {
    const empty = node('section', '', 'cart-panel empty-cart');
    empty.append(node('h2', tabs.find(([id]) => id === activeTab)[2]), actionLink('Continue Shopping', 'products.html', true));
    panel.append(empty);
    return;
  }
  for (const order of [...current].reverse()) {
    const card = node('article', '', 'cart-panel order-history-card');
    const header = node('div', '', 'order-supplier-heading');
    header.append(node('h2', order.id), node('span', orderStatus(order), 'order-badge'));
    card.append(header, node('p', dateLabel(order.createdAt), 'cart-muted'));
    for (const group of order.suppliers) card.append(displaySupplier(group, order));
    const actions = node('div', '', 'order-actions');
    const url = `order.html?order=${encodeURIComponent(order.id)}`;
    actions.append(node('strong', `Order total ${formatPrice(order.total)}`), actionLink('View Order', url));
    if (activeTab === 'active') actions.append(actionLink('Track Order', `${url}#order-tracking`, true));
    if (activeTab === 'completed') {
      const buy = actionButton('Buy Again', 'buy-again');
      buy.dataset.orderId = order.id;
      actions.append(buy);
    }
    card.append(actions);
    panel.append(card);
  }
}

function renderOrder(order) {
  if (!order) {
    byId('order-title').textContent = 'Order unavailable';
    byId('order-subtitle').textContent = 'This reference could not be found in this browser.';
    content.append(actionLink('View My Orders', 'orders.html', true));
    return;
  }
  const confirmation = view === 'confirmation';
  byId('order-title').textContent = confirmation ? 'Order placed successfully' : 'Order Details';
  byId('order-subtitle').textContent = `${order.id} · ${dateLabel(order.createdAt)} · Demo order`;
  const grid = node('div', '', 'cart-layout order-layout');
  const suppliers = node('div', '', 'cart-groups');
  if (!confirmation) suppliers.id = 'order-tracking';
  suppliers.append(...order.suppliers.map(group => displaySupplier(group, order, !confirmation)));
  grid.append(suppliers, orderSummary(order));
  const actions = node('div', '', 'order-actions order-tools');
  actions.append(actionLink('View My Orders', 'orders.html', true), actionLink('Continue Shopping', 'products.html'));
  if (!confirmation && canCancel(order)) actions.append(actionButton('Cancel Order', 'cancel'));
  content.append(grid, actions);
}

function render(message = '') {
  const { orders, error } = orderStore.read();
  notice.textContent = error ? 'Browser storage is unavailable or the demo order history could not be read.' : message;
  notice.hidden = !notice.textContent;
  content.replaceChildren();
  if (view === 'list') renderHistory(orders);
  else renderOrder(orders.find(order => order.id === reference));
  updateCartCount();
}

function selectTab(id) {
  activeTab = id;
  render();
  byId(`order-tab-${id}`).focus();
}

content.addEventListener('keydown', event => {
  const tab = event.target.closest('[data-tab]');
  if (!tab || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = tabs.findIndex(([id]) => id === tab.dataset.tab);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
    : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  selectTab(tabs[next][0]);
});

content.addEventListener('click', async event => {
  const tab = event.target.closest('[data-tab]');
  if (tab) {
    selectTab(tab.dataset.tab);
    return;
  }
  const control = event.target.closest('[data-action]');
  if (!control || busy) return;
  const { action, group } = control.dataset;
  if (action === 'buy-again') {
    busy = true;
    const result = await serializeOrderWrite(() => {
      const order = orderStore.read().orders.find(item => item.id === control.dataset.orderId);
      const lines = order ? reorderLines(order) : [];
      return lines.length ? cartStore.addMany(lines) : { error: 'not-eligible' };
    });
    busy = false;
    const count = result.added?.length ?? 0;
    const skipped = result.skipped?.map(line => line.name).join(', ');
    const message = result.error ? 'This order cannot be added to the cart.'
      : `${count ? `Added ${count} offer${count === 1 ? '' : 's'} at current prices.` : 'No offers were added.'}${skipped ? ` Skipped due to current quantity or stock limits: ${skipped}.` : ''}${count && !result.persistent ? ' The cart is temporary because browser storage is unavailable.' : ''}`;
    render(message);
    if (count && result.persistent) notice.append(' ', actionLink('View Cart', 'cart.html'));
    (content.querySelector(`[data-order-id="${CSS.escape(control.dataset.orderId)}"]`) ?? byId('order-title')).focus();
    return;
  }
  if (action === 'advance') {
    busy = true;
    const result = await serializeOrderWrite(() => orderStore.advance(reference, group));
    busy = false;
    render(result.error ? 'This supplier status can no longer advance.' : 'Demo supplier status updated.');
    (content.querySelector(`[data-group="${CSS.escape(group)}"]`) ?? byId('order-title')).focus();
    return;
  }
  returnFocus = control;
  dialog.returnValue = '';
  byId('demo-title').textContent = 'Cancel this order?';
  byId('demo-description').textContent = 'This cancels the whole order and restores supplier inventory if preparation has not started.';
  byId('confirm-action').textContent = 'Cancel Order';
  dialog.showModal();
});

dialog.addEventListener('close', async () => {
  if (dialog.returnValue !== 'confirm') {
    returnFocus?.focus();
    return;
  }
  busy = true;
  const result = await serializeOrderWrite(() => orderStore.cancel(reference));
  busy = false;
  render(result.error ? 'The requested change could not be saved or is no longer eligible.'
    : 'Order cancelled and supplier stock restored.');
  byId('order-title').focus();
});
window.addEventListener('storage', event => {
  if (event.key === marketStorageKey || event.key === null) render();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) render();
});
render();
if (location.hash === '#order-tracking') byId('order-tracking')?.scrollIntoView();
