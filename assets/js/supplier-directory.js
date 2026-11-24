import { categoriesById } from './catalog-records.js';
import { suppliers } from './data.js';
import { calculateSupplierDistance, getOffersBySupplier, validateQuantity } from './procurement.js';

const byName = (a, b) => a.localeCompare(b, 'en-PH');
const normalize = text => text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function deliversTo(supplier, buyer) {
  return supplier.delivery.coverageIds.includes(buyer.id) && supplier.delivery.methods.some(method => method !== 'Pickup');
}

export function availableProductCount(supplierId, inventory) {
  const purchasable = getOffersBySupplier(supplierId, inventory).filter(offer =>
    validateQuantity(offer, offer.minimumOrderQuantity) === null);
  return new Set(purchasable.map(offer => offer.productId)).size;
}

export function findSuppliers({ q, type, category, distance, delivery, sort }, buyer) {
  const terms = normalize(q).split(' ').filter(Boolean);
  const results = suppliers.flatMap(supplier => {
    const categoryLabels = supplier.categoryIds.map(id => categoriesById.get(id).label);
    const search = normalize([supplier.name, supplier.description, supplier.type, supplier.location.city, supplier.location.province, ...categoryLabels].join(' '));
    const km = calculateSupplierDistance(buyer, supplier.location);
    const covered = deliversTo(supplier, buyer);
    if (!terms.every(term => search.includes(term))
      || (type && supplier.type !== type)
      || (category && !supplier.categoryIds.includes(category))
      || (distance && km > Number(distance))
      || (delivery === 'covered' && !covered)
      || (delivery === 'uncovered' && covered)) return [];
    return [{ supplier, categoryLabels, km, covered }];
  });
  const comparators = {
    nearest: (a, b) => a.km - b.km,
    farthest: (a, b) => b.km - a.km,
    type: (a, b) => byName(a.supplier.type, b.supplier.type),
    category: (a, b) => byName(a.categoryLabels[0], b.categoryLabels[0]),
    delivery: (a, b) => Number(b.covered) - Number(a.covered),
  };
  return results.sort((a, b) => (comparators[sort]?.(a, b) ?? 0) || byName(a.supplier.name, b.supplier.name));
}

export const purchasingPolicies = {
  'san-isidro': 'Chilled cuts start in small kilogram lots. Larger kitchen orders unlock additional breaks by cut.',
  'marikina-cold': 'Start with smaller lots of chilled or frozen products. Check each offer for its own stock and quantity breaks.',
  'bayan-harvest': 'Order produce by weight. Crop-specific volume breaks support consolidated restaurant orders.',
  sagana: 'Buy staples by the bottle, bag, or sack at offer-specific minimums. Combine pantry lines to share a supplier shipment where eligible.',
  dagat: 'Order iced seafood by weight. Fish and shellfish have separate lot sizes and chilled delivery options.',
  palengke: 'Choose smaller lots across market categories. Fresh stock varies by offer, and handling depends on the products in the shipment.',
  bukid: 'Grower lots typically start at higher quantities, with scheduled dispatch and lower rates at larger quantities.',
  palay: 'Rice is sold in 25 kg sacks. Larger sack orders unlock the mill’s lower unit prices.',
  masinop: 'Order flour in 5 kg food-service bags. Other bakery ingredients use the minimum and pack listed on each offer.',
  sarsa: 'Oil and sauce orders advance in six-liter cases. Pantry seasonings use their own pack increments.',
  gatas: 'Order eggs by the 30-count tray and milk by the carton. Check chilled handling and stock for each product.',
  yelo: 'Frozen ingredients are sold by weight or freezer pack. Larger batches can reach lower rates, with frozen delivery or pickup.',
  tasa: 'Milk is sold in six-carton trays. Café ingredients and service supplies use separate box, pack, or weight breaks.',
  balot: 'Takeaway supplies start in multi-pack lots. Higher volume breaks apply by container, cup, or cutlery format.',
  tiklop: 'Stock up by pack or box. Check the individual listing for container capacity, piece counts, and volume breaks.',
};
