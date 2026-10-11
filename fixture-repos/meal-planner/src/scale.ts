import type { Recipe } from "./types";

export function scaleRecipe(recipe: Recipe, servings: number): Recipe {
  const factor = servings / recipe.servings;
  return {
    ...recipe,
    servings,
    ingredients: recipe.ingredients.map((item) => ({ ...item, qty: item.qty * factor })),
  };
}
