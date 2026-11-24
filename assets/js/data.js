import { offerPhoto, productPhoto } from './product-photos.js';
import { commercialOffers } from './commercial-data.js';
import { getOfferShipping, getProductShippingWeight } from './shipping-weights.js';
import { locationsById, metroManilaIds } from './locations.js';
export { buyerLocations } from './locations.js';

// Fictional catalog for the SulitStock Mart demonstration.
export const categories = [
  { id: 'meat', label: 'Meat and Poultry', section: 'meat', subcategories: [{ id: 'chicken', label: 'Chicken' }, { id: 'pork', label: 'Pork' }, { id: 'beef', label: 'Beef' }] },
  { id: 'seafood', label: 'Seafood', section: 'products', subcategories: [{ id: 'crustaceans', label: 'Crustaceans' }, { id: 'finfish', label: 'Finfish' }, { id: 'cephalopods', label: 'Squid and related seafood' }] },
  { id: 'vegetables', label: 'Vegetables', section: 'produce', subcategories: [{ id: 'roots', label: 'Roots' }, { id: 'fruiting', label: 'Fruiting vegetables' }, { id: 'leafy', label: 'Leafy' }, { id: 'alliums', label: 'Onions and garlic' }] },
  { id: 'fruits', label: 'Fruits', section: 'produce', subcategories: [{ id: 'tropical', label: 'Tropical' }, { id: 'citrus', label: 'Citrus' }] },
  { id: 'rice', label: 'Rice and Grains', section: 'grains', subcategories: [{ id: 'long-grain', label: 'Long grain' }, { id: 'sticky-rice', label: 'Sticky rice' }, { id: 'other-grains', label: 'Other grains' }] },
  { id: 'oils', label: 'Cooking Oils', section: 'pantry', subcategories: [{ id: 'neutral-oils', label: 'Neutral oils' }, { id: 'specialty-oils', label: 'Specialty oils' }] },
  { id: 'herbs', label: 'Herbs and Seasonings', section: 'pantry', subcategories: [{ id: 'whole-spices', label: 'Whole spices' }, { id: 'dried-herbs', label: 'Dried herbs' }, { id: 'salt', label: 'Salt' }, { id: 'ground-spices', label: 'Ground spices' }] },
  { id: 'sauces', label: 'Sauces and Condiments', section: 'pantry', subcategories: [{ id: 'soy-sauces', label: 'Soy sauces' }, { id: 'vinegars', label: 'Vinegars' }, { id: 'fish-sauces', label: 'Fish sauces' }, { id: 'cooking-sauces', label: 'Cooking sauces' }] },
  { id: 'dairy', label: 'Dairy and Eggs', subcategories: [{ id: 'eggs', label: 'Eggs' }, { id: 'milk', label: 'Milk' }, { id: 'butter', label: 'Butter' }, { id: 'cheese', label: 'Cheese' }] },
  { id: 'frozen', label: 'Frozen Goods', subcategories: [{ id: 'potato', label: 'Potato products' }, { id: 'processed-meat', label: 'Processed meat' }, { id: 'vegetable-mixes', label: 'Vegetable mixes' }, { id: 'wrappers', label: 'Wrappers' }] },
  { id: 'dry', label: 'Dry Goods', section: 'grains', subcategories: [{ id: 'pasta', label: 'Pasta' }, { id: 'flour', label: 'Flour' }, { id: 'noodles', label: 'Noodles' }, { id: 'sugar', label: 'Sugar' }, { id: 'starches', label: 'Starches' }] },
  { id: 'beverages', label: 'Beverages', subcategories: [{ id: 'coffee', label: 'Coffee' }, { id: 'tea', label: 'Tea' }, { id: 'water', label: 'Water' }, { id: 'juice', label: 'Juice' }] },
  { id: 'packaging', label: 'Food Packaging', subcategories: [{ id: 'takeout', label: 'Takeout' }, { id: 'cups', label: 'Cups' }, { id: 'cutlery', label: 'Cutlery' }] },
];

