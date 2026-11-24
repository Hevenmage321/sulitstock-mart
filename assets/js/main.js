import { applyInventory, readInventory } from './market-state.js';
import { categories } from './data.js';
import { categoriesById, offersById, suppliersById } from './catalog-records.js';
import { featuredSupplierIds, shelves } from './homepage-data.js';
import { categoryLink, initializeMarketplace, renderOffer, setMerchantLogo, setSupplierContact, supplierLink, updateDistances } from './marketplace-ui.js';

const categoryList = document.querySelector('#category-list');

function sampleControl(label, kind) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.demo = kind;
  return button;
}

function renderCategories() {
  for (const category of categories) {
    const listItem = document.createElement('li');
    const tile = categoryLink(category);
    const image = document.createElement('img');
    image.src = `assets/images/categories/${category.id}.jpg`;
    image.alt = '';
    image.width = 58;
    image.height = 58;
    image.addEventListener('error', () => { image.hidden = true; });
    tile.classList.add('category-tile');
    tile.prepend(image);
    listItem.append(tile);
    categoryList.append(listItem);
  }
}

function renderSuppliers() {
  const list = document.querySelector('#supplier-list');
  for (const id of featuredSupplierIds) {
    const supplier = suppliersById.get(id);
    const card = document.createElement('article');
    card.className = 'supplier';
    const identity = document.createElement('div');
    identity.className = 'featured-merchant';
    const logo = document.createElement('img');
    logo.className = 'merchant-logo';
    logo.alt = '';
    logo.width = logo.height = 42;
    logo.loading = 'lazy';
    setMerchantLogo(logo, id);
    const name = document.createElement('h3');
    const type = document.createElement('p');
    const location = document.createElement('p');
    const categoryNames = document.createElement('p');
    const contact = sampleControl('Contact Supplier', 'contact');
    name.append(supplierLink(id));
    type.textContent = supplier.type;
    location.textContent = supplier.location.label;
    categoryNames.textContent = supplier.categoryIds.map(id => categoriesById.get(id).label).join(' · ');
    categoryNames.className = 'supplier-categories';
    contact.className = 'text-button';
    setSupplierContact(contact, supplier);
    identity.append(logo, name);
    card.append(identity, type, location, categoryNames, contact);
    list.append(card);
  }
}

renderCategories();
renderSuppliers();
function renderShelves() {
  const inventory = readInventory();
  for (const grid of document.querySelectorAll('[data-shelf]')) {
    grid.replaceChildren(...shelves[grid.dataset.shelf].map(id => renderOffer(applyInventory(offersById.get(id), inventory))));
  }
  updateDistances(getBuyerLocation());
}
const getBuyerLocation = initializeMarketplace(() => updateDistances(getBuyerLocation()), renderShelves);
renderShelves();

const scrollButtons = document.querySelectorAll('[data-scroll]');
function updateScrollButtons() {
  const remaining = categoryList.scrollWidth - categoryList.clientWidth - categoryList.scrollLeft;
  scrollButtons[0].disabled = categoryList.scrollLeft <= 1;
  scrollButtons[1].disabled = remaining <= 1;
}
for (const button of scrollButtons) {
  button.addEventListener('click', () => {
    categoryList.scrollBy({ left: Number(button.dataset.scroll) * categoryList.clientWidth * 0.75 });
  });
}
categoryList.addEventListener('scroll', updateScrollButtons, { passive: true });
window.addEventListener('resize', updateScrollButtons);
updateScrollButtons();


// The shelves are populated after the browser first resolves an incoming fragment.
const sectionId = location.hash.slice(1);
if (['bulk-deals', 'how-it-works'].includes(sectionId)) {
  const initialHash = location.hash;
  let interacted = false;
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    window.addEventListener(event, () => { interacted = true; }, { once: true, passive: true });
  }
  const alignInitialSection = () => requestAnimationFrame(() => {
    if (!interacted && location.hash === initialHash) {
      document.getElementById(sectionId).scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  });
  const settleSection = () => {
    alignInitialSection();
    document.fonts?.ready.then(alignInitialSection);
  };
  if (document.readyState === 'complete') settleSection();
  else window.addEventListener('load', settleSection, { once: true });
}
