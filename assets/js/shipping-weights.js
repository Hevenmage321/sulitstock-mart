// Gross kilograms per billed unit. These are demo estimates, including packaging.
const grossKg = {
  'chicken-breast': 1.035, 'chicken-thigh': 1.035, 'whole-chicken': 1.03,
  'pork-belly': 1.035, 'ground-pork': 1.035, 'beef-chuck': 1.035, 'ground-beef': 1.035,
  prawns: 1.16, bangus: 1.14, tilapia: 1.14, squid: 1.16, 'tuna-loin': 1.055,
  carrots: 1.06, tomatoes: 1.075, pechay: 1.09, 'red-onions': 1.012, garlic: 1.015,
  cabbage: 1.055, potatoes: 1.015, mangoes: 1.085, 'saba-bananas': 1.065,
  calamansi: 1.065, pineapple: 1.045, papaya: 1.06,
  'jasmine-rice': 25.18, 'well-milled-rice': 25.18, 'glutinous-rice': 1.025, 'rolled-oats': 1.035,
  'cooking-oil': .975, 'canola-oil': .980, 'coconut-oil': .985,
  peppercorns: 1.025, 'bay-leaves': .00112, 'iodized-salt': 1.018, paprika: .00108,
  'soy-sauce': 1.23, 'cane-vinegar': 1.07, 'fish-sauce': 1.245, 'oyster-sauce': 1.31,
  'chicken-eggs': 2.08, 'whole-milk': 1.082, 'unsalted-butter': .245, mozzarella: 1.035,
  'french-fries': 1.04, 'chicken-nuggets': 1.04, 'mixed-vegetables': 1.035, 'lumpia-wrappers': .57,
  macaroni: 1.025, flour: 1.03, 'rice-vermicelli': 1.027, 'white-sugar': 1.025, cornstarch: 1.03,
  'barako-coffee': 1.045, 'black-tea': .39, 'bottled-water': 9.04, 'calamansi-concentrate': 1.245,
  'kraft-lunch-box': 1.31, 'paper-hot-cups': .58, 'wooden-cutlery': .84, 'bagasse-container': 1.73,
};

// Shipping packs can differ without changing the billed unit, MOQ, or retail pack.
const supplierShippingPacks = {
  'chicken-breast-marikina-cold': [1.06, 'Five 1 kg sealed packs in an insulated shipper; weight allocated per kg'],
  'jasmine-rice-palay': [25.25, 'Reinforced 25 kg woven sack with liner'],
  'well-milled-rice-palay': [25.25, 'Reinforced 25 kg woven sack with liner'],
  'chicken-eggs-palengke': [2.19, '30 eggs in a padded corrugated tray'],
  'bottled-water-tasa': [9.22, '24 × 350 mL bottles in a reinforced carton'],
};

export function getProductShippingWeight(productId) {
  return grossKg[productId];
}

export function getOfferShipping(product, offerId) {
  const override = supplierShippingPacks[offerId];
  return {
    grossKgPerUnit: override?.[0] ?? product.shipping.grossKgPerUnit,
    package: override?.[1] ?? product.packaging,
  };
}
