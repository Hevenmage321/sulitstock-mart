import { suppliersById } from './catalog-records.js';
import { getCartLine, summarizeCart } from './cart-store.js';
import { getFulfillmentOptions, pickFulfillment, shipmentDetails } from './delivery.js';

export const paymentMethods = ['cod', 'gcash', 'bank-transfer'];

export function buildCheckout(items, destination, methods = new Map(), inventory) {
  return estimateShipments(items.filter(item => item.selected).map(item => getCartLine(item, item.quantity, inventory)), destination, methods);
}

export function estimateShipments(lines, destination, methods) {
  lines = lines.filter(line => line.selected);
  const totals = summarizeCart(lines);
  const bySupplier = new Map();
  for (const line of lines) {
    const supplierId = line.offer.supplierId;
    if (!bySupplier.has(supplierId)) bySupplier.set(supplierId, []);
    bySupplier.get(supplierId).push(line);
  }
  const groups = Array.from(bySupplier, ([id, supplierLines]) => {
    const supplier = suppliersById.get(id);
    const shipment = shipmentDetails(supplierLines);
    const options = getFulfillmentOptions(supplier, destination, shipment);
    const fulfillment = pickFulfillment(options, methods.get(id));
    return { supplier, lines: supplierLines, totals: summarizeCart(supplierLines), shipment, options, fulfillment };
  });
  const cartError = !totals.selected ? 'empty' : totals.invalid ? 'invalid-quantity' : null;
  const deliveryTotal = !cartError && groups.every(group => group.fulfillment?.fee != null)
    ? groups.reduce((sum, group) => sum + group.fulfillment.fee, 0)
    : null;
  return { groups, totals, cartError, deliveryTotal, payable: deliveryTotal === null ? null : totals.subtotal + deliveryTotal };
}
