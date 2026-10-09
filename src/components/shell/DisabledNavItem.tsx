import type { ReactNode } from "react";

/**
 * A sidebar row for a feature that does not exist yet: visible in the reference layout, but not a link and not
 * clickable. Plain markup (no hooks), so the server shell can render it. `aria-disabled` announces it as unavailable.
 */
export function DisabledNavItem({ label, icon }: { label: string; icon: ReactNode }) {
  return (
    <li>
      <span aria-disabled="true" title={`${label}: coming soon`}
        className="sb-item flex h-9 cursor-not-allowed items-center gap-3 rounded-lg px-2.5 text-sm text-sidebar-foreground-secondary opacity-70 [&_svg]:size-[18px] [&_svg]:shrink-0">
        {icon}
        <span className="sb-label truncate">{label}</span>
        <span className="sb-label ml-auto rounded-full bg-surface-muted px-1.5 py-px text-[11px] font-medium text-foreground-secondary">Soon</span>
      </span>
    </li>
  );
}
