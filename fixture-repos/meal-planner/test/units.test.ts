import { describe, expect, it } from "vitest";
import { formatQty } from "../src/units";

describe("formatQty", () => {
  it("rounds to two places", () => {
    expect(formatQty(1 / 3, "cup")).toBe("0.33 cup");
  });

  it("drops an empty unit", () => {
    expect(formatQty(2, "")).toBe("2");
  });
});