const provincialCoverage = {
  'san-isidro': ['cainta', 'san-mateo'],
  'marikina-cold': ['cainta', 'taytay', 'antipolo', 'san-mateo', 'rodriguez'],
  'bayan-harvest': ['cainta', 'taytay', 'antipolo', 'angono', 'binangonan'],
  sagana: ['cainta', 'taytay', 'bacoor'],
  dagat: ['meycauayan', 'marilao'],
  palengke: ['bacoor', 'imus'],
  bukid: ['cainta', 'taytay', 'antipolo', 'angono', 'san-mateo', 'rodriguez', 'binangonan'],
  palay: ['meycauayan', 'marilao', 'bocaue', 'san-jose-del-monte'],
  masinop: ['cainta', 'taytay'],
  sarsa: ['cainta', 'antipolo'],
  gatas: ['san-mateo', 'rodriguez', 'antipolo'],
  yelo: ['bacoor', 'imus', 'dasmarinas', 'san-pedro', 'binan', 'santa-rosa'],
  tasa: ['san-pedro', 'binan', 'santa-rosa'],
  balot: ['meycauayan', 'marilao', 'bocaue'],
  tiklop: ['meycauayan', 'bacoor'],
};

function supplier(id, name, type, description, city, province, latitude, longitude, categoryIds, leadTimeHours, methods, operatingHours) {
  return {
    id, name, type, description, fictional: true, categoryIds,
    logo: `assets/images/suppliers/${id}.svg`,
    location: { label: province === 'Metro Manila' ? city : `${city}, ${province}`, city, province, latitude, longitude },
    delivery: {
      coverageIds: [...metroManilaIds, ...provincialCoverage[id]],
      coverage: [...metroManilaIds, ...provincialCoverage[id]].map(place => locationsById.get(place).city),
      leadTimeHours, methods,
    },
    operatingHours,
  };
}

