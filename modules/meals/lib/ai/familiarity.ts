import { normalizeQuery, stripLeadingArticles } from "@meals/lib/ai/normalize-query";

export const UNFAMILIAR_DISH_MESSAGE =
  "That’s not something we’re familiar with.";

/**
 * Whole-query drink names only. "beer can chicken" must not match "beer".
 * Mashups like "screwdriver pizza" are left to the model.
 */
const KNOWN_DRINKS = new Set([
  "beer",
  "wine",
  "red wine",
  "white wine",
  "coffee",
  "tea",
  "iced tea",
  "latte",
  "espresso",
  "cappuccino",
  "smoothie",
  "milkshake",
  "shake",
  "cocktail",
  "mocktail",
  "soda",
  "pop",
  "juice",
  "water",
  "sparkling water",
  "kombucha",
  "screwdriver",
  "margarita",
  "mojito",
  "daiquiri",
  "martini",
  "manhattan",
  "negroni",
  "old fashioned",
  "whiskey sour",
  "gin and tonic",
  "vodka soda",
  "rum and coke",
  "cuba libre",
  "pina colada",
  "bloody mary",
  "mimosa",
  "bellini",
  "irish coffee",
  "hot chocolate",
  "cocoa",
  "cider",
  "hard cider",
  "champagne",
  "prosecco",
  "whiskey",
  "whisky",
  "vodka",
  "gin",
  "rum",
  "tequila",
  "bourbon",
  "brandy",
  "cognac",
  "liqueur",
]);

export function isKnownDrinkQuery(value: string): boolean {
  const normalized = stripLeadingArticles(normalizeQuery(value));
  return Boolean(normalized) && KNOWN_DRINKS.has(normalized);
}
