import { productsById, suppliersById } from './catalog-records.js';
import { calculateSupplierDistance } from './procurement.js';

export const fulfillmentKey = 'sulitstock-fulfillment';

const ratePlans = {
  'Scheduled delivery': {
    label: 'Standard delivery', handling: 'standard',
    vehicles: [[20, 'Motorcycle', 6500, 700, 140], [100, 'Light cargo vehicle', 14500, 950, 130], [400, 'Cargo van', 28500, 1300, 100]],
  },
  'Chilled delivery': {
    label: 'Chilled delivery', handling: 'chilled',
    vehicles: [[25, 'Insulated carrier', 9500, 850, 180], [120, 'Chilled cargo vehicle', 19000, 1150, 160], [350, 'Refrigerated van', 34000, 1550, 145]],
  },
  'Frozen delivery': {
    label: 'Frozen delivery', handling: 'frozen',
    vehicles: [[25, 'Frozen carrier', 11500, 1000, 220], [120, 'Freezer cargo vehicle', 23000, 1300, 190], [300, 'Freezer van', 39000, 1700, 175]],
  },
};

const supplierDiscount = { sagana: .12, 'bayan-harvest': .08, 'marikina-cold': .06 };
export function shipmentDetails(lines) {
  let kilograms = 0;
  let hasUnknownWeight = false;
  const temperatures = new Set();
  for (const { offer, quantity, error } of lines) {
    if (error) continue;
    const product = productsById.get(offer.productId);
    temperatures.add(product.transport);
    const perUnit = offer.shipping?.grossKgPerUnit;
    if (!Number.isFinite(perUnit) || perUnit <= 0) hasUnknownWeight = true;
    else kilograms += quantity * perUnit;
  }
  return { kilograms, hasUnknownWeight, temperatures };
}

export function getFulfillmentOptions(supplier, destination, shipment) {
  const distance = calculateSupplierDistance(supplier.location, destination);
  const covered = Boolean(destination && supplier.delivery.coverageIds.includes(destination.id));
  const { kilograms, hasUnknownWeight, temperatures } = shipment;
  const frozen = temperatures.has('frozen');
  const chilled = temperatures.has('chilled');
  return supplier.delivery.methods.map(method => {
    if (method === 'Pickup') return { method, label: method, eligible: true, fee: 0 };
    const rate = ratePlans[method];
    const label = rate?.label ?? method;
    if (!covered) return { method, label, eligible: false, fee: null, reason: 'Outside delivery coverage' };
    const required = frozen ? 'frozen' : chilled ? 'chilled' : null;
    if (!rate || (required && rate.handling !== required)) {
      return { method, label, eligible: false, fee: null, reason: 'Incompatible temperature handling' };
    }
    const vehicle = rate.vehicles.find(([capacity]) => kilograms <= capacity);
    const reason = !vehicle ? 'Shipment exceeds configured vehicle capacity'
      : frozen && chilled ? 'Mixed chilled and frozen shipment needs separate temperature zones'
      : hasUnknownWeight ? 'Shipment includes items without an estimated shipping weight'
      : '';
    if (reason) return { method, label, eligible: true, fee: null, reason, distance };
    const [, vehicleName, base, perKm, perKg] = vehicle;
    const fee = Math.round((base + perKm * distance + perKg * Math.max(0, kilograms - 5)) * (1 - (supplierDiscount[supplier.id] ?? 0)));
    return { method, label, eligible: true, fee, distance, vehicle: vehicleName };
  });
}

export function pickFulfillment(options, preferred) {
  if (preferred) return options.find(option => option.eligible && option.method === preferred);
  return options.filter(option => option.eligible && option.method !== 'Pickup' && option.fee !== null)
      .sort((a, b) => a.fee - b.fee)[0]
    ?? options.find(option => option.eligible && option.method !== 'Pickup')
    ?? options.find(option => option.eligible);
}

export function readFulfillmentChoices() {
  try {
    const records = JSON.parse(localStorage.getItem(fulfillmentKey));
    return new Map(Object.entries(records ?? {}).filter(([id, method]) => suppliersById.get(id)?.delivery.methods.includes(method)));
  } catch { return new Map(); }
}

export function saveFulfillmentChoice(choices, supplierId, method) {
  if (method) choices.set(supplierId, method);
  else choices.delete(supplierId);
  try { localStorage.setItem(fulfillmentKey, JSON.stringify(Object.fromEntries(choices))); } catch { /* Keep page choice usable. */ }
}
