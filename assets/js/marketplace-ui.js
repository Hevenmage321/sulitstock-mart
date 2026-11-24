import { resolvePhoto } from './product-photos.js';
import { addMessagesLink, initializeChatWidget } from './messaging-ui.js';
import { initializeDemoReset } from './demo-reset.js';
import { inventorySignature, withMarketWrite } from './market-state.js';
import { categories } from './data.js';
import { buyerLocationKey, buyerLocations, fillLocationSelect, locationsById } from './locations.js';
import { offersById, productsById, suppliersById } from './catalog-records.js';
import { calculateSupplierDistance, getInventoryStatus, getWholesalePriceRange } from './procurement.js';

import { cartStorageKey, cartStore } from './cart-store.js';

const wholeNumber = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 });
const decimalPrice = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function categoryLink(category) {
  const link = document.createElement('a');
  link.href = `products.html?category=${encodeURIComponent(category.id)}`;
  link.textContent = category.label;
  return link;
}

export function updateDistances(buyer) {
  document.querySelectorAll('[data-distance-supplier]').forEach(element => {
    const supplier = suppliersById.get(element.dataset.distanceSupplier);
    const distance = calculateSupplierDistance(buyer, supplier.location);
    element.textContent = distance < 1
      ? 'Approx. <1 km'
      : `Approx. ${wholeNumber.format(distance)} km`;
    element.title = `Estimated straight-line distance from ${buyer.label}`;
  });
}

const quantityNumber = new Intl.NumberFormat('en-PH', { maximumFractionDigits: 3 });

export const inventoryLabels = {
  'in-stock': 'In Stock',
  'low-stock': 'Low Stock',
  'insufficient-stock': 'Insufficient Stock',
  'out-of-stock': 'Out of Stock',
};

export function setMerchantLogo(image, supplierId) {
  image.src = suppliersById.get(supplierId).logo;
}

export function supplierUrl(id) {
  return `supplier.html?id=${encodeURIComponent(id)}`;
}

export function supplierLink(id, name = suppliersById.get(id)?.name) {
  const link = document.createElement('a');
  link.className = 'supplier-link';
  link.href = supplierUrl(id);
  link.textContent = name;
  return link;
}

export function setSupplierContact(button, supplier, offerId) {
  button.dataset.contactSupplier = supplier.id;
  button.dataset.context = supplier.name;
  if (offerId) button.dataset.contactOffer = offerId;
  button.setAttribute('aria-label', `${button.textContent.trim()}: ${supplier.name}`);
}

export function offerUrl(id) {
  return `product.html?offer=${encodeURIComponent(id)}`;
}

export function formatQuantity(quantity, unit) {
  return `${quantityNumber.format(quantity)} ${unit}`;
}

export function formatPrice(centavos) {
  return `₱${(centavos % 100 ? decimalPrice : wholeNumber).format(centavos / 100)}`;
}

export function wholesaleRange(offer) {
  const { low, high } = getWholesalePriceRange(offer);
  return low === high ? formatPrice(low) : `${formatPrice(low)}–${formatPrice(high)}`;
}

export function showProductImage(container, product, { lazy = true, decorative = false, offer } = {}) {
  const image = container.querySelector('img');
  const placeholder = container.querySelector('.image-fallback');
  const showPlaceholder = () => {
    image.hidden = true;
    placeholder.hidden = false;
  };
  const source = resolvePhoto(product, offer);
  if (!source) {
    showPlaceholder();
    return;
  }
  image.addEventListener('error', () => {
    if (product.image && source !== product.image) {
      image.addEventListener('error', showPlaceholder, { once: true });
      image.src = product.image;
    } else showPlaceholder();
  }, { once: true });
  image.alt = decorative ? '' : product.name;
  image.loading = lazy ? 'lazy' : 'eager';
  image.decoding = 'async';
  image.src = source;
}

export function describeStock(element, offer, unit) {
  const status = getInventoryStatus(offer);
  element.textContent = `${inventoryLabels[status]} · ${formatQuantity(offer.availableStock, unit)} available`;
  element.dataset.stock = status;
  return status === 'in-stock' || status === 'low-stock';
}

