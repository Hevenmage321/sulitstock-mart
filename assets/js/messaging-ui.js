import { offersById, productsById, suppliersById } from './catalog-records.js';
import { fillLocationSelect, locationsById } from './locations.js';
import { applyInventory, marketStorageKey, readInventory, withMarketWrite } from './market-state.js';
import { describeStock, offerUrl, setMerchantLogo, showProductImage, wholesaleRange } from './marketplace-ui.js';
import { messagingKey, readMessaging, scopedOffer, threadFor, unreadCount, updateMessaging } from './messaging-store.js';
import { answerSupplier, validQuotation } from './supplier-assistant.js';

const suggestions = ['Current stock', 'Minimum order', 'Wholesale prices', 'Delivery estimate', 'Pickup options', 'Request a quotation'];
const timeFormat = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' });
const today = () => new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date());
const chatIcon = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 1 1-16.1-3.8A8.5 8.5 0 0 1 21 11.5ZM5 16l-2 5 5-2"/></svg>';

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function merchantLogo(supplier, size = 42) {
  const image = node('img', '', 'merchant-logo');
  image.width = image.height = size;
  image.alt = '';
  setMerchantLogo(image, supplier.id);
  return image;
}

function messageTime(epoch) {
  const time = node('time', timeFormat.format(epoch));
  time.dateTime = new Date(epoch).toISOString();
  return time;
}

function notify() {
  window.dispatchEvent(new Event('sulitstock-messages'));
}

export function watchMessages(callback) {
  const storageChanged = event => {
    if (event.key === messagingKey || event.key === null) callback();
  };
  window.addEventListener('storage', storageChanged);
  window.addEventListener('sulitstock-messages', callback);
  window.addEventListener('pageshow', callback);
}

function recommendation(offerId, inventory) {
  const seed = offersById.get(offerId);
  if (!seed) return null;
  const offer = applyInventory(seed, inventory);
  const product = productsById.get(offer.productId);
  const card = node('div', '', 'message-product');
  const photo = node('div', '', 'message-product-photo');
  const image = node('img');
  const fallback = node('span', 'Photo unavailable', 'image-fallback');
  fallback.hidden = true;
  photo.append(image, fallback);
  showProductImage(photo, product, { decorative: true, offer });
  const info = node('div');
  const price = node('p', `${wholesaleRange(offer)} / ${product.unit}`, 'message-price');
  const stock = node('p', '', 'message-stock');
  describeStock(stock, offer, product.unit);
  const link = node('a', 'View Product', 'supplier-link');
  link.href = offerUrl(offer.id);
  link.setAttribute('aria-label', `View Product: ${product.name}`);
  info.append(node('strong', product.name), price, stock, link);
  card.append(photo, info);
  return card;
}

function panelMarkup() {
  return `
    <header class="message-panel-header">
      <div class="message-identity"></div>
      <div class="message-window-actions">
        <button class="icon-button" type="button" data-window="minimize" aria-label="Minimize chat">−</button>
        <button class="icon-button" type="button" data-window="close" aria-label="Close chat">×</button>
      </div>
    </header>
    <p class="message-disclosure">Simulated AI representative for this academic prototype. Replies use demo catalog rules.</p>
    <p class="message-context" hidden></p>
    <div class="message-history" role="region" aria-label="Conversation history" tabindex="0"></div>
    <p class="message-typing" role="status" hidden>Assistant is typing…</p>
    <p class="sr-only message-announcement" role="status"></p>
    <div class="message-suggestions" aria-label="Suggested inquiries"></div>
    <form class="message-compose">
      <label><span class="sr-only">Message</span><input name="message" maxlength="600" required autocomplete="off" placeholder="Ask about stock, pricing, or delivery"></label>
      <button class="button primary" type="submit">Send</button>
    </form>
    <form class="message-quote" hidden>
      <div class="message-quote-head"><h3>Simulated quotation request</h3><button class="text-button" type="button" data-cancel-quote>Cancel</button></div>
      <p>Saved in this browser. No request is sent to a supplier.</p>
      <div class="message-quote-fields">
        <label>Product<select name="offerId" required></select></label>
        <label>Requested quantity<input name="quantity" type="number" min="0.001" max="1000000000" step="0.001" required></label>
        <label>Delivery location<select name="location" required></select></label>
        <label>Preferred delivery date<input name="date" type="date" required></label>
        <label>Purchase frequency<select name="frequency" required><option value="once">One time</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="other">Other recurring schedule</option></select></label>
        <label>Notes (optional)<textarea name="notes" rows="2" maxlength="500"></textarea></label>
      </div>
      <button class="button primary" type="submit">Save Demo Request</button>
    </form>
    <p class="message-feedback" role="status" hidden></p>`;
}

