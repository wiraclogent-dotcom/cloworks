import type { ReactNode } from "react";
import Link from "next/link";
import { cn, focusRing } from "./cn";

export type Segment = {
  value: string;
  label: string;
  icon?: ReactNode;
  /** Link segment (navigation, e.g. Board / Table views). Current one gets aria-current="page". */
  href?: string;
  /** Button segment (local state). Current one gets aria-pressed="true". Client components only. */
  onSelect?: () => void;
};

const ITEM =
  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ease-out [&_svg]:size-4 " + focusRing;
const ON = "bg-card text-foreground shadow-card";
const OFF = "text-muted-foreground hover:text-foreground hover:bg-card/60";
/** The muted 40px tray segments sit in; toolbar controls next to a SegmentedControl reuse it to match. */
export const SEGMENT_TRAY = "inline-flex items-center gap-1 rounded-xl bg-muted p-1";
/** One segment inside SEGMENT_TRAY: raised white when on, quiet text when off. */
export const segmentClass = (on: boolean) => cn(ITEM, on ? ON : OFF);

/**
 * Segmented switch. With `href` segments it renders `<nav aria-label>` + links (works without JS);
 * otherwise a `role="group"` of buttons with aria-pressed.
 */
export function SegmentedControl({ label, items, value, className }: { label: string; items: Segment[]; value: string; className?: string }) {
  const wrap = cn(SEGMENT_TRAY, className);
  const links = items.some((i) => i.href !== undefined);
  if (links) {
    return (
      <nav aria-label={label} className={wrap}>
        {items.map((i) => (
          <Link key={i.value} href={i.href ?? "#"} aria-current={i.value === value ? "page" : undefined} className={segmentClass(i.value === value)}>
            {i.icon}{i.label}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <div role="group" aria-label={label} className={wrap}>
      {items.map((i) => (
        <button key={i.value} type="button" aria-pressed={i.value === value} onClick={i.onSelect} className={segmentClass(i.value === value)}>
          {i.icon}{i.label}
        </button>
      ))}
    </div>
  );
}
