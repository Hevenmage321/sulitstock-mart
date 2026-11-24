import { categories, offers, products, suppliers } from './data.js';

export const productsById = new Map(products.map(product => [product.id, product]));
export const suppliersById = new Map(suppliers.map(supplier => [supplier.id, supplier]));
export const offersById = new Map(offers.map(offer => [offer.id, offer]));
export const categoriesById = new Map(categories.map(category => [category.id, category]));
