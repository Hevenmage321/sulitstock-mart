import { applyInventory, inventoryFromOrders, marketStorageKey, readInventory, readMarketRecord } from './market-state.js';
import { offersById } from './catalog-records.js';
import {
  calculateBulkSavings, calculateOrderSubtotal, getApplicableWholesalePrice,
  getReachablePricingTiers, offsetQuantity, validateQuantity,
} from './procurement.js';

export const cartStorageKey = marketStorageKey;
const version = 1;

export function readSavedCart(value) {
  if (value === null) return { items: [], repaired: false };
  let saved;
  try { saved = JSON.parse(value); } catch { return { items: [], repaired: true }; }
  if (saved?.version !== version || !Array.isArray(saved.items)) return { items: [], repaired: true };

  const items = new Map();
  let repaired = false;
  for (const item of saved.items) {
    if (!offersById.has(item?.offerId) || !Number.isFinite(item.quantity) || item.quantity <= 0) {
      repaired = true;
      continue;
    }
    const previous = items.get(item.offerId);
    if (!previous) {
      items.set(item.offerId, { offerId: item.offerId, quantity: item.quantity, selected: item.selected !== false });
      continue;
    }
    // A doubled saved row must not bypass the cumulative stock check.
    repaired = true;
    const combined = offsetQuantity(previous.quantity, item.quantity);
    const inputsValid = [previous.quantity, item.quantity].every(quantity => offsetQuantity(quantity, 0) === quantity);
    if (!inputsValid || !Number.isFinite(combined)) {
      // Preserve an invalid aggregate for review instead of rounding it into a valid order.
      previous.quantity = Number.MAX_VALUE;
    } else {
      previous.quantity = combined;
    }
    previous.selected ||= item.selected !== false;
  }
  return { items: [...items.values()], repaired };
}

export function getCartLine(item, quantity = item.quantity, inventory = readInventory()) {
  const offer = applyInventory(offersById.get(item.offerId), inventory);
  const error = validateQuantity(offer, quantity);
  if (error) return { ...item, quantity, offer, error };
  return {
    ...item, quantity, offer, error,
    unitPrice: getApplicableWholesalePrice(offer, quantity),
    subtotal: calculateOrderSubtotal(offer, quantity),
    savings: calculateBulkSavings(offer, quantity),
    nextTier: getReachablePricingTiers(offer).find(tier => tier.minimumQuantity > quantity),
  };
}

export function summarizeCart(lines) {
  let selected = 0;
  let invalid = 0;
  let subtotal = 0;
  let savings = 0;
  for (const line of lines) {
    if (!line.selected) continue;
    selected += 1;
    if (line.error) {
      invalid += 1;
    } else {
      subtotal += line.subtotal;
      savings += line.savings;
    }
  }
  return { selected, invalid, subtotal, savings };
}

export function createCartStore(getStorage) {
  let memory = { items: [], repaired: false, inventory: new Map() };
  let persistent = true;

  function read() {
    if (persistent) {
      try {
        const storage = getStorage();
        memory = {
          ...readSavedCart(storage.getItem(cartStorageKey)),
          inventory: inventoryFromOrders(readMarketRecord(storage)?.orders ?? []),
        };
      }
      catch { persistent = false; }
    }
    return { ...memory, persistent };
  }

  function save(items) {
    memory = { ...memory, items, repaired: false };
    if (persistent) {
      try {
        const storage = getStorage();
        const orders = readMarketRecord(storage)?.orders ?? [];
        storage.setItem(cartStorageKey, JSON.stringify({ version, items, orders }));
      }
      catch { persistent = false; }
    }
    return { ...memory, persistent, error: null };
  }

  function addLine(snapshot, offerId, quantity) {
    const catalogOffer = offersById.get(offerId);
    if (!catalogOffer) return { ...snapshot, error: 'missing-offer' };
    const offer = applyInventory(catalogOffer, snapshot.inventory);
    const error = validateQuantity(offer, quantity);
    if (error) return { ...snapshot, error };
    const previous = snapshot.items.find(item => item.offerId === offerId);
    const cumulative = previous ? offsetQuantity(previous.quantity, quantity) : quantity;
    const previousError = previous && validateQuantity(offer, previous.quantity);
    if (previousError) return { ...snapshot, error: previousError, existingInvalid: true };
    const cumulativeError = validateQuantity(offer, cumulative);
    if (cumulativeError) return { ...snapshot, error: cumulativeError, existingQuantity: previous?.quantity };
    const item = { offerId, quantity: cumulative, selected: previous?.selected ?? true };
    const items = previous ? snapshot.items.map(entry => entry.offerId === offerId ? item : entry) : [...snapshot.items, item];
    return { ...snapshot, items, item, error: null };
  }

  function add(offerId, quantity) {
    const result = addLine(read(), offerId, quantity);
    return result.error ? result : { ...save(result.items), item: result.item };
  }

  function addMany(lines) {
    let snapshot = read();
    const added = [];
    const skipped = [];
    for (const line of lines) {
      const result = addLine(snapshot, line.offerId, line.quantity);
      if (result.error) skipped.push({ ...line, error: result.error });
      else {
        snapshot = result;
        added.push(line);
      }
    }
    return { ...(added.length ? save(snapshot.items) : snapshot), added, skipped };
  }

  function updateQuantity(offerId, quantity) {
    const snapshot = read();
    const item = snapshot.items.find(entry => entry.offerId === offerId);
    if (!item) return { ...snapshot, error: 'missing-offer' };
    const error = validateQuantity(applyInventory(offersById.get(offerId), snapshot.inventory), quantity);
    if (error) return { ...snapshot, error };
    return save(snapshot.items.map(entry => entry.offerId === offerId ? { ...entry, quantity } : entry));
  }

  function remove(offerId) {
    return save(read().items.filter(item => item.offerId !== offerId));
  }

  function select(offerIds, selected) {
    const ids = new Set(offerIds);
    return save(read().items.map(item => ids.has(item.offerId) ? { ...item, selected } : item));
  }

  return { read, add, addMany, updateQuantity, remove, select };
}

export const cartStore = createCartStore(() => globalThis.localStorage);
