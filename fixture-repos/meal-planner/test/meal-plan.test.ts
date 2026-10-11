import { describe, expect, it } from "vitest";
import { scaleRecipe } from "../src/scale";
import { buildShoppingList } from "../src/shopping-list";
import { omelette, pancakes } from "./fixtures";

const qtyOf = (items: { name: string; qty: number }[], name: string) =>
  items.find((item) => item.name === name)?.qty;

describe("scaleRecipe", () => {
  it("scales pancakes to 4 servings", () => {
    const scaled = scaleRecipe(pancakes, 4);
    expect(qtyOf(scaled.ingredients, "eggs")).toBe(4);
    expect(qtyOf(scaled.ingredients, "flour")).toBe(400);
  });

  it("keeps the recipe name", () => {
    expect(scaleRecipe(pancakes, 6).name).toBe("pancakes");
  });
});

describe("buildShoppingList", () => {
  it("merges duplicate ingredients", () => {
    const list = buildShoppingList([pancakes, pancakes]);
    expect(qtyOf(list, "eggs")).toBe(4);
  });

  it("keeps ingredients that appear once", () => {
    const list = buildShoppingList([omelette]);
    expect(list).toHaveLength(2);
  });
});
