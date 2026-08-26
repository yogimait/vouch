"use client";

/**
 * A word set in a 5×7 bitmap face and drawn as characters, not pixels — Razorpay's ASCII-twin move
 * on /ai-builders, aimed at the one word this product exists to produce. Changing the word dissolves
 * the old letters back into noise and resolves the new ones out of it, cell by cell.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// prettier-ignore
const FONT: Record<string, string[]> = {
  A: ["01110","10001","10001","11111","10001","10001","10001"],
  B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01110","10001","10000","10000","10000","10001","01110"],
  D: ["11110","10001","10001","10001","10001","10001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01110","10001","10000","10111","10001","10001","01110"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["11111","00100","00100","00100","00100","00100","11111"],
  J: ["00111","00010","00010","00010","00010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"],
  N: ["10001","11001","10101","10011","10001","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","11011","10001"],
  X: ["10001","10001","01010","00100","01010","10001","10001"],
  Y: ["10001","10001","01010","00100","00100","00100","00100"],
  Z: ["11111","00001","00010","00100","01000","10000","11111"],
};

const GLYPH_ROWS = 7;
const GLYPH_COLS = 5;
const GAP = 1;
const NOISE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%$&*+=/<>[]{}";

interface Cell {
  on: number;
  /** 0 = noise, 1 = part of the word. Eased, so a change reads as a dissolve. */
  p: number;
  delay: number;
  ch: string;
  /** Most off cells stay empty. A full grid of characters reads as static, not as a field. */
  lit: boolean;
}

/** Centred, not flush left: the canvas is sized for the longest word, so a short one has slack. */
function maskFor(word: string, cols: number): number[] {
  const mask = new Array(cols * GLYPH_ROWS).fill(0);
  const span = word.length * (GLYPH_COLS + GAP) - GAP;
  let x = Math.max(0, Math.floor((cols - span) / 2));
  for (const letter of word) {
    const glyph = FONT[letter];
    if (glyph) {
      for (let r = 0; r < GLYPH_ROWS; r += 1) {
        for (let c = 0; c < GLYPH_COLS; c += 1) {
          if (glyph[r][c] === "1" && x + c < cols) mask[r * cols + x + c] = 1;
        }
      }
    }
    x += GLYPH_COLS + GAP;
  }
  return mask;
}

interface Props {
  word: string;
  /** Any CSS colour. The lit cells take it; the noise stays grey underneath. */
  colour: string;
  /** Cell size in px. The canvas sizes itself from the longest word it will ever hold. */
  cell?: number;
  widest?: number;
  className?: string;
}

export function PixelWord({ word, colour, cell = 13, widest, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef<{ cells: Cell[]; cols: number; colour: string }>({ cells: [], cols: 0, colour });

  const cols = ((widest ?? word.length) * (GLYPH_COLS + GAP)) - GAP;
  const width = cols * cell;
  const height = GLYPH_ROWS * cell;

  // The word and the colour are read out of a ref by the loop, so a change never restarts the canvas.
  useEffect(() => {
    const mask = maskFor(word, state.current.cols || cols);
    state.current.colour = colour;
    state.current.cells.forEach((c, i) => {
      if (c.on !== mask[i]) c.delay = Math.random() * 26;
      c.on = mask[i];
    });
  }, [word, colour, cols]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mask = maskFor(word, cols);
    state.current.cols = cols;
    state.current.cells = Array.from({ length: cols * GLYPH_ROWS }, (_, i) => ({
      on: mask[i],
      p: still ? mask[i] : 0,
      delay: Math.random() * 26,
      ch: NOISE[(Math.random() * NOISE.length) | 0],
      lit: Math.random() < 0.34,
    }));

    let raf = 0;
    let frame = 0;
    const pointer = { x: -1e4, y: -1e4 };

    const draw = () => {
      frame += 1;
      ctx.clearRect(0, 0, width, height);
      ctx.font = `${cell - 1}px ui-monospace, monospace`;
      ctx.textBaseline = "top";

      const { cells, colour: hue } = state.current;
      for (let i = 0; i < cells.length; i += 1) {
        const c = cells[i];
        if (c.delay > 0) c.delay -= 1;
        else c.p += (c.on - c.p) * 0.16;

        // A cell only re-rolls its glyph while it is noise, so a lit letter holds still.
        if (c.p < 0.4 && frame % 4 === 0 && Math.random() < 0.14) {
          c.ch = NOISE[(Math.random() * NOISE.length) | 0];
        }

        const x = (i % cols) * cell;
        const y = ((i / cols) | 0) * cell;
        const dx = x - pointer.x;
        const dy = y - pointer.y;
        const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / 90);

        // Lit cells are drawn, not typed: a block glyph is narrower than its cell, so a horizontal
        // run of them came out as separate bars rather than a stroke of a letter.
        if (c.p > 0.12) {
          ctx.globalAlpha = Math.min(1, c.p);
          ctx.fillStyle = hue;
          ctx.shadowColor = hue;
          ctx.shadowBlur = 9 * c.p;
          const inset = (1 - Math.min(1, c.p)) * cell * 0.35;
          ctx.fillRect(x + inset, y + inset, cell - 1.5 - inset * 2, cell - 1.5 - inset * 2);
          ctx.shadowBlur = 0;
        } else if (c.lit || near > 0.15) {
          ctx.globalAlpha = 0.07 + near * 0.24;
          ctx.fillStyle = near > 0.15 ? hue : "#ffffff";
          ctx.fillText(c.ch, x, y);
        }
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };

    const move = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    window.addEventListener("pointermove", move);

    if (still) draw();
    else raf = requestAnimationFrame(draw);

    // A character grid at 60fps is not free, and a backgrounded tab must not pay for it.
    const visibility = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !still) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", visibility);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      document.removeEventListener("visibilitychange", visibility);
    };
    // Deliberately not reacting to `word` or `colour`: the effect above feeds those to the loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cell, cols, width, height]);

  return <canvas ref={ref} aria-hidden style={{ width, height }} className={cn("block", className)} />;
}
