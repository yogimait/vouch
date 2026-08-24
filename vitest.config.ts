import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // One alias, mirroring tsconfig's `@/*` -> `./*`. Two lists would drift.
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    // The audit chain is one global row order and a tamper test breaks it on purpose, so anything
    // verifying in parallel fails at random.
    fileParallelism: false,
  },
});
