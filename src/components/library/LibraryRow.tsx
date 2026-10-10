import { FileText, Globe, HardDrive, Palette, PenTool, Presentation, Sheet, type LucideIcon } from "lucide-react";
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

/** One library link: the whole row is an <a> opening in a new tab. */
export function LibraryRowItem({ row, now }: { row: Row; now: Date }) {
  const Icon = KIND_ICON[linkKind(row.url)];
  const badge = itemBadge(row, now);
  return (
    <a
      href={row.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-lg px-2 py-2 text-foreground transition-colors duration-150 hover:bg-surface-muted"
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
}
