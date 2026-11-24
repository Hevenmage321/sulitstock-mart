import { applyInventory, readInventory } from './market-state.js';
import { offers, products } from './data.js';
import { productsById } from './catalog-records.js';

export function getOffersByProduct(productId) {
  const inventory = readInventory();
  return offers.filter(offer => offer.productId === productId).map(offer => applyInventory(offer, inventory));
}

export function getProductsByCategory(categoryId) {
  return products.filter(product => product.categoryId === categoryId);
}

export function getOffersBySupplier(supplierId, inventory = readInventory()) {
  return offers.filter(offer => offer.supplierId === supplierId).map(offer => applyInventory(offer, inventory));
}

const quantityScale = 1000;
const indivisibleUnits = new Set(['sack', 'box', 'pack', 'piece', 'pieces']);

function scaledQuantity(quantity) {
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity < 0) return null;
  const scaled = Math.round(quantity * quantityScale);
  return Number.isSafeInteger(scaled) && scaled / quantityScale === quantity ? scaled : null;
}

export function validateMinimumOrder(offer, quantity) {
  const scaled = scaledQuantity(quantity);
  return scaled !== null && scaled >= scaledQuantity(offer.minimumOrderQuantity);
}

export function validateAvailableStock(offer, quantity) {
  const scaled = scaledQuantity(quantity);
  return offer.status === 'available' && scaled !== null && scaled <= scaledQuantity(offer.availableStock);
}

export function validateQuantity(offer, quantity) {
  const scaled = scaledQuantity(quantity);
  if (scaled === null || scaled === 0) return 'invalid-quantity';
  if (!validateMinimumOrder(offer, quantity)) return 'below-minimum';
  if (!validateAvailableStock(offer, quantity)) return 'insufficient-stock';
  const unit = offer.unit ?? productsById.get(offer.productId)?.unit;
  if (indivisibleUnits.has(unit) && !Number.isInteger(quantity)) return 'invalid-increment';
  const minimum = scaledQuantity(offer.minimumOrderQuantity);
  const increment = scaledQuantity(offer.quantityIncrement);
  return (scaled - minimum) % increment === 0 ? null : 'invalid-increment';
}

export function getInventoryStatus(offer) {
  if (offer.availableStock === 0) return 'out-of-stock';
  if (offer.availableStock < offer.minimumOrderQuantity) return 'insufficient-stock';
  if (offer.status !== 'available') return 'out-of-stock';
  return offer.availableStock <= 2 * offer.minimumOrderQuantity ? 'low-stock' : 'in-stock';
}

export function getApplicablePricingTier(offer, quantity) {
  if (validateQuantity(offer, quantity) !== null) return null;
  return offer.priceTiers.findLast(tier => tier.minimumQuantity <= quantity) ?? null;
}

export function getApplicableWholesalePrice(offer, quantity) {
  return getApplicablePricingTier(offer, quantity)?.unitPriceCentavos ?? null;
}

export function getReachablePricingTiers(offer) {
  return offer.priceTiers.filter(tier => validateQuantity(offer, tier.minimumQuantity) === null);
}

export function getWholesalePriceRange(offer) {
  const high = offer.priceTiers[0].unitPriceCentavos;
  const low = getReachablePricingTiers(offer).at(-1)?.unitPriceCentavos ?? high;
  return { low, high };
}

// The limits and tier increments are stored to at most three decimal places.
export function offsetQuantity(quantity, increment) {
  return Math.round((quantity + increment) * quantityScale) / quantityScale;
}

function roundedSubtotal(unitPriceCentavos, quantity) {
  const scale = BigInt(quantityScale);
  const product = BigInt(unitPriceCentavos) * BigInt(scaledQuantity(quantity));
  const rounded = Number((product + scale / 2n) / scale);
  if (!Number.isSafeInteger(rounded)) throw new RangeError('Subtotal exceeds safe centavo precision');
  return rounded;
}

export function calculateOrderSubtotal(offer, quantity) {
  const unitPrice = getApplicableWholesalePrice(offer, quantity);
  return unitPrice === null ? null : roundedSubtotal(unitPrice, quantity);
}

export function calculateBulkSavings(offer, quantity) {
  const subtotal = calculateOrderSubtotal(offer, quantity);
  if (subtotal === null) return null;
  const baseline = roundedSubtotal(offer.priceTiers[0].unitPriceCentavos, quantity);
  return baseline - subtotal;
}

function isValidLocation(location) {
  return Number.isFinite(location?.latitude) && Math.abs(location.latitude) <= 90
    && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
}

export function calculateSupplierDistance(buyerLocation, supplierLocation) {
  if (!isValidLocation(buyerLocation) || !isValidLocation(supplierLocation)) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const latitude = radians(supplierLocation.latitude - buyerLocation.latitude);
  const longitude = radians(supplierLocation.longitude - buyerLocation.longitude);
  const haversine = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(buyerLocation.latitude)) * Math.cos(radians(supplierLocation.latitude)) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)));
}
