"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Ellipsis, FileText, Globe, HardDrive, Palette, Pencil, PenTool, Pin, PinOff, Presentation, Sheet, Trash2, type LucideIcon } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { focusRing } from "@/components/ui/cn";
import { BrandTag, Chip } from "@/components/ui/Chip";
import { itemBadge, linkKind, type LibraryRow as Row, type LinkKind } from "@/lib/libraryView";

const KIND_ICON: Record<LinkKind, LucideIcon> = {
  docs: FileText,
  sheets: Sheet,
  slides: Presentation,
  drive: HardDrive,
  figma: PenTool,
  canva: Palette,
  pdf: FileText,
  web: Globe,
};

export type RowActions = {
  /** false hides Move up/down (e.g. in the Pinned strip, where moving reorders within the category). */
  canMove?: boolean;
  canUp: boolean;
  canDown: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPin: () => void;
  onMove: (dir: "up" | "down") => void;
};

const itemClass = "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-55 " + focusRing;

/** Editor-only "…" menu: button with aria-haspopup/aria-expanded and a list of menu items. */
function RowMenu({ row, actions }: { row: Row; actions: RowActions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  // The clicked item unmounts with the menu, so park focus on the trigger first (a dialog then returns focus there).
  const triggerFocus = () => ref.current?.querySelector<HTMLElement>("button[aria-haspopup]")?.focus();
  const item = (label: string, icon: React.ReactNode, run: () => void, disabled = false) => (
    <button type="button" role="menuitem" disabled={disabled} className={itemClass} onClick={() => { triggerFocus(); setOpen(false); run(); }}>
      {icon}{label}
    </button>
  );
  return (
    <div ref={ref} className="relative shrink-0" onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(false); } }}>
      <IconButton size="sm" aria-label={`Actions for ${row.title}`} aria-haspopup="menu" aria-expanded={open} icon={<Ellipsis />} onClick={() => setOpen((o) => !o)} />
      {open ? (
        <div role="menu" aria-label={`Actions for ${row.title}`} className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-border bg-surface p-1 shadow-raised [&_svg]:size-4 [&_svg]:text-foreground-secondary">
          {item("Edit", <Pencil />, actions.onEdit)}
          {item(row.pinned ? "Unpin" : "Pin", row.pinned ? <PinOff /> : <Pin />, actions.onPin)}
          {actions.canMove === false ? null : item("Move up", <ArrowUp />, () => actions.onMove("up"), !actions.canUp)}
          {actions.canMove === false ? null : item("Move down", <ArrowDown />, () => actions.onMove("down"), !actions.canDown)}
          {item("Delete", <Trash2 />, actions.onDelete)}
        </div>
      ) : null}
    </div>
  );
}

/** One library link: the link area is an <a> opening in a new tab; editors get a menu beside it. */
export function LibraryRowItem({ row, now, actions }: { row: Row; now: Date; actions?: RowActions }) {
  const Icon = KIND_ICON[linkKind(row.url)];
  const badge = itemBadge(row, now);
  const link = (
    <a
      href={row.url}
      target="_blank"
      rel="noopener noreferrer"
      className={"flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-foreground transition-colors duration-150 hover:bg-surface-muted " + focusRing}
    >
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-secondary [&_svg]:size-4">
        <Icon strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.title}</span>
        {row.description ? <span className="block truncate text-[13px] text-foreground-secondary">{row.description}</span> : null}
      </span>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {row.brandName ? <BrandTag name={row.brandName} /> : null}
        {badge ? <Chip tone="due-soon">{badge}</Chip> : null}
      </span>
    </a>
  );
  if (!actions) return link;
  return (
    <div className="flex items-center gap-1">
      {link}
      <RowMenu row={row} actions={actions} />
    </div>
  );
}
