import type { Recipe } from "../src/types";

export const pancakes: Recipe = {
  name: "pancakes",
  servings: 2,
  ingredients: [
    { name: "flour", qty: 200, unit: "g" },
    { name: "milk", qty: 300, unit: "ml" },
    { name: "eggs", qty: 2, unit: "" },
  ],
};

export const omelette: Recipe = {
  name: "omelette",
  servings: 1,
  ingredients: [
    { name: "eggs", qty: 3, unit: "" },
    { name: "milk", qty: 50, unit: "ml" },
  ],
};