export function createConversationPanel(container, getBuyer, { embedded = false, onMinimize, onClose } = {}) {
  container.classList.add('message-panel');
  container.innerHTML = panelMarkup();
  const find = selector => container.querySelector(selector);
  const history = find('.message-history');
  const status = find('.message-feedback');
  const input = find('[name="message"]');
  const compose = find('.message-compose');
  const quoteForm = find('.message-quote');
  const quoteFields = quoteForm.elements;
  const announce = find('.message-announcement');
  find('.message-window-actions').hidden = embedded;

  fillLocationSelect(quoteFields.location);

  let supplierId, contextId, timer, writing = false, lastAnnounced;
  let active = false;
  let quoteSource;

  function feedback(text = '') {
    status.textContent = text;
    status.hidden = !text;
  }

  function productName(offerId) {
    const offer = offersById.get(offerId);
    return offer ? productsById.get(offer.productId).name : '';
  }

  function markRead(messages) {
    const ids = new Set(messages.filter(message => message.role === 'assistant' && !message.read).map(message => message.id));
    if (!ids.size) return;
    const target = supplierId;
    void withMarketWrite(() => {
      const changed = updateMessaging(state => {
        const messagesToRead = state.threads[target]?.messages.filter(message => !message.read && ids.has(message.id));
        if (!messagesToRead?.length) return false;
        for (const message of messagesToRead) message.read = true;
      });
      if (changed) notify();
    });
  }

  function openQuote(message = {}) {
    if (!supplierId) return;
    if (quoteForm.hidden) quoteSource = document.activeElement;
    quoteForm.reset();
    quoteFields.offerId.replaceChildren(new Option('Choose a product', ''));
    const items = [...offersById.values()].filter(offer => offer.supplierId === supplierId);
    quoteFields.offerId.append(...items.map(offer => {
      const product = productsById.get(offer.productId);
      return new Option(`${product.name} (${product.unit})`, offer.id);
    }));
    quoteFields.offerId.value = scopedOffer(message.offerId ?? contextId, supplierId)?.id ?? '';
    quoteFields.quantity.value = Number.isFinite(message.quantity) ? message.quantity : '';
    quoteFields.location.value = getBuyer()?.id ?? '';
    quoteFields.date.min = today();
    quoteForm.hidden = false;
    quoteFields.offerId.focus();
  }

  function render() {
    clearTimeout(timer);
    if (!supplierId || !active) return;
    const thread = threadFor(readMessaging(), supplierId);
    const now = Date.now();
    const shown = thread.messages.filter(message => message.visibleAt <= now);
    const pending = thread.messages.find(message => message.visibleAt > now);
    const linkedOffer = scopedOffer(contextId ?? thread.offerId, supplierId);
    const context = find('.message-context');
    context.hidden = !linkedOffer;
    context.textContent = linkedOffer ? `Discussing ${productName(linkedOffer.id)}` : '';
    find('.message-typing').hidden = !pending;
    compose.querySelector('button').disabled = Boolean(pending || writing);
    const inventory = readInventory();
    const nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 70;
    const focused = history.contains(document.activeElement) ? document.activeElement.dataset.messageControl : null;
    const elements = shown.map(message => {
      const row = node('article', '', `message-row message-${message.role}`);
      const meta = node('p', '', 'message-meta');
      meta.append(node('strong', message.role === 'buyer' ? 'You' : 'AI Supplier Assistant'), messageTime(message.visibleAt));
      const bubble = node('div', '', 'message-bubble');
      bubble.append(node('p', message.text));
      for (const id of Array.isArray(message.offers) ? message.offers : []) {
        if (!scopedOffer(id, supplierId)) continue;
        bubble.append(recommendation(id, inventory));
      }
      const choices = node('div', '', 'message-options');
      if (thread.pending && message.id === shown.at(-1)?.id) {
        for (const id of Array.isArray(message.choices) ? message.choices : []) {
          if (!scopedOffer(id, supplierId)) continue;
          const choice = node('button', productName(id), 'button message-option');
          choice.type = 'button';
          choice.dataset.choice = id;
          choice.dataset.messageControl = `choose-${id}`;
          choices.append(choice);
        }
      }
      if (message.quote) {
        const button = node('button', 'Request Demo Quotation', 'button message-option');
        button.type = 'button';
        button.dataset.quote = message.id;
        button.dataset.messageControl = `quote-${message.id}`;
        choices.append(button);
      }
      if (choices.childElementCount) bubble.append(choices);
      row.append(meta, bubble);
      return row;
    });
    if (!shown.length) elements.push(node('p', 'Ask this supplier about an item, a wholesale price, or a delivery estimate.', 'message-empty'));
    history.replaceChildren(...elements);
    if (nearBottom || shown.at(-1)?.id !== lastAnnounced) history.scrollTop = history.scrollHeight;
    if (focused) [...history.querySelectorAll('[data-message-control]')].find(element => element.dataset.messageControl === focused)?.focus();
    const latest = shown.at(-1);
    if (latest?.role === 'assistant' && !latest.read && latest.id !== lastAnnounced) announce.textContent = latest.text;
    lastAnnounced = latest?.id;
    markRead(shown);
    if (pending) timer = setTimeout(render, Math.max(15, pending.visibleAt - now + 5));
  }

  async function send(text, choice) {
    if (!supplierId || writing) return;
    const entered = text.trim();
    if (!entered) return;
    const target = supplierId;
    const initialContext = contextId;
    const buyer = getBuyer();
    writing = true;
    const outcome = await withMarketWrite(() => {
      let reply;
      const saved = updateMessaging(state => {
        const thread = threadFor(state, target);
        const now = Date.now();
        if (thread.messages.some(message => message.visibleAt > now)) return;
        if (choice && !thread.pending) return;
        reply = answerSupplier({
          supplierId: target, message: choice ? thread.pending : entered,
          offerId: initialContext ?? thread.offerId, chosenOfferId: choice, buyer,
        });
        thread.offerId = reply.offerId ?? initialContext ?? thread.offerId;
        thread.pending = reply.pending ?? null;
        thread.messages.push(
          { id: crypto.randomUUID(), role: 'buyer', text: entered, visibleAt: now, read: true },
          { ...reply, id: crypto.randomUUID(), role: 'assistant', visibleAt: now + 520, read: false },
        );
        state.threads[target] = thread;
      });
      return { saved, reply };
    });
    writing = false;
    if (!outcome.saved) { feedback('Could not save this message. Check browser storage and try again.'); return; }
    if (outcome.reply && supplierId === target) {
      contextId = outcome.reply.offerId ?? contextId;
      input.value = '';
      feedback();
    }
    notify();
  }

  compose.addEventListener('submit', event => {
    event.preventDefault();
    void send(input.value);
  });
  const buttons = find('.message-suggestions');
  for (const text of suggestions) {
    const trigger = node('button', text, 'message-option');
    trigger.type = 'button';
    trigger.addEventListener('click', () => void send(text));
    buttons.append(trigger);
  }
  history.addEventListener('click', event => {
    const choice = event.target.closest('[data-choice]');
    const quotation = event.target.closest('[data-quote]');
    if (choice) void send(productName(choice.dataset.choice), choice.dataset.choice);
    if (quotation) {
      const message = threadFor(readMessaging(), supplierId).messages.find(item => item.id === quotation.dataset.quote);
      if (message) openQuote(message);
    }
  });
  function closeQuote() {
    quoteForm.hidden = true;
    if (quoteSource?.isConnected) quoteSource.focus();
    else input.focus();
  }
  find('[data-cancel-quote]').addEventListener('click', closeQuote);
  quoteForm.addEventListener('submit', async event => {
    event.preventDefault();
    const target = supplierId;
    const fields = Object.fromEntries(new FormData(quoteForm));
    if (!validQuotation(fields, target) || !locationsById.has(fields.location) || fields.date < today()) {
      feedback('Choose a valid product, quantity, location, and a date from today onward.');
      return;
    }
    const submit = quoteForm.querySelector('[type="submit"]');
    if (submit.disabled) return;
    submit.disabled = true;
    const reference = `RFQ-${crypto.randomUUID().toUpperCase()}`;
    const now = Date.now();
    const saved = await withMarketWrite(() => updateMessaging(state => {
      const thread = threadFor(state, target);
      state.quotes.push({ ...fields, quantity: Number(fields.quantity), reference, supplierId: target, createdAt: now, simulated: true });
      thread.messages.push({
        id: crypto.randomUUID(), role: 'assistant', visibleAt: now, read: false,
        text: `Simulated quotation saved. Reference: ${reference}. No request was sent and no stock, pricing, or delivery was promised.`,
      });
      state.threads[target] = thread;
    }));
    submit.disabled = false;
    if (saved !== true) { feedback('Could not save the request. Please try again.'); return; }
    if (supplierId === target) {
      closeQuote();
      feedback(`Demo request saved. Reference ${reference}`);
    }
    notify();
  });

  find('[data-window="minimize"]').addEventListener('click', () => onMinimize?.());
  find('[data-window="close"]').addEventListener('click', () => onClose?.());
  watchMessages(render);
  window.addEventListener('storage', event => {
    if (event.key === marketStorageKey) render();
  });
  return {
    show(id, offerId) {
      const supplier = suppliersById.get(id);
      if (!supplier) return;
      supplierId = id;
      contextId = scopedOffer(offerId, id)?.id ?? null;
      active = true;
      input.value = '';
      quoteForm.hidden = true;
      feedback();
      const identity = find('.message-identity');
      const title = node('div');
      const name = node('h2', supplier.name);
      name.id = embedded ? 'inbox-merchant-name' : 'widget-merchant-name';
      title.append(name, node('p', 'AI Supplier Assistant'));
      identity.replaceChildren(merchantLogo(supplier), title);
      render();
    },
    focus: () => input.focus(),
    context: () => contextId,
    openQuote,
    hide() {
      active = false;
      clearTimeout(timer);
    },
  };
}