export function renderOffer(offer) {
  const product = productsById.get(offer.productId);
  const { name, unit } = product;
  const supplier = suppliersById.get(offer.supplierId);
  const card = document.querySelector('#offer-template').content.cloneNode(true);
  const article = card.querySelector('.offer');
  article.dataset.offerId = offer.id;
  const photo = card.querySelector('.offer-photo');
  const nameButton = card.querySelector('.offer-name');
  showProductImage(photo, product, { decorative: true, offer });
  const stock = document.createElement('p');
  stock.className = 'offer-stock';
  describeStock(stock, offer, unit);
  card.querySelector('.offer-minimum').after(stock);
  photo.href = nameButton.href = offerUrl(offer.id);
  const add = card.querySelector('[data-review-offer]');
  add.dataset.reviewOffer = offer.id;
  add.href = offerUrl(offer.id);
  photo.setAttribute('aria-label', `View ${name} from ${supplier.name}`);
  nameButton.textContent = name;
  nameButton.setAttribute('aria-label', `${name} from ${supplier.name}`);
  card.querySelector('.offer-price strong').textContent = wholesaleRange(offer);
  card.querySelector('.offer-unit').textContent = `/ ${unit}`;
  card.querySelector('.offer-minimum').textContent = `Min. order ${offer.minimumOrderQuantity} ${unit}`;
  card.querySelector('.offer-supplier strong').append(supplierLink(supplier.id));
  card.querySelector('.offer-city').textContent = supplier.location.label;
  card.querySelector('.offer-distance').dataset.distanceSupplier = supplier.id;
  add.setAttribute('aria-label', `Add to Cart: ${name} from ${supplier.name}`);
  setSupplierContact(card.querySelector('[data-demo="contact"]'), supplier, offer.id);
  return card;
}

export function quantityError(offerRecord, unit, error) {
  const minimum = formatQuantity(offerRecord.minimumOrderQuantity, unit);
  const stock = formatQuantity(offerRecord.availableStock, unit);
  const status = getInventoryStatus(offerRecord);
  if (status === 'out-of-stock') return 'This supplier is out of stock.';
  if (status === 'insufficient-stock') return `This supplier has ${stock}, below the minimum order of ${minimum}.`;
  if (error === 'below-minimum') return `The minimum order is ${minimum}.`;
  if (error === 'insufficient-stock') return `This supplier has only ${stock} available.`;
  if (error === 'invalid-increment') return `Order in increments of ${formatQuantity(offerRecord.quantityIncrement, unit)} starting at ${minimum}.`;
  return `Enter a valid positive quantity in ${unit}.`;
}

export function updateCartCount(items = cartStore.read().items) {
  const cart = document.querySelector('.cart');
  const count = items.length;
  cart.querySelector('.cart-count').textContent = count;
  cart.setAttribute('aria-label', `Cart, ${count} supplier ${count === 1 ? 'offer' : 'offers'}`);
}

function createCartNotice() {
  const notice = document.createElement('div');
  notice.className = 'cart-notice';
  notice.hidden = true;
  const message = document.createElement('p');
  const view = document.createElement('a');
  view.href = 'cart.html';
  view.textContent = 'View cart';
  const dismiss = document.createElement('button');
  dismiss.type = 'button';
  dismiss.className = 'icon-button';
  dismiss.textContent = '×';
  dismiss.setAttribute('aria-label', 'Dismiss cart message');
  const status = document.createElement('p');
  status.className = 'sr-only';
  status.setAttribute('role', 'status');
  let trigger;
  dismiss.addEventListener('click', () => {
    notice.hidden = true;
    if (trigger?.isConnected) trigger.focus();
  });
  notice.append(message, view, dismiss);
  document.body.append(notice, status);
  return (text, isError, source) => {
    trigger = source;
    notice.dataset.error = String(isError);
    message.textContent = text;
    notice.hidden = false;
    status.textContent = text;
  };
}

