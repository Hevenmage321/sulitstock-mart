import { categories, suppliers } from './data.js';
import { categoriesById, suppliersById } from './catalog-records.js';
import { catalogUrl, findCatalogOffers, locations, minimumBulkDiscount, readCatalogState, unitLabels, units, unitSorts } from './catalog.js';
import { initializeMarketplace, inventoryLabels, renderOffer, updateDistances } from './marketplace-ui.js';

const filterForm = document.querySelector('#filter-form');
const searchForm = document.querySelector('#marketplace-search');
const search = document.querySelector('#search');
const fields = filterForm.elements;
const sort = document.querySelector('#sort');
const filtersToggle = document.querySelector('#filter-toggle');
const activeFilters = document.querySelector('#active-filters');
const heading = document.querySelector('#results-heading');
const range = document.querySelector('#results-range');
const pageTitle = document.querySelector('#catalog-title');
const distanceOrigin = document.querySelector('#distance-origin');
const filterError = document.querySelector('#filter-error');
const grid = document.querySelector('#catalog-results');
const empty = document.querySelector('#empty-results');
const pagination = document.querySelector('#pagination');
const comparisonFields = [fields.minPrice, fields.maxPrice, fields.moq];
const numericFields = [fields.distance, ...comparisonFields];
const filterDelay = 300;
let filterTimer;
let state;
const getBuyerLocation = initializeMarketplace(() => {
  if (state.page !== 1 && (state.distance !== '' || ['nearest', 'farthest'].includes(state.sort))) {
    state.page = 1;
    history.replaceState(null, '', catalogUrl(state));
  }
  render();
}, render);

fields.category.append(...categories.map(category => new Option(category.label, category.id)));
fields.supplier.append(...[...suppliers].sort((a, b) => a.name.localeCompare(b.name))
  .map(supplier => new Option(supplier.name, supplier.id)));
fields.location.append(...locations.map(location => new Option(location, location)));
fields.unit.append(...units.map(unit => new Option(unitLabels[unit] ?? unit, unit)));

function updateSubcategories(value = '') {
  const subcategories = categoriesById.get(fields.category.value)?.subcategories ?? [];
  fields.subcategory.replaceChildren(new Option('All subcategories', ''),
    ...subcategories.map(item => new Option(item.label, item.id)));
  fields.subcategory.value = value;
  fields.subcategory.disabled = subcategories.length === 0;
}

function updateComparisonFields() {
  const disabled = !fields.unit.value;
  for (const field of comparisonFields) {
    field.disabled = disabled;
    if (disabled) field.value = '';
    field.removeAttribute('aria-invalid');
  }
}

function synchronizeForm() {
  for (const field of numericFields) field.removeAttribute('aria-invalid');
  search.value = state.q;
  fields.category.value = state.category;
  updateSubcategories(state.subcategory);
  for (const key of ['supplier', 'location', 'distance', 'unit', 'minPrice', 'maxPrice', 'moq', 'stock']) {
    fields[key].value = state[key];
  }
  fields.bulk.checked = Boolean(state.bulk);
  updateComparisonFields();
}

function synchronizeSort() {
  sort.value = state.sort;
  document.querySelector('#sort-unit-help').hidden = Boolean(state.unit);
  for (const option of sort.options) option.disabled = !state.unit && unitSorts.includes(option.value);
}

function addChip(key, label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button filter-chip';
  button.dataset.remove = key;
  button.textContent = `${label} ×`;
  button.setAttribute('aria-label', `Remove filter: ${label}`);
  activeFilters.append(button);
}

function renderActiveFilters() {
  activeFilters.replaceChildren();
  const category = categoriesById.get(state.category);
  const subcategory = category?.subcategories.find(item => item.id === state.subcategory);
  if (category) addChip('category', category.label);
  if (subcategory) addChip('subcategory', subcategory.label);
  if (state.supplier) addChip('supplier', suppliersById.get(state.supplier).name);
  if (state.location) addChip('location', state.location);
  if (state.distance !== '') addChip('distance', `≤ ${state.distance} km`);
  if (state.unit) addChip('unit', unitLabels[state.unit] ?? state.unit);
  if (state.minPrice !== '') addChip('minPrice', `From ₱${state.minPrice}/${state.unit} at MOQ`);
  if (state.maxPrice !== '') addChip('maxPrice', `Up to ₱${state.maxPrice}/${state.unit} at MOQ`);
  if (state.moq !== '') addChip('moq', `MOQ ≤ ${state.moq} ${state.unit}`);
  if (state.stock) addChip('stock', state.stock === 'available' ? 'In stock' : inventoryLabels[state.stock]);
  if (state.bulk) addChip('bulk', `Bulk savings ≥ ${minimumBulkDiscount}%`);
  activeFilters.hidden = !activeFilters.childElementCount;
  if (!activeFilters.hidden) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'button outline';
    clear.dataset.clear = '';
    clear.textContent = 'Clear All Filters';
    activeFilters.append(clear);
  }
}

function paginationLink(page, label, current) {
  const link = document.createElement('a');
  link.className = 'button outline';
  link.href = catalogUrl({ ...state, page });
  link.dataset.page = page;
  link.textContent = label;
  link.setAttribute('aria-label', `Page ${page}${label === String(page) ? '' : `, ${label.toLowerCase()}`}`);
  if (current) link.setAttribute('aria-current', 'page');
  return link;
}

