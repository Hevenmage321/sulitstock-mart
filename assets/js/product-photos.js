const photographedProducts = new Set([
  'chicken-breast', 'chicken-thigh', 'whole-chicken', 'pork-belly', 'ground-pork',
  'beef-chuck', 'ground-beef', 'prawns', 'bangus', 'tilapia',
  'squid', 'tuna-loin', 'carrots', 'tomatoes', 'pechay',
  'red-onions', 'garlic', 'cabbage', 'potatoes', 'mangoes',
  'saba-bananas', 'calamansi', 'pineapple', 'papaya', 'jasmine-rice',
  'well-milled-rice', 'glutinous-rice', 'rolled-oats', 'cooking-oil', 'canola-oil',
  'coconut-oil', 'peppercorns', 'bay-leaves', 'iodized-salt', 'paprika',
  'soy-sauce', 'cane-vinegar', 'fish-sauce', 'oyster-sauce', 'chicken-eggs',
  'whole-milk', 'unsalted-butter', 'mozzarella', 'french-fries', 'chicken-nuggets',
  'mixed-vegetables', 'lumpia-wrappers', 'macaroni', 'flour', 'rice-vermicelli',
  'white-sugar', 'cornstarch', 'barako-coffee', 'black-tea', 'bottled-water',
  'calamansi-concentrate', 'kraft-lunch-box', 'paper-hot-cups', 'wooden-cutlery', 'bagasse-container',
]);

// Only offers with independently photographed packaging or handling are listed here.
const photographedOffers = new Set([
  'pechay-bukid', 'tomatoes-bukid', 'chicken-breast-marikina-cold', 'cooking-oil-sarsa', 'jasmine-rice-palay',
]);

export function productPhoto(productId) {
  return photographedProducts.has(productId) ? `assets/images/products/${productId}.jpg` : null;
}

export function offerPhoto(offerId) {
  return photographedOffers.has(offerId) ? `assets/images/products/offers/${offerId}.jpg` : null;
}

export function resolvePhoto(product, offer) {
  return offer?.image ?? product?.image ?? null;
}
