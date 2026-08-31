// The one rule the cupboard exists to keep: an agent handed a part number is a form, not an agent.
// Pure, so it runs with no database — the seed module only touches one when seed() is called.
import { describe, expect, it } from "vitest";
import { CUPBOARD } from "@/core/db/seed";
import { askFor } from "@/demo/ops";

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

  // The sentence carries no number, so the shelf cannot ask for a quantity that has nothing to do
  // with how short it is. That was the bug: "Order one" bought one and the cupboard filled anyway.
  it("leaves the quantity out of the shelf's own words", () => {
    for (const shelf of CUPBOARD) {
      expect(shelf.need, shelf.name).not.toMatch(/(one|two|three|four|five|\d+)/i);
    }
  });

  // Caught live: a need that said "the support desk hands these out" named nothing, and the model
  // quoted headphones. The sentence has to say what is wanted -- in the buyer's words, not a SKU.
  it("names what the shelf holds, in plain words", () => {
    for (const shelf of CUPBOARD) {
      const thing = shelf.name.split(" ")[0].toLowerCase();
      expect(shelf.need.toLowerCase(), shelf.name).toContain(thing);
    }
  });

  it("asks for exactly what the shelf is short", () => {
    const shelf = CUPBOARD[0];
    const asked = askFor({ need: shelf.need, on_hand: shelf.reorder, start_on_hand: shelf.start });
    expect(asked).toContain(shelf.need);
    expect(asked).toContain(`order ${shelf.start - shelf.reorder}`);
  });

  // Every shelf crosses at a different tick, or they all arrive at once and the queue is the story
  // instead of the guard.
  it("staggers when the shelves cross", () => {
    const gaps = CUPBOARD.map((s) => (s.start - s.reorder) / s.usage);
    expect(new Set(gaps).size, gaps.join(",")).toBe(CUPBOARD.length);
  });
});
