import { offersById, suppliersById } from './catalog-records.js';

export const messagingKey = 'sulitstock-messaging';
const empty = () => ({ version: 1, threads: {}, quotes: [] });

export function readMessaging(storage) {
  try {
    const state = JSON.parse((storage ?? localStorage).getItem(messagingKey));
    if (state?.version !== 1 || !state.threads || !Array.isArray(state.quotes)) return empty();
    const threads = Object.fromEntries(Object.entries(state.threads)
      .filter(([id, value]) => suppliersById.has(id) && value && Array.isArray(value.messages))
      .map(([id, value]) => [id, {
        offerId: scopedOffer(value.offerId, id)?.id ?? null,
        pending: typeof value.pending === 'string' ? value.pending : null,
        messages: value.messages.filter(message => message && ['buyer', 'assistant'].includes(message.role)
          && typeof message.text === 'string' && Number.isFinite(message.visibleAt)),
      }]));
    return { ...state, threads };
  } catch { return empty(); }
}

export function updateMessaging(change, storage) {
  try {
    const target = storage ?? localStorage;
    const state = readMessaging(target);
    if (change(state) === false) return false;
    target.setItem(messagingKey, JSON.stringify(state));
    return true;
  } catch { return false; }
}

export function threadFor(state, supplierId) {
  return state.threads[supplierId] ?? { offerId: null, pending: null, messages: [] };
}

export function scopedOffer(offerId, supplierId) {
  const offer = offersById.get(offerId);
  return offer?.supplierId === supplierId ? offer : null;
}

export function unreadCount(thread, now = Date.now()) {
  return thread.messages.filter(message => message.role === 'assistant' && !message.read && message.visibleAt <= now).length;
}
