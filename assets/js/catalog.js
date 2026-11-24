import { applyInventory, readInventory } from './market-state.js';
import { offers, products, suppliers } from './data.js';
import { categoriesById, productsById, suppliersById } from './catalog-records.js';
import { calculateSupplierDistance, getInventoryStatus, getWholesalePriceRange } from './procurement.js';

export const pageSize = 20;
export const unitLabels = {
  kg: 'Kilogram (kg)', g: 'Gram (g)', L: 'Liter (L)', sack: 'Sack', box: 'Box', pack: 'Pack',
};
export const units = [...new Set(products.map(product => product.unit))];
export const locations = [...new Set(suppliers.map(supplier => supplier.location.label))].sort();
export const unitSorts = ['price-asc', 'price-desc', 'moq'];
export const sortOptions = ['nearest', 'farthest', 'name', ...unitSorts];
export const minimumBulkDiscount = 15;

const aliases = {
  'rice-vermicelli': 'bihon pancit noodles',
  'tilapia': 'fish',
  'squid': 'pusit calamari',
  'pechay': 'bok choy pak choi',
  'cooking-oil': 'frying oil',
  'soy-sauce': 'toyo',
  'cane-vinegar': 'suka',
  'fish-sauce': 'patis',
  'glutinous-rice': 'malagkit sticky rice',
  'ground-pork': 'giniling minced pork',
  'ground-beef': 'giniling minced beef',
  'chicken-eggs': 'itlog',
  'french-fries': 'frozen potatoes',
  'kraft-lunch-box': 'takeout container meal box',
};

function normalize(text) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Match equivalent ingredient names by whole token before allowing prefix search.
const equivalentTerms = [
  ['chicken', 'chickens'], ['tomato', 'tomatoes'], ['potato', 'potatoes'],
  ['onion', 'onions', 'sibuyas'], ['shrimp', 'shrimps', 'prawn', 'prawns', 'hipon'],
  ['garlic', 'bawang'], ['rice', 'bigas'], ['bangus', 'milkfish'],
  ['eggplant', 'eggplants', 'talong'],
];
const equivalentWords = new Map(equivalentTerms.flatMap(group => group.map(term => [term, group])));
const ingredientWords = [...equivalentWords.keys()];

function expandTerms(words) {
  return [...new Set(words.flatMap(word => equivalentWords.get(word) ?? [word]))];
}

function searchWords(text) {
  return normalize(text).split(' ').filter(Boolean);
}

const catalogRows = offers.map(offer => {
  const product = productsById.get(offer.productId);
  const supplier = suppliersById.get(offer.supplierId);
  const category = categoriesById.get(product.categoryId);
  const subcategory = category.subcategories.find(item => item.id === product.subcategoryId);
  return {
    offer, product, supplier,
    taxonomy: [normalize(category.label), normalize(subcategory.label)],
    words: searchWords([product.name, product.description, supplier.name, category.label, subcategory.label, aliases[product.id]].join(' ')),
    ingredientTerms: expandTerms(searchWords([product.name, aliases[product.id]].join(' '))),
  };
});

const vocabulary = new Set(catalogRows.flatMap(row => row.words));
for (const row of catalogRows) {
  row.searchTerms = expandTerms(row.words);
}

function queryTerm(word) {
  if (equivalentWords.has(word)) return equivalentWords.get(word)[0];
  if (vocabulary.has(word)) return word;
  const singulars = [
    word.replace(/ies$/, 'y'), word.replace(/(?:s|x|z|ch|sh)es$/, ending => ending.slice(0, -2)),
    word.replace(/s$/, ''),
  ];
  return singulars.find(candidate => vocabulary.has(candidate)) ?? word;
}

function nonnegative(params, key, decimals) {
  const raw = params.get(key);
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw) || (raw.split('.')[1]?.length ?? 0) > decimals) return '';
  const value = Number(raw);
  return Number.isSafeInteger(Math.round(value * 10 ** decimals)) ? value : '';
}

