// The one rule the cupboard exists to keep: an agent handed a part number is a form, not an agent.
// Pure, so it runs with no database — the seed module only touches one when seed() is called.
import { describe, expect, it } from "vitest";
import { CUPBOARD } from "@/core/db/seed";

describe("seeded errands", () => {
  it("never hands the agent a part number", () => {
    for (const shelf of CUPBOARD) {
      expect(shelf.need, shelf.name).not.toMatch(/\bSKU[-_ ]?[A-Z0-9]+\b/i);
    }
  });

  it("asks for something, in a sentence a person would write", () => {
    for (const shelf of CUPBOARD) {
      expect(shelf.need.length, shelf.name).toBeGreaterThan(20);
      expect(shelf.need.trim(), shelf.name).toMatch(/[.!]$/);
    }
  });

  // start above reorder, or the shelf is below its line the moment it is seeded and the very first
  // tick raises every errand at once — which is the demo having no story rather than four.
  it("starts every shelf above its reorder level", () => {
    for (const shelf of CUPBOARD) {
      expect(shelf.start, shelf.name).toBeGreaterThan(shelf.reorder);
      expect(shelf.usage, shelf.name).toBeGreaterThan(0);
    }
  });
});
