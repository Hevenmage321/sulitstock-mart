import { findCatalogOffers, readCatalogState } from './catalog.js';
import { categoriesById, productsById, suppliersById } from './catalog-records.js';
import { locationsById, metroManilaIds } from './locations.js';
import { readInventory } from './market-state.js';
import { getOffersBySupplier, getReachablePricingTiers } from './procurement.js';
import { formatQuantity, initializeMarketplace, renderOffer, setMerchantLogo, setSupplierContact, supplierLink, supplierUrl, updateDistances } from './marketplace-ui.js';
import { availableProductCount, deliversTo, findSuppliers, purchasingPolicies } from './supplier-directory.js';

const byId = id => document.getElementById(id);
const storefront = byId('storefront');
const params = new URLSearchParams(location.search);
const supplier = suppliersById.get(params.get('id'));
const form = byId('supplier-filters');
const resultList = byId('supplier-results');
const number = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 });

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function leadTime(record) {
  return `${record.delivery.leadTimeHours.join('–')} hours`;
}

function coverageLabel(record) {
  const provincial = record.delivery.coverageIds.filter(id => locationsById.get(id).province !== 'Metro Manila');
  const metro = record.delivery.coverageIds.filter(id => locationsById.get(id).province === 'Metro Manila');
  const metroLabels = metro.length === metroManilaIds.length ? ['Metro Manila'] : metro.map(id => locationsById.get(id).city);
  return [...metroLabels, ...provincial.map(id => locationsById.get(id).label)].join(' · ');
}

function deliveryStatus(record, buyer) {
  return deliversTo(record, buyer) ? `Delivery available to ${buyer.label}` : `Outside delivery coverage for ${buyer.label}`;
}

function supplierFacts(entries) {
  return entries.map(([label, value]) => {
    const row = node('div');
    row.append(node('dt', label), node('dd', value));
    return row;
  });
}

function directoryCard({ supplier: record, categoryLabels, km }, inventory, buyer) {
  const card = node('article', '', 'directory-card');
  card.dataset.supplierId = record.id;
  const head = node('header');
  const image = node('img');
  image.alt = '';
  image.width = image.height = 64;
  image.className = 'merchant-logo';
  setMerchantLogo(image, record.id);
  const title = node('div');
  const heading = node('h2');
  heading.append(supplierLink(record.id));
  title.append(node('p', record.type, 'supplier-muted'), heading, node('p', 'Fictional demo supplier', 'supplier-muted'));
  head.append(image, title);

  const facts = node('dl');
  const count = availableProductCount(record.id, inventory);
  const location = `${record.location.label} · ${number.format(km)} km`;
  facts.append(...supplierFacts([
    ['Location', location],
    ['Categories', categoryLabels.join(' · ')],
    ['Available products', String(count)],
    ['Delivery coverage', coverageLabel(record)],
    ['Delivery lead time', leadTime(record)],
  ]));

  const actions = node('div', '', 'supplier-actions');
  const view = node('a', 'View Supplier', 'button primary');
  view.href = supplierUrl(record.id);
  view.setAttribute('aria-label', `View Supplier: ${record.name}`);
  const contact = node('button', 'Contact Supplier', 'button supplier-outline');
  contact.type = 'button';
  contact.dataset.demo = 'contact';
  setSupplierContact(contact, record);
  actions.append(view, contact);
  card.append(head, node('p', record.description), facts, node('p', deliveryStatus(record, buyer), 'supplier-delivery-note'), actions);
  return card;
}

const categories = supplier ? [...new Set(getOffersBySupplier(supplier.id).map(offer =>
  productsById.get(offer.productId).categoryId))].map(id => categoriesById.get(id)) : [];
const shopSections = new Map([
  ['home', 'Home'],
  ['all-products', 'All Products'],
  ...categories.map(category => [`category-${category.id}`, category.label]),
  ['about', 'About'],
]);

function selectedSection() {
  const section = location.hash.slice(1);
  return shopSections.has(section) ? section : 'home';
}

function renderShelves(offers) {
  const featured = offers.filter(offer => getReachablePricingTiers(offer).length)
    .sort((a, b) => Number(Boolean(productsById.get(b.productId).image)) - Number(Boolean(productsById.get(a.productId).image)))
    .slice(0, 5);
  const deals = offers.flatMap(offer => {
    const tiers = getReachablePricingTiers(offer);
    if (tiers.length < 2) return [];
    const first = tiers[0].unitPriceCentavos;
    const tier = tiers.at(-1);
    return [{ offer, tier, savings: (first - tier.unitPriceCentavos) / first }];
  }).sort((a, b) => b.savings - a.savings).slice(0, 5);
  byId('store-featured').replaceChildren(...featured.map(renderOffer));
  byId('store-deals').replaceChildren(...deals.map(({ offer, tier, savings }) => {
    const card = renderOffer(offer);
    const quantity = formatQuantity(tier.minimumQuantity, productsById.get(offer.productId).unit);
    const label = node('p', `Save ${Math.floor(savings * 100)}% at ${quantity}`, 'store-deal-label');
    card.querySelector('.offer-price').after(label);
    return card;
  }));
  byId('store-featured-empty').hidden = featured.length > 0;
  byId('store-deals-empty').hidden = deals.length > 0;
}

