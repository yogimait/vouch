"use client";

import { useEffect, useRef } from "react";

const PARTICLES = 2600;
const TILT = 0.2; // flattens the ring into a wide shallow ellipse seen from just above

interface Particle { angle: number; radius: number; size: number; speed: number; teal: boolean }

function seed(count: number): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i += 1) {
    // Bias toward the rim: density does the work, so the outer ring needs no thick stroke.
    const t = Math.pow(Math.random(), 0.35);
    out.push({
      angle: Math.random() * Math.PI * 2,
      radius: 0.18 + t * 0.82,
      size: Math.random() < 0.9 ? 0.6 : 1.3,
      speed: 0.6 + Math.random() * 0.5,
      teal: Math.random() < 0.35,
    });
  }
  return out;
}

export function Disc() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const particles = seed(PARTICLES);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const draw = () => {
      const { width: w, height: h } = canvas.getBoundingClientRect();
      const cx = w / 2;
      const cy = h * 0.52;
      // Wider than the viewport so the disc bleeds off both edges.
      const rx = w * 0.62;
      const ry = rx * TILT;

      ctx.clearRect(0, 0, w, h);

      // Faint radial lines converging on the centre.
      ctx.strokeStyle = "rgba(45,212,191,0.05)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 48; i += 1) {
        const a = (i / 48) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
        ctx.stroke();
      }

      // A dim rim glow. Thin on purpose: the particles carry the shape.
      ctx.strokeStyle = "rgba(45,212,191,0.22)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();

      for (const p of particles) {
        const a = p.angle + (still ? 0 : t * 0.00006 * p.speed);
        const x = cx + Math.cos(a) * rx * p.radius;
        const y = cy + Math.sin(a) * ry * p.radius;
        // Near side of the ellipse reads brighter, which is what sells the perspective.
        const depth = 0.45 + 0.55 * ((Math.sin(a) + 1) / 2);
        ctx.fillStyle = p.teal
          ? `rgba(45,212,191,${0.5 * depth})`
          : `rgba(255,255,255,${0.6 * depth})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size * depth, 0, Math.PI * 2);
        ctx.fill();
      }

      // The brightest thing on the page: every decision converging on one verdict.
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      glow.addColorStop(0, "rgba(255,255,255,0.95)");
      glow.addColorStop(0.08, "rgba(180,255,247,0.5)");
      glow.addColorStop(1, "rgba(45,212,191,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();

      if (!still) {
        t += 16;
        raf = requestAnimationFrame(draw);
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="h-full w-full" />;
}