export function readCatalogState(params) {
  const category = categoriesById.get(params.get('category'));
  const subcategory = category?.subcategories.find(item => item.id === params.get('subcategory'));
  const unit = units.includes(params.get('unit')) ? params.get('unit') : '';
  const sort = params.get('sort');
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').trim().replace(/\s+/g, ' ').slice(0, 160),
    category: category?.id ?? '',
    subcategory: subcategory?.id ?? '',
    supplier: suppliersById.has(params.get('supplier')) ? params.get('supplier') : '',
    location: locations.includes(params.get('location')) ? params.get('location') : '',
    distance: nonnegative(params, 'distance', 1),
    unit,
    minPrice: unit ? nonnegative(params, 'minPrice', 2) : '',
    maxPrice: unit ? nonnegative(params, 'maxPrice', 2) : '',
    moq: unit ? nonnegative(params, 'moq', 3) : '',
    stock: ['available', 'low-stock', 'insufficient-stock', 'out-of-stock'].includes(params.get('stock')) ? params.get('stock') : '',
    bulk: params.get('bulk') === '1' ? '1' : '',
    sort: sortOptions.includes(sort) && (unit || !unitSorts.includes(sort)) ? sort : '',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function catalogUrl(state) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value !== '' && (key !== 'page' || value > 1)) params.set(key, value);
  }
  return params.size ? `products.html?${params}` : 'products.html';
}

export function findCatalogOffers(state, buyer, resultsPerPage = pageSize) {
  const query = normalize(state.q);
  const words = searchWords(query).map(input => {
    const term = queryTerm(input);
    // Ingredient shortcuts should not match neighboring items via a shared taxonomy label.
    const ingredient = term.length >= 3 && ingredientWords.some(word => word.startsWith(term));
    return { term, ingredient };
  });
  const distances = new Map(suppliers.map(supplier => [supplier.id, calculateSupplierDistance(buyer, supplier.location)]));
  const inventory = readInventory();
  const results = catalogRows.map(row => {
    const offer = applyInventory(row.offer, inventory);
    const { high, low } = getWholesalePriceRange(offer);
    return { ...row, offer, moqPrice: high, bulk: (high - low) * 100 >= high * minimumBulkDiscount };
  }).filter(({ offer, product, supplier, taxonomy, searchTerms, ingredientTerms, moqPrice, bulk }) => (
    (taxonomy.includes(query) || words.every(({ term, ingredient }) => (
      (ingredient ? ingredientTerms : searchTerms).some(candidate => candidate.startsWith(term))
    )))
    && (!state.category || product.categoryId === state.category)
    && (!state.subcategory || product.subcategoryId === state.subcategory)
    && (!state.supplier || supplier.id === state.supplier)
    && (!state.location || supplier.location.label === state.location)
    && (state.distance === '' || distances.get(supplier.id) <= state.distance)
    && (!state.unit || product.unit === state.unit)
    && (state.minPrice === '' || moqPrice >= Math.round(state.minPrice * 100))
    && (state.maxPrice === '' || moqPrice <= Math.round(state.maxPrice * 100))
    && (state.moq === '' || offer.minimumOrderQuantity <= state.moq)
    && (!state.stock || (state.stock === 'available' ? offer.status === 'available' : getInventoryStatus(offer) === state.stock))
    && (!state.bulk || bulk)
  ));

  const comparators = {
    'price-asc': (a, b) => a.moqPrice - b.moqPrice,
    'price-desc': (a, b) => b.moqPrice - a.moqPrice,
    nearest: (a, b) => distances.get(a.supplier.id) - distances.get(b.supplier.id),
    farthest: (a, b) => distances.get(b.supplier.id) - distances.get(a.supplier.id),
    moq: (a, b) => a.offer.minimumOrderQuantity - b.offer.minimumOrderQuantity,
    name: (a, b) => a.product.name.localeCompare(b.product.name, 'en-PH'),
  };
  if (state.sort) results.sort(comparators[state.sort]);
  const pageCount = Math.max(1, Math.ceil(results.length / resultsPerPage));
  const page = Math.min(state.page, pageCount);
  const offset = (page - 1) * resultsPerPage;
  return { total: results.length, page, pageCount, offset, offers: results.slice(offset, offset + resultsPerPage).map(row => row.offer) };
}
