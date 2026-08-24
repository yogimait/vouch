import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Architecture as build failures, not review comments. See CLAUDE.md "Enforced boundaries".
 *
 * Flat config REPLACES rule options rather than merging them, so two `no-restricted-imports` blocks
 * matching the same file would silently drop the first. Related bans are fused into one block.
 */
const boundaries = [
  {
    // The admission engine decides whether money moves. It must stay pure so determinism is
    // testable with no database and no keys. Banning node:crypto is deliberate: it forces
    // "the offer signature was valid" to arrive as a boolean on the context.
    files: ["core/engine/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/core/db", "@/core/db/*", "postgres", "drizzle-orm", "drizzle-orm/*",
                  "node:crypto", "crypto", "@/core/razorpay/*"],
          message: "The engine is pure. Do the I/O in the caller and pass the result on the context.",
        }],
      }],
    },
  },
  {
    // Enforcement the agent can bypass is not enforcement.
    files: ["agent/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/core", "@/core/*"],
          message: "The buyer agent is a client. It talks to the surface over HTTP or MCP, never in-process.",
        }],
      }],
    },
  },
  {
    // Both surfaces go through the shared function layer, so neither can grow its own logic.
    files: ["app/api/**/*.ts", "mcp/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["@/core/engine/*", "@/core/db/*"],
          message: "Go through @/core/tools. Routes and MCP are adapters, not logic.",
        }],
      }],
    },
  },
  {
    // A long routing file means logic escaped into it.
    files: ["app/**/route.ts"],
    rules: { "max-lines": ["error", { max: 12, skipBlankLines: false, skipComments: false }] },
  },
  {
    files: ["app/**/page.tsx"],
    rules: { "max-lines": ["error", { max: 60, skipBlankLines: true, skipComments: true }] },
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  ...boundaries,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "core/db/migrations/**", "evidence/**"]),
]);
