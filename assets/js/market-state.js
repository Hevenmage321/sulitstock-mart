export const marketStorageKey = 'sulitstock-cart';

export function readMarketRecord(storage) {
  const raw = storage.getItem(marketStorageKey);
  if (raw === null) return { version: 1, items: [], orders: [] };
  let record;
  try { record = JSON.parse(raw); } catch { return null; }
  if (record?.version !== 1 || !Array.isArray(record.items)) return null;
  if (record.orders !== undefined && !Array.isArray(record.orders)) return null;
  return { version: 1, items: record.items, orders: record.orders ?? [] };
}

export function inventoryFromOrders(orders) {
  const quantities = new Map();
  for (const order of orders) {
    for (const group of order?.suppliers ?? []) {
      if (group.status === 'cancelled') continue;
      for (const line of group.lines ?? []) {
        if (!Number.isFinite(line.quantity) || line.quantity <= 0) continue;
        quantities.set(line.offerId, Number(((quantities.get(line.offerId) ?? 0) + line.quantity).toFixed(3)));
      }
    }
  }
  return quantities;
}

export function readInventory() {
  try { return inventoryFromOrders(readMarketRecord(globalThis.localStorage)?.orders ?? []); }
  catch { return new Map(); }
}

export function applyInventory(offer, inventory) {
  const deducted = inventory.get(offer.id);
  if (!deducted) return offer;
  const availableStock = Math.max(0, Number((offer.availableStock - deducted).toFixed(3)));
  return { ...offer, availableStock, status: availableStock < offer.minimumOrderQuantity ? 'out-of-stock' : offer.status };
}

export function inventorySignature() {
  return JSON.stringify([...readInventory()].sort(([a], [b]) => a.localeCompare(b)));
}

export async function withMarketWrite(action) {
  try {
    const locks = globalThis.navigator?.locks;
    return locks ? await locks.request('sulitstock-market-write', action) : action();
  } catch {
    return { error: 'storage' };
  }
}
