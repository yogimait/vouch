// One parse, at first use. Throwing at import time would break `next build`, which imports modules
// without a populated .env.local.
import { z } from "zod";

const Schema = z.object({
  RAZORPAY_KEY_ID: z.string().startsWith("rzp_test_", "Refusing to run against a non-test key"),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url().optional(),

  VOUCH_SIGNING_PRIVATE_KEY: z.string().min(1),
  VOUCH_SIGNING_PUBLIC_KEY: z.string().min(1),
  VOUCH_SIGNING_KEY_ID: z.string().default("vouch-k1"),

  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),

  APP_URL: z.string().url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof Schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Environment is not usable:\n${missing}\n\nCopy .env.example to .env.local.`);
  }
  cached = parsed.data;
  return cached;
}

/** Scripts and tests need one variable without demanding the whole environment is present. */
export function optionalEnv(key: keyof Env): string | undefined {
  return process.env[key];
}