export function initializeChatWidget(getBuyer) {
  const dialog = node('dialog', '', 'message-widget');
  dialog.id = 'supplier-chat';
  dialog.setAttribute('aria-labelledby', 'widget-merchant-name');
  const launcher = node('button', '', 'button primary message-resume');
  launcher.type = 'button';
  launcher.hidden = true;
  let trigger, minimized = false;
  const panel = createConversationPanel(dialog, getBuyer, {
    onMinimize() { minimized = true; dialog.close(); },
    onClose() { dialog.close(); },
  });
  dialog.addEventListener('close', () => {
    panel.hide();
    if (minimized) { launcher.hidden = false; launcher.focus(); }
    else if (trigger?.isConnected) trigger.focus();
  });
  let current;
  function open(id, offerId, initiator, quote) {
    current = { id, offerId };
    trigger = initiator;
    minimized = false;
    launcher.hidden = true;
    launcher.textContent = `Resume chat with ${suppliersById.get(id).name}`;
    panel.show(id, offerId);
    if (!dialog.open) dialog.showModal();
    if (quote) panel.openQuote(quote);
    else panel.focus();
  }
  launcher.addEventListener('click', () => open(current.id, panel.context() ?? current.offerId, trigger));
  document.body.append(dialog, launcher);
  return { open };
}