function renderStore(buyer, filters) {
  const section = selectedSection();
  for (const tab of byId('store-tabs').children) {
    const active = tab.hash === `#${section}`;
    if (active) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  const category = section.startsWith('category-') ? section.slice('category-'.length) : '';
  const catalog = section === 'all-products' || Boolean(category);
  byId('store-home').hidden = section !== 'home';
  byId('store-about').hidden = section !== 'about';
  byId('store-catalog').hidden = !catalog;
  byId('store-delivery-status').textContent = deliveryStatus(supplier, buyer);

  const offers = getOffersBySupplier(supplier.id);
  if (section === 'home') renderShelves(offers);
  if (catalog) {
    byId('store-category-filter').hidden = Boolean(category);
    byId('store-products').textContent = category ? categoriesById.get(category).label : 'All Products';
    filters.set('supplier', supplier.id);
    if (category) filters.set('category', category);
    const matches = findCatalogOffers(readCatalogState(filters), buyer, Math.max(1, offers.length));
    resultList.replaceChildren(...matches.offers.map(renderOffer));
    byId('supplier-count').textContent = `${matches.total} ${matches.total === 1 ? 'offer' : 'offers'} found`;
    byId('distance-note').textContent = `Straight-line estimates from ${buyer.label}.`;
    byId('supplier-empty').hidden = matches.total > 0;
  }
  updateDistances(buyer);
}

function renderResults() {
  if (storefront && !supplier) return;
  const buyer = getBuyer();
  const filters = new URLSearchParams(new FormData(form));
  if (storefront) {
    renderStore(buyer, filters);
    return;
  }
  const matches = findSuppliers(Object.fromEntries(filters), buyer);
  const inventory = readInventory();
  resultList.replaceChildren(...matches.map(result => directoryCard(result, inventory, buyer)));
  byId('supplier-count').textContent = `${matches.length} ${matches.length === 1 ? 'supplier' : 'suppliers'} found`;
  byId('distance-note').textContent = `Straight-line estimates from ${buyer.label}.`;
  byId('supplier-empty').hidden = matches.length > 0;
}

const getBuyer = initializeMarketplace(renderResults, renderResults);

function populateFilters() {
  const options = (storefront ? [...categories] : [...categoriesById.values()])
    .sort((a, b) => a.label.localeCompare(b.label, 'en-PH'));
  form.elements.category.append(...options.map(entry => new Option(entry.label, entry.id)));
  if (!storefront) {
    const types = [...new Set([...suppliersById.values()].map(record => record.type))].sort();
    form.elements.type.append(...types.map(type => new Option(type, type)));
  }
}

function populateStorefront(record) {
  document.title = `${record.name} | SulitStock Mart`;
  byId('store-crumb').textContent = byId('store-name').textContent = record.name;
  byId('store-type').textContent = record.type;
  byId('store-location').textContent = record.location.label;
  byId('store-distance').dataset.distanceSupplier = record.id;
  byId('store-total').textContent = new Set(getOffersBySupplier(record.id).map(offer => offer.productId)).size;
  byId('store-lead').textContent = leadTime(record);
  byId('store-hours').textContent = record.operatingHours;
  byId('store-methods').textContent = record.delivery.methods.join(' · ');
  setMerchantLogo(byId('store-image'), record.id);
  byId('store-description').textContent = record.description;
  byId('store-policy').textContent = purchasingPolicies[record.id];
  byId('store-facts').append(...supplierFacts([
    ['Covered locations', record.delivery.coverage.join(' · ')],
    ['Fulfillment methods', record.delivery.methods.join(' · ')],
  ]));
  setSupplierContact(storefront.querySelector('[data-demo="contact"]'), record);
  byId('store-tabs').append(...[...shopSections].map(([section, label]) => {
    const link = node('a', label);
    link.href = `#${section}`;
    return link;
  }));
  storefront.hidden = false;
  window.addEventListener('hashchange', renderResults);
}

if (storefront && !supplier) {
  byId('missing-supplier').hidden = false;
} else {
  if (storefront) populateStorefront(supplier);
  populateFilters();
  form.addEventListener('submit', event => event.preventDefault());
  form.addEventListener('input', renderResults);
  form.addEventListener('reset', () => queueMicrotask(renderResults));
  renderResults();
}
