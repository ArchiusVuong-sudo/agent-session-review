import type { Ingredient } from "./types";

export function mergePantry(pantry: Ingredient[], bought: Ingredient[]): Ingredient[] {
  const byName = new Map(pantry.map((item) => [item.name, item]));
  for (const item of bought) {
    const existing = byName.get(item.name);
    if (existing) {
      existing.qty += item.qty;
    } else {
      byName.set(item.name, item);
    }
  }
  return [...byName.values()];
}
