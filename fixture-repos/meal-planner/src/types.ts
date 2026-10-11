export interface Ingredient {
  name: string;
  qty: number;
  unit: string;
}

export interface Recipe {
  name: string;
  servings: number;
  ingredients: Ingredient[];
}