async function handleAddToCart(trigger, announce) {
  const offer = offersById.get(trigger.dataset.addOffer);
  if (!offer || trigger.disabled) return;
  const product = productsById.get(offer.productId);
  const supplier = suppliersById.get(offer.supplierId);
  const quantity = document.getElementById(trigger.dataset.quantityInput)?.valueAsNumber;
  const result = await withMarketWrite(() => cartStore.add(offer.id, quantity));
  if (result.error === 'storage') {
    announce('The cart could not be updated. Try again.', true, trigger);
    return;
  }
  updateCartCount(result.items);
  if (result.error) {
    const message = result.existingInvalid
      ? 'Review the saved quantity for this offer in your cart before adding more.'
      : result.existingQuantity
        ? `Your cart already has ${formatQuantity(result.existingQuantity, product.unit)} from this offer. The combined quantity exceeds the permitted amount. ${quantityError(offer, product.unit, result.error)}`
        : quantityError(offer, product.unit, result.error);
    announce(message, true, trigger);
    return;
  }
  const persistenceNote = result.persistent ? '' : ' Browser storage is unavailable, so the cart is temporary.';
  announce(`Added ${formatQuantity(quantity, product.unit)} of ${product.name} from ${supplier.name} to your cart.${persistenceNote}`, false, trigger);
}

export function initializeMarketplace(onLocationChange, onInventoryChange = () => {}) {
  const categoryMenu = document.querySelector('#category-menu');
  const navigation = document.querySelector('#navigation');
  const menuToggle = document.querySelector('#menu-toggle');
  const locationSelect = document.querySelector('#buyer-location');
  document.querySelector('#category-menu-items').append(...categories.map(categoryLink));
  const announceCart = createCartNotice();
  initializeDemoReset();
  updateCartCount();
  addMessagesLink();
  const getBuyer = () => locationsById.get(locationSelect.value) ?? buyerLocations[0];
  let chat;
  let currentStock = inventorySignature();
  function refreshInventory() {
    const nextStock = inventorySignature();
    if (currentStock === nextStock) return;
    currentStock = nextStock;
    onInventoryChange();
  }
  window.addEventListener('storage', event => {
    if (event.key === cartStorageKey || event.key === null) {
      updateCartCount();
      refreshInventory();
    }
    if (event.key === buyerLocationKey || event.key === null) {
      const previous = locationSelect.value;
      restoreLocation();
      if (locationSelect.value !== previous) onLocationChange();
    }
  });

  function restoreLocation() {
    let savedId;
    try { savedId = localStorage.getItem(buyerLocationKey); } catch { /* Storage is optional. */ }
    const saved = locationsById.get(savedId);
    locationSelect.value = (saved ?? buyerLocations[0]).id;
  }

  fillLocationSelect(locationSelect);
  restoreLocation();
  locationSelect.addEventListener('change', () => {
    try { localStorage.setItem(buyerLocationKey, locationSelect.value); } catch { /* Keep the current page usable. */ }
    onLocationChange();
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    updateCartCount();
    refreshInventory();
    const previous = locationSelect.value;
    restoreLocation();
    if (locationSelect.value !== previous) onLocationChange();
  });

  function closeNavigation() {
    menuToggle.setAttribute('aria-expanded', 'false');
    categoryMenu.open = false;
  }

  menuToggle.addEventListener('click', () => {
    const open = menuToggle.getAttribute('aria-expanded') === 'true';
    if (open) closeNavigation();
    else menuToggle.setAttribute('aria-expanded', 'true');
  });
  navigation.addEventListener('click', event => {
    if (event.target.closest('a')) closeNavigation();
  });

  document.addEventListener('click', event => {
    if (!categoryMenu.contains(event.target)) categoryMenu.open = false;
    const add = event.target.closest('[data-add-offer]');
    if (add) {
      handleAddToCart(add, announceCart);
      return;
    }
    const trigger = event.target.closest('[data-demo]');
    if (!trigger || trigger.disabled) return;
    if (!['contact', 'quotation'].includes(trigger.dataset.demo) || !suppliersById.has(trigger.dataset.contactSupplier)) return;
    const quote = trigger.dataset.demo === 'quotation' ? {
      offerId: trigger.dataset.contactOffer,
      quantity: document.getElementById(trigger.dataset.quantityInput)?.valueAsNumber,
    } : undefined;
    chat ??= initializeChatWidget(getBuyer);
    chat.open(trigger.dataset.contactSupplier, trigger.dataset.contactOffer, trigger, quote);
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (categoryMenu.open) {
      categoryMenu.open = false;
      categoryMenu.querySelector('summary').focus();
    } else if (menuToggle.getAttribute('aria-expanded') === 'true') {
      closeNavigation();
      menuToggle.focus();
    }
  });

  return getBuyer;
}
