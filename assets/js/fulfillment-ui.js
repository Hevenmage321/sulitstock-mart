import { formatPrice, formatQuantity } from './marketplace-ui.js';

export function renderFulfillmentOptions(select, group) {
  const { options, fulfillment } = group;
  select.replaceChildren(new Option('Choose fulfillment', ''), ...options.map(option => {
    const suffix = !option.eligible ? option.reason : option.fee === null ? 'Quote required' : formatPrice(option.fee);
    const item = new Option(`${option.label} · ${suffix}`, option.method);
    item.disabled = !option.eligible;
    return item;
  }));
  select.value = fulfillment?.method ?? '';
}

export function fulfillmentMessage(group) {
  const { supplier, fulfillment, options, shipment } = group;
  if (!fulfillment) return options.some(option => option.eligible)
    ? 'Choose an available method. The previous delivery choice may be unavailable for this destination or shipment.'
    : 'Delivery is unavailable. Return to the cart to revise the selection.';
  if (fulfillment.method === 'Pickup') {
    const delivery = options.filter(option => option.method !== 'Pickup');
    const reason = delivery.some(option => option.eligible && option.fee === null)
      ? ' Delivery requires a quote.'
      : delivery.length && delivery.every(option => !option.eligible) ? ' Compatible delivery is unavailable.' : '';
    return `Pickup at ${supplier.location.label} · No delivery fee.${reason}`;
  }
  if (fulfillment.fee === null) return `Delivery quotation required. ${fulfillment.reason}. Choose pickup if available or revise your cart.`;
  return `${fulfillment.vehicle} · ${fulfillment.distance.toFixed(1)} km straight-line estimate · ${formatQuantity(shipment.kilograms, 'kg')} estimated gross weight.`;
}
