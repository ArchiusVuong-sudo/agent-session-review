import type { Ingredient, Recipe } from "./types";

export function buildShoppingList(recipes: Recipe[]): Ingredient[] {
  const byName = new Map<string, Ingredient>();
  for (const recipe of recipes) {
    for (const item of recipe.ingredients) {
      const existing = byName.get(item.name);
      if (existing) {
        existing.qty += item.qty;
      } else {
        byName.set(item.name, item);
      }
    }
  }
  return [...byName.values()];
}
