"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface Chip {
  id: string;
  label: string;
  hint?: string;
}

/** Two identical pill rows lived here inline. One row, two call sites, one place to restyle. */
export function ChipGroup({
  label,
  chips,
  selected,
  onSelect,
}: {
  label: string;
  chips: Chip[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="label mr-1">{label}</span>
      {chips.map((c) => (
        <Button
          key={c.id}
          type="button"
          size="sm"
          variant="outline"
          title={c.hint}
          aria-pressed={c.id === selected}
          onClick={() => onSelect(c.id)}
          className={cn(
            "h-7 rounded-full text-xs font-normal",
            c.id === selected ? "border-primary/50 text-primary" : "text-fg-3",
          )}
        >
          {c.label}
        </Button>
      ))}
    </div>
  );
}
