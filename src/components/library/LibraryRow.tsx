"use client";

import { useRef } from "react";
import { ArrowDown, ArrowUp, Ellipsis, FileDown, FileText, Globe, HardDrive, Palette, Pencil, PenTool, Pin, PinOff, Presentation, Sheet, Trash2, type LucideIcon } from "lucide-react";
import { focusRing } from "@/components/ui/cn";
import { Badge } from "@/components/shadcn/badge";
import { BrandTag } from "@/components/ui/BrandTag";
import { itemBadge, linkKind, type LibraryRow as Row, type LinkKind } from "@/lib/libraryView";
import { Button } from "@/components/shadcn/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/shadcn/dropdown-menu";

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

/** Editor-only "…" menu (Radix: arrow keys, Esc and focus return to the trigger). */
function RowMenu({ row, actions }: { row: Row; actions: RowActions }) {
  const trigger = useRef<HTMLButtonElement>(null);
  // Edit and Delete open a dialog, which returns focus to whatever had it when it opened: park focus on the trigger
  // first (the chosen item unmounts with the menu).
  const run = (fn: () => void) => () => { trigger.current?.focus(); fn(); };
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button ref={trigger} variant="ghost" size="icon-sm" aria-label={`Actions for ${row.title}`} title={`Actions for ${row.title}`} className="shrink-0">
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={`Actions for ${row.title}`} className="w-44">
        <DropdownMenuItem onSelect={run(actions.onEdit)}><Pencil aria-hidden="true" />Edit</DropdownMenuItem>
        <DropdownMenuItem onSelect={run(actions.onPin)}>{row.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}{row.pinned ? "Unpin" : "Pin"}</DropdownMenuItem>
        {actions.canMove === false ? null : (
          <>
            <DropdownMenuItem disabled={!actions.canUp} onSelect={run(() => actions.onMove("up"))}><ArrowUp aria-hidden="true" />Move up</DropdownMenuItem>
            <DropdownMenuItem disabled={!actions.canDown} onSelect={run(() => actions.onMove("down"))}><ArrowDown aria-hidden="true" />Move down</DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={run(actions.onDelete)}><Trash2 aria-hidden="true" />Delete</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
      className={"flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-foreground transition-colors duration-150 hover:bg-muted " + focusRing}
    >
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
        <Icon strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{row.title}</span>
        {row.description ? <span className="block truncate text-compact text-muted-foreground">{row.description}</span> : null}
      </span>
      <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
        {row.brandName ? <BrandTag name={row.brandName} /> : null}
        {badge ? <Badge tone="due-soon">{badge}</Badge> : null}
      </span>
    </a>
  );
  const files = row.files ?? [];
  if (!actions && files.length === 0) return link;
  return (
    <div className="flex flex-wrap items-center gap-x-1">
      {link}
      {files.length ? (
        // Separate links (a link can't sit inside the row's own <a>), on their own line under the title so it keeps its room.
        <span className="order-last flex w-full flex-wrap gap-1.5 pb-2 pl-12">
          {files.map((f) => (
            <a key={`${f.label}-${f.url}`} href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`${f.label} – ${row.title}`}
              className={"inline-flex items-center gap-1 rounded-md border border-border-strong px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [&_svg]:size-3 " + focusRing}>
              <FileDown aria-hidden="true" strokeWidth={1.75} />{f.label}
            </a>
          ))}
        </span>
      ) : null}
      {actions ? <RowMenu row={row} actions={actions} /> : null}
    </div>
  );
}
