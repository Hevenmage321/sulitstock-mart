import { messagingKey } from './messaging-store.js';
import { fulfillmentKey } from './delivery.js';
import { buyerLocationKey } from './locations.js';
import { marketStorageKey, withMarketWrite } from './market-state.js';

export const demoStorageKeys = [marketStorageKey, buyerLocationKey, fulfillmentKey, messagingKey];

export function resetDemoStorage(getStorage) {
  const storage = getStorage();
  for (const key of demoStorageKeys) storage.removeItem(key);
  return { error: null };
}

export function initializeDemoReset() {
  const footer = document.querySelector('.site-footer .footer-inner');
  const note = footer.querySelector('.footer-note') ?? document.createElement('p');
  note.className = 'footer-note';
  if (!note.textContent) note.textContent = 'Academic demonstration · Simulated orders and payments';
  const controls = document.createElement('div');
  controls.className = 'footer-demo-controls';
  footer.append(controls);
  controls.append(note);
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'text-button reset-demo';
  trigger.textContent = 'Reset Demo';
  controls.append(trigger);

  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'reset-demo-title');
  dialog.setAttribute('aria-describedby', 'reset-demo-description');
  dialog.innerHTML = `
    <h2 id="reset-demo-title">Reset SulitStock Mart?</h2>
    <p id="reset-demo-description">This clears this browser’s demo orders, cart, messages, quotation requests, and saved preferences, and restores the original supplier inventory.</p>
    <form method="dialog" class="reset-demo-actions">
      <button class="button" value="back" autofocus>Keep Demo Data</button>
      <button class="button primary" value="reset">Reset Demo</button>
    </form>
    <p id="reset-demo-error" role="status" hidden></p>`;
  document.body.append(dialog);
  const error = dialog.querySelector('#reset-demo-error');
  let resetting = false;
  trigger.addEventListener('click', () => {
    if (resetting) return;
    dialog.returnValue = '';
    error.hidden = true;
    dialog.showModal();
  });
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'reset') { trigger.focus(); return; }
    resetting = true;
    const result = await withMarketWrite(() => resetDemoStorage(() => localStorage));
    resetting = false;
    if (!result.error) {
      location.replace('index.html');
      return;
    }
    error.textContent = 'Demo data could not be reset. Check browser storage and try again.';
    error.hidden = false;
    dialog.returnValue = '';
    dialog.showModal();
  });
}
