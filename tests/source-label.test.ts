// The source label is what keeps LLM numbers and harness numbers from ever being summed. It is
// reporting metadata, not a control — but if it silently accepted anything, the separation the
// whole measurement rests on would be worthless.
import { describe, expect, it } from "vitest";
import { sourceFrom } from "@/core/guards";

const withSource = (value: string | null) =>
  new Request("http://localhost/api/pay", {
    headers: value === null ? {} : { "x-vouch-source": value },
  });

describe("decision source labelling", () => {
  it("takes the four known sources", () => {
    for (const source of ["mcp", "http", "llm", "harness"]) {
      expect(sourceFrom(withSource(source))).toBe(source);
    }
  });

  it("falls back to http when the header is absent", () => {
    expect(sourceFrom(withSource(null))).toBe("http");
  });

  it("refuses to invent a category from an unknown value", () => {
    for (const junk of ["", "LLM", "agent", "llm; harness", "../harness"]) {
      expect(sourceFrom(withSource(junk))).toBe("http");
    }
  });
});