function renderPagination(result) {
  pagination.replaceChildren();
  pagination.hidden = result.pageCount === 1;
  if (pagination.hidden) return;
  if (result.page > 1) pagination.append(paginationLink(result.page - 1, 'Previous', false));
  for (let page = 1; page <= result.pageCount; page += 1) {
    pagination.append(paginationLink(page, String(page), page === result.page));
  }
  if (result.page < result.pageCount) pagination.append(paginationLink(result.page + 1, 'Next', false));
}

function render() {
  const buyer = getBuyerLocation();
  const result = findCatalogOffers(state, buyer);
  if (result.page !== state.page) {
    state.page = result.page;
    history.replaceState(null, '', catalogUrl(state));
  }
  synchronizeSort();
  renderActiveFilters();
  pageTitle.textContent = categoriesById.get(state.category)?.label ?? 'All Products';
  distanceOrigin.textContent = `Supplier distances from your selected buyer location: ${buyer.label}.`;
  const count = `${result.total} supplier ${result.total === 1 ? 'offer' : 'offers'}`;
  heading.textContent = state.q ? `${count} for “${state.q}”` : count;
  range.textContent = result.total
    ? `Showing ${result.offset + 1}–${result.offset + result.offers.length} of ${result.total}`
    : '';
  grid.replaceChildren(...result.offers.map(renderOffer));
  updateDistances(buyer);
  empty.hidden = result.total > 0;
  const emptyClear = empty.querySelector('[data-clear]');
  emptyClear.hidden = activeFilters.hidden;
  renderPagination(result);
}

function currentState() {
  return readCatalogState(new URLSearchParams(window.location.search));
}

function resetFilterTimer() {
  clearTimeout(filterTimer);
}

function navigate(next, { focusResults = false, keepForm = false } = {}) {
  resetFilterTimer();
  state = readCatalogState(new URL(catalogUrl(next), window.location.href).searchParams);
  const url = catalogUrl(state);
  if (new URL(url, window.location.href).href !== window.location.href) history.pushState(null, '', url);
  if (!keepForm) {
    synchronizeForm();
    filterError.hidden = true;
  }
  render();
  if (focusResults) {
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: 'start' });
  }
}

function readFilters() {
  const filters = Object.fromEntries(new FormData(filterForm));
  let message = '';
  for (const field of numericFields) {
    if (field.disabled) continue;
    if (!field.validity.valid) {
      message = 'Enter a valid, nonnegative number in the highlighted field.';
      filters[field.name] = state[field.name];
      field.setAttribute('aria-invalid', 'true');
    } else {
      filters[field.name] = field.value === '' ? '' : field.valueAsNumber;
      field.removeAttribute('aria-invalid');
    }
  }
  if (typeof filters.minPrice === 'number' && typeof filters.maxPrice === 'number' && filters.minPrice > filters.maxPrice) {
    message = 'Enter a maximum price at or above the minimum.';
    fields.maxPrice.setAttribute('aria-invalid', 'true');
    filters.minPrice = state.minPrice;
    filters.maxPrice = state.maxPrice;
  }
  filterError.textContent = message;
  filterError.hidden = !message;
  return { ...filters, bulk: filters.bulk ?? '' };
}

function applyFilters() {
  navigate({ q: state.q, sort: state.sort, ...readFilters() }, { keepForm: true });
}

function clearFilters() {
  navigate({ q: state.q, sort: unitSorts.includes(state.sort) ? '' : state.sort }, { focusResults: true });
}

filterForm.addEventListener('change', event => {
  const field = event.target;
  if (numericFields.includes(field)) return;
  if (field === fields.category) updateSubcategories();
  if (field === fields.unit) {
    for (const comparisonField of comparisonFields) comparisonField.value = '';
    updateComparisonFields();
  }
  applyFilters();
});
filterForm.addEventListener('input', event => {
  if (!numericFields.includes(event.target)) return;
  resetFilterTimer();
  filterTimer = setTimeout(applyFilters, filterDelay);
});
filterForm.addEventListener('submit', event => {
  event.preventDefault();
  applyFilters();
});

searchForm.addEventListener('submit', event => {
  event.preventDefault();
  navigate({ sort: state.sort, ...readFilters(), q: search.value }, { focusResults: true });
});
sort.addEventListener('change', () => navigate({ q: state.q, ...readFilters(), sort: sort.value }, { keepForm: true }));
document.querySelector('.catalog').addEventListener('click', event => {
  if (event.target.closest('[data-clear]')) clearFilters();
  const chip = event.target.closest('[data-remove]');
  if (chip) navigate({ ...state, [chip.dataset.remove]: '', page: 1 }, { focusResults: true });
});
pagination.addEventListener('click', event => {
  const link = event.target.closest('[data-page]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  navigate({ ...state, page: Number(link.dataset.page) }, { focusResults: true });
});

filtersToggle.addEventListener('click', () => {
  filtersToggle.setAttribute('aria-expanded', filtersToggle.getAttribute('aria-expanded') === 'false');
});
function closeFilters() {
  filtersToggle.setAttribute('aria-expanded', 'false');
  filtersToggle.focus();
}

document.querySelector('#filter-close').addEventListener('click', closeFilters);
document.querySelector('#catalog-filters').addEventListener('keydown', event => {
  if (event.key === 'Escape' && filtersToggle.getClientRects().length) closeFilters();
});
window.addEventListener('popstate', () => {
  resetFilterTimer();
  state = currentState();
  synchronizeForm();
  filterError.hidden = true;
  render();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    state = currentState();
    synchronizeForm();
  }
});
state = currentState();
synchronizeForm();
render();