export const suppliers = [
  supplier('san-isidro', 'San Isidro Provisions', 'Meat wholesaler', 'Portions chilled poultry, pork, and beef for restaurant kitchens.', 'Quezon City', 'Metro Manila', 14.684, 121.088, ['meat'], [12, 24], ['Chilled delivery', 'Pickup'], 'Mon–Sat 05:00–15:00'),
  supplier('marikina-cold', 'Marikina Cold Supply', 'Cold chain distributor', 'Supplies chilled protein and frozen staples to small food businesses.', 'Marikina', 'Metro Manila', 14.653, 121.116, ['meat', 'seafood', 'frozen'], [12, 36], ['Chilled delivery', 'Frozen delivery', 'Pickup'], 'Mon–Sat 06:00–17:00'),
  supplier('bayan-harvest', 'Bayan Harvest Trading', 'Produce wholesaler', 'Consolidates fresh produce for markets, restaurants, and caterers.', 'Cainta', 'Rizal', 14.581, 121.115, ['vegetables', 'fruits'], [8, 24], ['Scheduled delivery', 'Pickup'], 'Mon–Sat 04:00–13:00'),
  supplier('sagana', 'Sagana Pantry Supply', 'Dry goods distributor', 'Stocks rice, dry goods, and common cooking staples for food service.', 'Pasig', 'Metro Manila', 14.579, 121.084, ['rice', 'dry', 'oils', 'herbs', 'sauces'], [12, 36], ['Scheduled delivery', 'Pickup'], 'Mon–Sat 07:00–17:00'),
  supplier('dagat', 'Dagat Silangan Seafood', 'Seafood wholesaler', 'Handles iced fish, squid, and shellfish in restaurant-size lots.', 'Navotas', 'Metro Manila', 14.675, 120.933, ['seafood'], [6, 24], ['Chilled delivery', 'Pickup'], 'Tue–Sun 03:00–12:00'),
  supplier('palengke', 'Palengke Bridge Supply', 'Market consolidator', 'Combines staples from wet-market produce, meat, seafood, rice, and egg stalls.', 'Manila', 'Metro Manila', 14.619, 120.969, ['vegetables', 'fruits', 'seafood', 'rice', 'dairy', 'meat'], [8, 24], ['Scheduled delivery', 'Chilled delivery', 'Pickup'], 'Mon–Sat 04:00–14:00'),
  supplier('bukid', 'Bukid Link Growers', 'Farmers’ cooperative', 'Pools vegetables and seasonal fruit from small farms for wholesale dispatch.', 'Antipolo', 'Rizal', 14.613, 121.170, ['vegetables', 'fruits'], [12, 36], ['Scheduled delivery', 'Pickup'], 'Mon–Sat 05:00–14:00'),
  supplier('palay', 'Palay Junction Milling', 'Rice and grain wholesaler', 'Supplies food-service rice sacks and selected grains.', 'Bocaue', 'Bulacan', 14.798, 120.926, ['rice'], [24, 48], ['Scheduled delivery', 'Pickup'], 'Mon–Sat 07:00–16:00'),
  supplier('masinop', 'Masinop Bakery Supply', 'Bakery ingredient distributor', 'Supplies bakery staples, grains, butter, and cheese to production kitchens.', 'Mandaluyong', 'Metro Manila', 14.578, 121.040, ['dry', 'rice', 'dairy'], [12, 36], ['Scheduled delivery', 'Chilled delivery', 'Pickup'], 'Mon–Sat 07:00–17:00'),
  supplier('sarsa', 'Sarsa Kitchen Wholesale', 'Condiment and oil wholesaler', 'Handles case lots of sauces, vinegars, oils, and seasonings.', 'San Juan', 'Metro Manila', 14.603, 121.033, ['oils', 'sauces', 'herbs'], [12, 36], ['Scheduled delivery', 'Pickup'], 'Mon–Fri 08:00–17:00'),
  supplier('gatas', 'Gatas Lane Dairy Supply', 'Dairy and beverage distributor', 'Consolidates dairy, eggs, and beverage staples for bakeries, cafés, and kitchens.', 'San Mateo', 'Rizal', 14.697, 121.121, ['dairy', 'beverages'], [12, 36], ['Chilled delivery', 'Pickup'], 'Mon–Sat 06:00–15:00'),
  supplier('yelo', 'Yelo Bay Frozen Supply', 'Frozen food distributor', 'Specializes in frozen fryer staples, vegetables, and wrappers.', 'Parañaque', 'Metro Manila', 14.487, 121.024, ['frozen'], [12, 36], ['Frozen delivery', 'Pickup'], 'Mon–Sat 07:00–16:00'),
  supplier('tasa', 'Tasa Corner Provisions', 'Café supplies wholesaler', 'Stocks beverage ingredients, milk, and sugar for cafés and concessionaires.', 'Makati', 'Metro Manila', 14.558, 121.020, ['beverages', 'dairy', 'dry', 'packaging'], [12, 36], ['Scheduled delivery', 'Pickup'], 'Mon–Sat 08:00–17:00'),
  supplier('balot', 'Balot Papel Food Packs', 'Food packaging wholesaler', 'Supplies paper cups, takeaway cartons, and food-service disposables.', 'Valenzuela', 'Metro Manila', 14.708, 120.979, ['packaging'], [24, 48], ['Scheduled delivery', 'Pickup'], 'Mon–Sat 08:00–17:00'),
  supplier('tiklop', 'Tiklop Service Packaging', 'Food packaging distributor', 'Supplies takeaway containers and tableware by case or bundle.', 'Caloocan', 'Metro Manila', 14.657, 120.986, ['packaging'], [12, 36], ['Scheduled delivery', 'Pickup'], 'Mon–Fri 08:00–17:00'),
];

const storageRequirements = {
  chilled: 'Refrigerate at 0–4 °C. Follow packaging instructions.',
  frozen: 'Keep frozen at −18 °C or colder.',
  cool: 'Store in a cool, ventilated area away from direct sunlight.',
  dry: 'Store unopened in a cool, dry place. Follow packaging instructions after opening.',
};

function product(id, name, categoryId, subcategoryId, description, unit, packaging, storage) {
  return {
    id, name, categoryId, subcategoryId, description, unit, packaging,
    shipping: { grossKgPerUnit: getProductShippingWeight(id), package: packaging },
    storage: storageRequirements[storage],
    transport: storage === 'frozen' ? 'frozen'
      : storage === 'chilled' && ['meat', 'seafood', 'dairy'].includes(categoryId) ? 'chilled' : 'standard',
    image: productPhoto(id),
  };
}

