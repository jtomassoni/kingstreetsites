import { normalizeTitleKey } from "@meals/lib/recipes/themealdb-catalog-search";

/**
 * Everyday / familiar TheMealDB titles for household library seed.
 * Full catalog (~777) stays available for search + on-demand import;
 * seed defaults to this curated set so Recipes isn’t a world-cuisine dump.
 */
export const CURATED_THEMEALDB_TITLES = [
  // Pasta / Italian staples
  "Spaghetti Bolognese",
  "Spaghetti alla Carbonara",
  "Fettuccine Alfredo",
  "Lasagne",
  "Vegan Lasagna",
  "Spicy Arrabiata Penne",
  "Pizza Express Margherita",
  "Chicken Alfredo Primavera",
  "Spinach & Ricotta Cannelloni",
  "Mediterranean Pasta Salad",
  "Chilli prawn linguine",
  "Rigatoni with fennel sausage sauce",
  "Potato Gratin with Chicken",
  "Osso Buco alla Milanese",
  "Salmon Prawn Risotto",

  // American weeknight
  "BBQ Pork Sloppy Joes",
  "Beef Brisket Pot Roast",
  "Chicken Enchilada Casserole",
  "Chicken Fajita Mac and Cheese",
  "Clam chowder",
  "Crock Pot Chicken Baked Tacos",
  "French Onion Chicken with Roasted Carrots & Mashed Potatoes",
  "Grilled Mac and Cheese Sandwich",
  "Honey Balsamic Chicken with Crispy Broccoli & Potatoes",
  "Kentucky Fried Chicken",
  "Pancakes",
  "Banana Pancakes",
  "Breakfast Potatoes",
  "Skillet Apple Pork Chops with Roasted Sweet Potatoes & Zucchini",
  "Soy-Glazed Meatloaves with Wasabi Mashed Potatoes & Roasted Carrots",
  "Lasagna Sandwiches",
  "Extra crispy chicken wings",
  "Creamy Mustard Chicken",
  "Cuban Sandwich",
  "Cabbage with Ground Beef",
  "Salmon Eggs Eggs Benedict",

  // Mexican-leaning
  "Cajun spiced fish tacos",
  "Chickpea Fajitas",
  "Braised Beef Chilli",
  "Stuffed Bell Peppers with Quinoa and Black Beans",

  // Comfort / British-Irish classics people recognize
  "Creamy Tomato Soup",
  "Fish pie",
  "Three Fish Pie",
  "Baked salmon with fennel & tomatoes",
  "Turkey Meatloaf",
  "Vegetable Shepherds Pie",
  "Irish stew",
  "Corned Beef and Cabbage",
  "Corned Beef Hash",
  "English Breakfast",
  "Full English Breakfast",
  "Beef Sunday Roast",
  "Toad In The Hole",
  "Vegetarian Chilli",
  "Vegetarian Casserole",
  "Smoky Lentil Chili with Squash",
  "Bean & Sausage Hotpot",
  "Chicken & mushroom Hotpot",
  "Split Pea Soup",
  "Salmon Avocado Salad",
  "Chicken Ham and Leek Pie",
  "Beef Wellington",

  // Takeout-style Chinese / Japanese / Thai
  "Chicken Fried Rice",
  "Beef and Broccoli Stir-Fry",
  "Beef Lo Mein",
  "Chinese Orange Chicken",
  "General Tsos Chicken",
  "Kung Pao Chicken",
  "Sweet and Sour Chicken",
  "Sweet and Sour Pork",
  "Egg Drop Soup",
  "Hot and Sour Soup",
  "Pad Thai",
  "Thai Green Curry",
  "Honey Teriyaki Salmon",
  "Teriyaki Chicken Casserole",
  "Katsu Chicken curry",
  "Japanese Katsudon",
  "Yaki Udon",
  "Ramen Noodles with Boiled Egg",
  "Ma Po Tofu",
  "Szechuan Beef",
  "Tonkatsu pork",
  "Chicken Karaage",
  "Stir-fried chicken with chillies & basil",
  "Thai beef stir-fry",
  "Thai pork & peanut curry",
  "Thai prawn curry",
  "Prawn stir-fry",
  "Shrimp Chow Fun",
  "Shrimp With Snow Peas",
  "Massaman Beef curry",
  "Panang chicken curry (kaeng panang gai)",
  "Tom yum soup with prawns",
  "Thai fried rice with prawns & peas",
  "Red curry chicken kebabs",
  "Sushi",

  // Indian staples
  "Tandoori chicken",
  "Dal fry",
  "Kidney Bean Curry",
  "Lamb Biryani",
  "Nutty Chicken Curry",

  // French / other familiar
  "Beef Bourguignon",
  "French Onion Soup",
  "French Omelette",
  "Ratatouille",
  "Steak Diane",
  "Tuna Nicoise",
  "Beef stroganoff",
  "Shakshuka",
  "Falafel",
  "Hummus",
  "Paella",
  "Jerk chicken with rice & peas",
  "Jamaican Curry Chicken Recipe",
  "Beef pho",
  "Piri-piri chicken and slaw",
  "Black Bean soup",
  "Classic Potato Salad",
  "Rice and Beans",
  "Molasses Baked Beans",
  "Poutine",
  "Chicken Congee",
] as const;

const CURATED_KEYS = new Set(
  CURATED_THEMEALDB_TITLES.map((title) => normalizeTitleKey(title)),
);

export function isCuratedThemealdbTitle(title: string): boolean {
  return CURATED_KEYS.has(normalizeTitleKey(title));
}

export function filterCuratedThemealdbRecipes<T extends { title: string }>(
  recipes: T[],
): T[] {
  return recipes.filter((r) => isCuratedThemealdbTitle(r.title));
}