export function initializeInbox(getBuyer) {
  const list = document.getElementById('conversation-list');
  const search = document.getElementById('conversation-search');
  const panelHost = document.getElementById('inbox-panel');
  const placeholder = document.getElementById('inbox-placeholder');
  const panel = createConversationPanel(panelHost, getBuyer, { embedded: true });
  const params = new URLSearchParams(location.search);
  let selected = suppliersById.has(params.get('supplier')) ? params.get('supplier') : null;
  let timer;

  function renderList() {
    clearTimeout(timer);
    const state = readMessaging();
    const term = search.value.toLowerCase().trim();
    const now = Date.now();
    const ids = Object.keys(state.threads).filter(id => state.threads[id].messages.length);
    if (selected && !ids.includes(selected)) ids.push(selected);
    const rows = ids.map(id => {
      const thread = threadFor(state, id);
      const recent = thread.messages.filter(message => message.visibleAt <= now).at(-1);
      return { supplier: suppliersById.get(id), thread, recent };
    }).sort((a, b) => (b.recent?.visibleAt ?? 0) - (a.recent?.visibleAt ?? 0));
    const filtered = rows.filter(({ supplier, thread }) => supplier.name.toLowerCase().includes(term)
      || thread.messages.some(message => message.visibleAt <= now && message.text.toLowerCase().includes(term)));
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.thread : null;
    list.replaceChildren(...filtered.map(({ supplier, thread, recent }) => {
      const button = node('button', '', 'conversation-item');
      button.type = 'button';
      button.dataset.thread = supplier.id;
      if (supplier.id === selected) button.setAttribute('aria-current', 'true');
      const names = node('span', '', 'conversation-preview');
      names.append(node('strong', supplier.name), node('span', recent?.text ?? 'Start a conversation'));
      const meta = node('span', '', 'conversation-meta');
      if (recent) meta.append(messageTime(recent.visibleAt));
      const unread = unreadCount(thread, now);
      if (unread) {
        const badge = node('span', String(unread), 'conversation-unread');
        badge.setAttribute('aria-label', `${unread} unread`);
        meta.append(badge);
      }
      button.append(merchantLogo(supplier), names, meta);
      return button;
    }));
    if (!filtered.length) list.append(node('p', term ? 'No conversations match your search.' : 'Your supplier conversations will appear here.', 'message-empty'));
    if (focused) [...list.children].find(element => element.dataset.thread === focused)?.focus();
    const next = rows.flatMap(row => row.thread.messages).map(message => message.visibleAt).filter(epoch => epoch > now).sort((a,b) => a-b)[0];
    if (next) timer = setTimeout(renderList, Math.max(15, next - now + 5));
  }

  const back = document.getElementById('inbox-back');
  function showSelection(focus = false) {
    panelHost.hidden = !selected;
    placeholder.hidden = Boolean(selected);
    back.classList.toggle('inbox-selected', Boolean(selected));
    document.getElementById('inbox-layout').dataset.hasSelection = String(Boolean(selected));
    if (selected) {
      panel.show(selected);
      if (focus) panel.focus();
    } else panel.hide();
    renderList();
  }

  function select(id) {
    selected = id;
    history.replaceState(null, '', id ? `messages.html?supplier=${encodeURIComponent(id)}` : 'messages.html');
    showSelection(Boolean(id));
  }

  list.addEventListener('click', event => {
    const button = event.target.closest('[data-thread]');
    if (button) select(button.dataset.thread);
  });
  back.addEventListener('click', () => { select(null); search.focus(); });
  search.addEventListener('input', renderList);
  watchMessages(renderList);
  showSelection();
}

export function addMessagesLink() {
  const cart = document.querySelector('.cart');
  const actions = node('div', '', 'header-actions');
  cart.before(actions);
  const link = node('a', '', 'header-messages');
  link.href = 'messages.html';
  if (location.pathname.endsWith('/messages.html')) link.setAttribute('aria-current', 'page');
  link.innerHTML = `${chatIcon}<span class="header-message-label">Messages</span><span class="header-unread" hidden></span>`;
  actions.append(link, cart);
  const badge = link.querySelector('.header-unread');
  let timer;
  function render() {
    clearTimeout(timer);
    const now = Date.now();
    const threads = Object.values(readMessaging().threads);
    const count = threads.reduce((sum, thread) => sum + unreadCount(thread, now), 0);
    badge.hidden = !count;
    badge.textContent = count > 99 ? '99+' : String(count);
    link.setAttribute('aria-label', count ? `Messages, ${count} unread` : 'Messages');
    const next = threads.flatMap(thread => thread.messages).map(message => message.visibleAt).filter(epoch => epoch > now).sort((a,b) => a-b)[0];
    if (next) timer = setTimeout(render, Math.max(15, next - now + 5));
  }
  watchMessages(render);
  render();
}
