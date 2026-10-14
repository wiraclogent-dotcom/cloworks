"use client";

import { useState } from "react";
import Link from "next/link";
import { SlidersHorizontal, X } from "lucide-react";
import { cn, focusRing } from "./ui/cn";
import { Button } from "@/components/shadcn/button";
import { NativeSelect } from "@/components/shadcn/native-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";

export type FilterField = {
  /** The query parameter (`status`, `brand`, `motion`…). */
  name: string;
  label: string;
  /** Current value from the URL; "" for none. */
  value: string;
  /** The empty option's text ("All", "Any"). */
  emptyLabel: string;
  options: { id: string; name: string }[];
};

/** Pill-style field: 32px, full radius, 3:1 outline, Aqua focus ring; an active filter gets the Aqua tint. */
const pill = (active = false) => cn(
  "h-8 rounded-full border text-compact transition-colors duration-150 ease-out hover:border-muted-foreground",
  active ? "border-ring bg-accent text-accent-foreground" : "border-input bg-card text-foreground",
  focusRing,
);

/** Label stacked above a control inside the panel. */
const LABEL = "flex flex-col gap-1 text-xs font-medium text-muted-foreground";

/**
 * The Filters button and its popover, inside FilterBar's GET form. The panel is rendered in place (no portal) so its
 * named selects submit with the form when Apply is pressed. While it is closed its selects are not rendered, so hidden
 * inputs carry the same names and values: a search from the toolbar keeps the filters (as the old disclosure panel
 * did, whose closed fields were still submitted), and a change made in the panel is kept until the form remounts.
 */
export function FilterPanel({ fields, activeCount, triggerClassName, clearHref }: {
  fields: FilterField[]; activeCount: number; triggerClassName: string; clearHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.value])));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={triggerClassName}>
        <SlidersHorizontal aria-hidden="true" strokeWidth={1.75} className="size-4" />
        Filters{activeCount > 0 ? <span className="tabular-nums">· {activeCount}</span> : null}
      </PopoverTrigger>
      {!open && fields.map((f) => <input key={f.name} type="hidden" name={f.name} value={values[f.name] ?? ""} />)}
      <PopoverContent portal={false} align="end" sideOffset={8} collisionPadding={16} aria-label="Filters"
        className="flex max-h-(--radix-popover-content-available-height) flex-col gap-3 overflow-y-auto">
        {fields.map((f) => (
          <label key={f.name} className={LABEL}>
            {f.label}
            {/* Named only while open: during the close animation the hidden copies above already carry the value. */}
            <NativeSelect name={open ? f.name : undefined} value={values[f.name] ?? ""} size="sm"
              onChange={(e) => { const v = e.currentTarget.value; setValues((cur) => ({ ...cur, [f.name]: v })); }}
              selectClassName={cn(pill(!!f.value), "pr-7 pl-3")}>
              <option value="">{f.emptyLabel}</option>
              {f.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </NativeSelect>
          </label>
        ))}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button variant="default" size="sm" type="submit">Apply</Button>
          <Button asChild variant="ghost" size="sm"><Link href={clearHref}><X aria-hidden="true" strokeWidth={1.75} />Clear filters</Link></Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