export const products = [
  product("chicken-breast", "Chicken Breast Fillet", "meat", "chicken", "Boneless, skinless breast for grilling, breading, or portioning.", "kg", "1 kg vacuum pack", "chilled"),
  product("chicken-thigh", "Chicken Thigh Fillet", "meat", "chicken", "Boneless thigh cuts for skewers, adobo, and fried chicken.", "kg", "1 kg vacuum pack", "chilled"),
  product("whole-chicken", "Whole Dressed Chicken", "meat", "chicken", "Eviscerated whole birds for roasting, soups, and portion cuts.", "kg", "Approx. 1.2 kg per bird, priced by weight", "chilled"),
  product("pork-belly", "Pork Belly Slices", "meat", "pork", "Skin-on belly slices for grilling and braising.", "kg", "1 kg vacuum pack", "chilled"),
  product("ground-pork", "Ground Pork", "meat", "pork", "Medium-grind pork for lumpia, dumplings, and giniling.", "kg", "1 kg vacuum pack", "chilled"),
  product("beef-chuck", "Beef Chuck Cubes", "meat", "beef", "Cubed beef shoulder for stews and braises.", "kg", "1 kg vacuum pack", "chilled"),
  product("ground-beef", "Ground Beef", "meat", "beef", "Medium-grind beef for patties and pasta sauces.", "kg", "1 kg vacuum pack", "chilled"),
  product("prawns", "Fresh Gray Prawns", "seafood", "crustaceans", "Raw shell-on prawns for sautéing, grilling, and soups.", "kg", "1 kg iced pouch", "chilled"),
  product("bangus", "Whole Bangus", "seafood", "finfish", "Cleaned whole milkfish for grilling and frying.", "kg", "Approx. 400–600 g per fish, priced by weight", "chilled"),
  product("tilapia", "Whole Tilapia", "seafood", "finfish", "Whole cleaned tilapia for roasting or frying.", "kg", "Approx. 300–500 g per fish, priced by weight", "chilled"),
  product("squid", "Cleaned Squid", "seafood", "cephalopods", "Cleaned squid tubes and tentacles for calamari and adobo.", "kg", "1 kg iced pouch", "chilled"),
  product("tuna-loin", "Tuna Loin", "seafood", "finfish", "Skinless tuna loin for searing or grilling.", "kg", "1 kg vacuum pack", "chilled"),
  product("carrots", "Fresh Carrots", "vegetables", "roots", "Whole trimmed carrots for prep, stock, and side dishes.", "kg", "Loose, packed in vented crates", "chilled"),
  product("tomatoes", "Fresh Red Tomatoes", "vegetables", "fruiting", "Firm red tomatoes for sauces, salads, and sauté bases.", "kg", "Loose, packed in vented crates", "cool"),
  product("pechay", "Fresh Pechay", "vegetables", "leafy", "Tender leafy greens for soups, stir-fries, and braises.", "kg", "Loose bunches in vented crates", "chilled"),
  product("red-onions", "Red Onions", "vegetables", "alliums", "Cured red onions for sauté bases, pickles, and salads.", "kg", "Loose bulbs in mesh sacks", "dry"),
  product("garlic", "Whole Garlic", "vegetables", "alliums", "Imported commodity-grade cured garlic bulbs for sauces, marinades, and sauté bases.", "kg", "Loose bulbs in mesh sacks", "dry"),
  product("cabbage", "Green Cabbage", "vegetables", "leafy", "Compact heads for pancit, slaw, and soups.", "kg", "Loose heads in vented crates", "chilled"),
  product("potatoes", "Fresh Potatoes", "vegetables", "roots", "All-purpose potatoes for fries, stews, and roasting.", "kg", "Loose, packed in mesh sacks", "cool"),
  product("mangoes", "Ripe Philippine Mangoes", "fruits", "tropical", "Ripe yellow mangoes for desserts, beverages, and service.", "kg", "Loose fruit in padded crates", "cool"),
  product("saba-bananas", "Saba Bananas", "fruits", "tropical", "Firm cooking bananas for turon, saba con hielo, and stews.", "kg", "Whole hands in vented crates", "cool"),
  product("calamansi", "Fresh Calamansi", "fruits", "citrus", "Small tart citrus for marinades, dips, and beverages.", "kg", "Loose fruit in vented crates", "chilled"),
  product("pineapple", "Fresh Pineapple", "fruits", "tropical", "Whole ripe pineapples for dessert, juice, and cooked dishes.", "kg", "Loose whole fruit, priced by weight", "cool"),
  product("papaya", "Ripe Papaya", "fruits", "tropical", "Whole ripe papayas for fruit service and drinks.", "kg", "Loose whole fruit, priced by weight", "cool"),
  product("jasmine-rice", "Jasmine Rice", "rice", "long-grain", "Fragrant long-grain rice for steamed rice and rice bowls.", "sack", "25 kg woven sack", "dry"),
  product("well-milled-rice", "Well-Milled Rice", "rice", "long-grain", "Standard white long-grain rice for everyday service.", "sack", "25 kg woven sack", "dry"),
  product("glutinous-rice", "Glutinous Rice", "rice", "sticky-rice", "Sticky white rice for kakanin, suman, and porridge.", "kg", "1 kg sealed bag", "dry"),
  product("rolled-oats", "Rolled Oats", "rice", "other-grains", "Whole rolled oats for breakfast bowls, baking, and blends.", "kg", "1 kg sealed bag", "dry"),
  product("cooking-oil", "Vegetable Cooking Oil", "oils", "neutral-oils", "Neutral refined oil for pan cooking and deep frying.", "L", "1 L sealed bottle", "dry"),
  product("canola-oil", "Canola Oil", "oils", "neutral-oils", "Mild refined oil for frying, baking, and dressings.", "L", "1 L sealed bottle", "dry"),
  product("coconut-oil", "Refined Coconut Oil", "oils", "specialty-oils", "Refined coconut oil for frying and bakery use.", "L", "1 L sealed bottle", "dry"),
  product("peppercorns", "Whole Black Peppercorns", "herbs", "whole-spices", "Dried whole black pepper for adobo, stock, and grinding.", "kg", "1 kg sealed pouch", "dry"),
  product("bay-leaves", "Dried Bay Leaves", "herbs", "dried-herbs", "Whole dried leaves for adobo, marinades, and stocks.", "g", "100 g sealed pouch, priced per gram", "dry"),
  product("iodized-salt", "Iodized Fine Salt", "herbs", "salt", "Fine-grain iodized salt for prep, marinades, and seasoning.", "kg", "1 kg sealed bag", "dry"),
  product("paprika", "Ground Paprika", "herbs", "ground-spices", "Mild red ground spice for rubs, sauces, and seasoning blends.", "g", "100 g sealed pouch, priced per gram", "dry"),
  product("soy-sauce", "Soy Sauce", "sauces", "soy-sauces", "All-purpose soy sauce for marinades, dipping, and cooking.", "L", "1 L sealed bottle", "dry"),
  product("cane-vinegar", "Cane Vinegar", "sauces", "vinegars", "Clear cane vinegar for adobo, pickling, and dipping sauces.", "L", "1 L sealed bottle", "dry"),
  product("fish-sauce", "Patis Fish Sauce", "sauces", "fish-sauces", "Salty fermented fish sauce for soups, marinades, and dipping.", "L", "1 L sealed bottle", "dry"),
  product("oyster-sauce", "Oyster Sauce", "sauces", "cooking-sauces", "Thick savory cooking sauce for marinades and stir-fries.", "L", "1 L sealed bottle", "dry"),
  product("chicken-eggs", "Large Chicken Eggs", "dairy", "eggs", "Large shell eggs for breakfast, baking, and prep.", "pack", "30 eggs per tray", "chilled"),
  product("whole-milk", "Whole UHT Milk", "dairy", "milk", "Shelf-stable whole milk for cafés and kitchens.", "L", "1 L sealed carton", "dry"),
  product("unsalted-butter", "Unsalted Butter", "dairy", "butter", "Unsalted dairy butter for bakery, sautéing, and sauces.", "pack", "227 g wrapped block", "chilled"),
  product("mozzarella", "Shredded Mozzarella", "dairy", "cheese", "Low-moisture shredded cheese for pizza, pasta, and baked dishes.", "kg", "1 kg sealed pouch", "chilled"),
  product("french-fries", "Frozen Straight-Cut Fries", "frozen", "potato", "Straight-cut frozen potatoes for quick-service fryers.", "kg", "1 kg freezer bag", "frozen"),
  product("chicken-nuggets", "Frozen Chicken Nuggets", "frozen", "processed-meat", "Breaded chicken portions for frying or baking.", "kg", "1 kg freezer bag", "frozen"),
  product("mixed-vegetables", "Frozen Mixed Vegetables", "frozen", "vegetable-mixes", "Diced carrots, peas, and corn for quick prep.", "kg", "1 kg freezer bag", "frozen"),
  product("lumpia-wrappers", "Frozen Lumpia Wrappers", "frozen", "wrappers", "Thin spring-roll sheets for savory or sweet fillings.", "pack", "50 sheets per freezer pack", "frozen"),
  product("macaroni", "Elbow Macaroni", "dry", "pasta", "Dry elbow pasta for salads, soups, and baked dishes.", "kg", "1 kg sealed bag", "dry"),
  product("flour", "All-Purpose Flour", "dry", "flour", "General-purpose wheat flour for batters, dredging, and baking.", "kg", "1 kg dry bag", "dry"),
  product("rice-vermicelli", "Rice Vermicelli", "dry", "noodles", "Thin dried rice noodles for pancit bihon and soups.", "kg", "1 kg sealed bag", "dry"),
  product("white-sugar", "Refined White Sugar", "dry", "sugar", "Fine white sugar for bakery, beverages, and sauces.", "kg", "1 kg sealed bag", "dry"),
  product("cornstarch", "Cornstarch", "dry", "starches", "Fine corn starch for thickening and crisp coatings.", "kg", "1 kg sealed bag", "dry"),
  product("barako-coffee", "Barako Coffee Beans", "beverages", "coffee", "Roasted whole liberica beans for cafés and brewed service.", "kg", "1 kg valve bag", "dry"),
  product("black-tea", "Black Tea Bags", "beverages", "tea", "Black tea bags for hot service and batches of iced tea.", "box", "100 tea bags per box", "dry"),
  product("bottled-water", "Bottled Drinking Water", "beverages", "water", "Sealed drinking-water bottles for takeaway and events.", "box", "24 bottles × 350 mL", "dry"),
  product("calamansi-concentrate", "Calamansi Juice Concentrate", "beverages", "juice", "Calamansi concentrate for chilled beverage service.", "L", "1 L sealed bottle", "chilled"),
  product("kraft-lunch-box", "Kraft Lunch Box", "packaging", "takeout", "Fold-top kraft container for takeaway rice meals.", "pack", "50 cartons × 750 mL capacity", "dry"),
  product("paper-hot-cups", "Paper Hot Cups", "packaging", "cups", "Single-wall paper cups for takeaway hot drinks.", "pack", "50 cups × 12 fl oz capacity", "dry"),
  product("wooden-cutlery", "Wooden Cutlery Set", "packaging", "cutlery", "Wooden spoon and fork sets for packed meals.", "box", "100 sets per box", "dry"),
  product("bagasse-container", "Bagasse Takeout Container", "packaging", "takeout", "Molded sugarcane-fiber clamshell for takeaway meals.", "pack", "50 clamshells × 750 mL capacity", "dry"),
];

const stockedProducts = new Map(products.map(product => [product.id, product]));

export const offers = commercialOffers.flatMap(([productId, supplierOffers]) => {
  const product = stockedProducts.get(productId);
  return supplierOffers.map(([supplierId, availableStock, tiers, increment, pack, grossKgPerUnit]) => {
    const id = `${productId}-${supplierId}`;
    const minimumOrderQuantity = tiers[0][0];
    return {
      id, productId, supplierId, minimumOrderQuantity, availableStock,
      image: offerPhoto(id),
      quantityIncrement: increment ?? (product.unit === 'g' ? 100 : 1),
      status: availableStock < minimumOrderQuantity ? 'out-of-stock' : 'available',
      packaging: pack ?? product.packaging,
      shipping: pack ? { package: pack, grossKgPerUnit } : getOfferShipping(product, id),
      priceTiers: tiers.map(([minimumQuantity, price]) => ({
        minimumQuantity,
        unitPriceCentavos: Math.round(price * 100),
      })),
    };
  });
});
