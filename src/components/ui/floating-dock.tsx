"use client";

/**
 * Aceternity's floating dock, adapted: next/link instead of <a> (a plain anchor made every nav a
 * full page load, which is the opposite of what this dock is here to fix), theme tokens instead of
 * hardcoded greys, and an active state read from the pathname.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { cn } from "@/lib/utils";

export interface DockItem {
  title: string;
  icon: React.ReactNode;
  href: string;
}

/** A section is current when the path is inside it. "/" would match everything, so it is exact. */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function FloatingDock({
  items,
  desktopClassName,
  mobileClassName,
}: {
  items: DockItem[];
  desktopClassName?: string;
  mobileClassName?: string;
}) {
  const pathname = usePathname();
  return (
    <>
      <DockDesktop items={items} pathname={pathname} className={desktopClassName} />
      <DockMobile items={items} pathname={pathname} className={mobileClassName} />
    </>
  );
}

interface DockProps {
  items: DockItem[];
  pathname: string;
  className?: string;
}

function DockMobile({ items, pathname, className }: DockProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={cn("relative block md:hidden", className)}>
      <AnimatePresence>
        {open && (
          <motion.div className="glass absolute right-0 bottom-full mb-3 flex w-56 flex-col overflow-hidden rounded-[3px] p-1">
            {items.map((item, idx) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10, transition: { delay: idx * 0.04 } }}
                transition={{ delay: (items.length - 1 - idx) * 0.04 }}
              >
                <Link
                  href={item.href}
                  prefetch={false}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "feedback flex items-center gap-3 rounded-[2px] px-3 py-2.5 text-sm",
                    isActive(pathname, item.href)
                      ? "bg-primary font-medium text-primary-foreground"
                      : "text-fg-2 hover:bg-white/[0.06] hover:text-fg",
                  )}
                >
                  <span className="size-4 shrink-0">{item.icon}</span>
                  {item.title}
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close navigation" : "Open navigation"}
        className="glass feedback flex size-12 items-center justify-center rounded-full text-fg-2"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
    </div>
  );
}

function DockDesktop({ items, pathname, className }: DockProps) {
  const mouseX = useMotionValue(Infinity);

  return (
    <motion.div
      onMouseMove={(e) => mouseX.set(e.pageX)}
      onMouseLeave={() => mouseX.set(Infinity)}
      className={cn("glass mx-auto hidden h-16 items-end gap-3 rounded-2xl px-4 pb-3 md:flex", className)}
    >
      {items.map((item) => (
        <DockIcon key={item.title} mouseX={mouseX} item={item} active={isActive(pathname, item.href)} />
      ))}
    </motion.div>
  );
}

function DockIcon({ mouseX, item, active }: { mouseX: MotionValue; item: DockItem; active: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (val) => {
    const bounds = ref.current?.getBoundingClientRect() ?? { x: 0, width: 0 };
    return val - bounds.x - bounds.width / 2;
  });

  const spring = { mass: 0.1, stiffness: 150, damping: 12 };
  const size = useSpring(useTransform(distance, [-140, 0, 140], [40, 74, 40]), spring);
  const iconSize = useSpring(useTransform(distance, [-140, 0, 140], [18, 34, 18]), spring);

  return (
    <Link href={item.href} prefetch={false} aria-label={item.title} aria-current={active ? "page" : undefined}>
      <motion.div
        ref={ref}
        style={{ width: size, height: size }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "relative flex aspect-square items-center justify-center rounded-full transition-colors",
          active ? "bg-primary text-primary-foreground" : "bg-white/[0.06] text-fg-2 hover:text-fg",
        )}
      >
        <AnimatePresence>
          {hovered && (
            <motion.span
              initial={{ opacity: 0, y: 8, x: "-50%" }}
              animate={{ opacity: 1, y: 0, x: "-50%" }}
              exit={{ opacity: 0, y: 2, x: "-50%" }}
              className="glass absolute -top-9 left-1/2 w-fit rounded-md px-2 py-1 text-xs whitespace-pre text-fg"
            >
              {item.title}
            </motion.span>
          )}
        </AnimatePresence>
        <motion.span style={{ width: iconSize, height: iconSize }} className="flex items-center justify-center">
          {item.icon}
        </motion.span>
      </motion.div>
    </Link>
  );
}
