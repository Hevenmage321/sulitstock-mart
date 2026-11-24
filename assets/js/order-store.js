import { resolvePhoto } from './product-photos.js';
import { productsById } from './catalog-records.js';
import { readSavedCart } from './cart-store.js';
import { buildCheckout, paymentMethods } from './checkout.js';
import { inventoryFromOrders, marketStorageKey, readMarketRecord } from './market-state.js';
import { locationsById } from './locations.js';

export const statusLabels = {
  pending: 'Pending confirmation', confirmed: 'Confirmed', preparing: 'Preparing order',
  delivery: 'Out for delivery', pickup: 'Ready for pickup', completed: 'Completed', cancelled: 'Cancelled',
};
export const paymentLabels = { cod: 'Cash on Delivery', gcash: 'GCash', 'bank-transfer': 'Bank Transfer' };

export function statusPath(method) {
  return ['pending', 'confirmed', 'preparing', method === 'Pickup' ? 'pickup' : 'delivery', 'completed'];
}

export function nextSupplierStatus(group) {
  const path = statusPath(group.method);
  const index = path.indexOf(group.status);
  return index === -1 ? undefined : path[index + 1];
}

export function canCancel(order) {
  return order.suppliers.every(group => ['pending', 'confirmed'].includes(group.status));
}

export function orderTab(order) {
  const statuses = order.suppliers.map(group => group.status);
  if (statuses.every(status => status === 'cancelled')) return 'cancelled';
  if (statuses.every(status => status === 'completed' || status === 'cancelled')) return 'completed';
  return 'active';
}

export function reorderLines(order) {
  if (orderTab(order) !== 'completed') return [];
  return order.suppliers.filter(group => group.status === 'completed').flatMap(group =>
    group.lines.map(({ offerId, name, quantity }) => ({ offerId, name, quantity })));
}

export function selectionSignature(items) {
  return JSON.stringify(items.filter(item => item.selected).map(({ offerId, quantity }) => [offerId, quantity]));
}

function normalizeBuyer(buyer, delivering) {
  const limits = { business: 120, contact: 100, phone: 26, email: 180, address: 240, barangay: 120, instructions: 500 };
  const clean = Object.fromEntries(Object.entries(limits).map(([key, limit]) => [key,
    typeof buyer?.[key] === 'string' ? buyer[key].trim().slice(0, limit) : '',
  ]));
  if (!clean.business || !clean.contact || !/^\+?[\d ().-]+$/.test(clean.phone)
      || !/^\d{7,15}$/.test(clean.phone.replace(/\D/g, ''))
      || !/^[^\s@]+@[^\s@]+$/.test(clean.email)
      || (delivering && (!clean.address || !clean.barangay))) return null;
  return { ...clean, invoice: buyer.invoice === true };
}

export function createOrderStore(getStorage, now = () => new Date().toISOString(), makeId = () => crypto.randomUUID()) {
  function transact(change) {
    try {
      const storage = getStorage();
      const record = readMarketRecord(storage);
      if (!record) return { error: 'storage' };
      const result = change(record);
      if (result.error || result.duplicate) return result;
      storage.setItem(marketStorageKey, JSON.stringify(record));
      return result;
    } catch {
      return { error: 'storage' };
    }
  }

  function place(request) {
    return transact(record => {
      if (!request.requestId) return { error: 'invalid' };
      const previous = record.orders.find(order => order.requestId === request.requestId);
      if (previous) return { order: previous, duplicate: true };
      const items = readSavedCart(JSON.stringify(record)).items;
      if (selectionSignature(items) !== request.selection) return { error: 'selection-changed' };
      const destination = locationsById.get(request.destinationId);
      if (!destination || !paymentMethods.includes(request.payment)) return { error: 'invalid' };
      const model = buildCheckout(items, destination, request.methods, inventoryFromOrders(record.orders));
      if (model.cartError) return { error: model.cartError };
      if (model.payable === null) return { error: 'fulfillment' };
      if (model.payable !== request.expectedPayable) return { error: 'estimate-changed' };
      const buyer = normalizeBuyer(request.buyer, model.groups.some(group => group.fulfillment.method !== 'Pickup'));
      if (!buyer) return { error: 'buyer' };
      const createdAt = now();
      const id = `SSM-${createdAt.slice(0, 10).replaceAll('-', '')}-${makeId().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
      if (record.orders.some(order => order.id === id)) return { error: 'reference-collision' };
      const order = {
        id, requestId: request.requestId, createdAt, buyer, payment: request.payment, destination: destination.label,
        subtotal: model.totals.subtotal, savings: model.totals.savings,
        deliveryTotal: model.deliveryTotal, total: model.payable,
        suppliers: model.groups.map((group, index) => ({
          id: `${id}-${index + 1}`, supplierId: group.supplier.id, name: group.supplier.name,
          location: group.supplier.location.label, method: group.fulfillment.method, methodLabel: group.fulfillment.label,
          deliveryFee: group.fulfillment.fee, leadTimeHours: [...group.supplier.delivery.leadTimeHours],
          subtotal: group.totals.subtotal, status: 'pending', events: [{ status: 'pending', at: createdAt }],
          lines: group.lines.map(line => {
            const product = productsById.get(line.offer.productId);
            return {
              offerId: line.offerId, productId: product.id, name: product.name, image: resolvePhoto(product, line.offer), unit: product.unit,
              quantity: line.quantity, unitPrice: line.unitPrice, subtotal: line.subtotal, savings: line.savings,
            };
          }),
        })),
      };
      record.orders.push(order);
      record.items = items.filter(item => !item.selected);
      return { order };
    });
  }

  function advance(orderId, supplierOrderId) {
    return transact(record => {
      const order = record.orders.find(item => item.id === orderId);
      const group = order?.suppliers.find(item => item.id === supplierOrderId);
      const status = group && nextSupplierStatus(group);
      if (!status) return { error: 'not-eligible' };
      group.status = status;
      group.events.push({ status, at: now() });
      return { order };
    });
  }

  function cancel(orderId) {
    return transact(record => {
      const order = record.orders.find(item => item.id === orderId);
      if (!order || !canCancel(order)) return { error: 'not-eligible' };
      const at = now();
      for (const group of order.suppliers) {
        group.status = 'cancelled';
        group.events.push({ status: 'cancelled', at });
      }
      return { order };
    });
  }

  function read() {
    try {
      const record = readMarketRecord(getStorage());
      return record ? { orders: record.orders } : { orders: [], error: 'storage' };
    } catch { return { orders: [], error: 'storage' }; }
  }

  return { read, place, advance, cancel };
}

export const orderStore = createOrderStore(() => globalThis.localStorage);

export { withMarketWrite as serializeOrderWrite } from './market-state.js';
