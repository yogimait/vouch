"use client";

/**
 * framer-motion defaults `reducedMotion` to "never", so every motion/react animation in the app
 * ignored the OS preference — BlurFade on every console card, MagicCard, NumberTicker, the dock,
 * DecryptedText. One provider fixes all of them; per-component useReducedMotion would be five.
 *
 * `children` arrives as an already-rendered RSC payload, so wrapping the root layout in a client
 * component does not pull the tree into the client bundle.
 */

import { MotionConfig } from "motion/react";

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
