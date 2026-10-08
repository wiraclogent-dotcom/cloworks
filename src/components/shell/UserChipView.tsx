import { Avatar } from "@/components/ui/Avatar";

/**
 * Sidebar footer user chip (avatar, name, role). Pure markup: the server AppShell reads the name and role. Its title is
 * unconditional so the server HTML and the first client render are always equal (see tests/shellHydration.test.tsx).
 */
export function UserChipView({ name, roleLabel }: { name: string; roleLabel: string }) {
  return (
    <div title={name || undefined} className="sb-item flex items-center gap-2.5 px-1.5 py-1">
      <Avatar name={name} size="md" decorative />
      <div className="sb-label min-w-0">
        <p className="truncate text-sm font-medium text-sidebar-foreground">{name}</p>
        <p className="truncate text-xs text-sidebar-foreground-secondary">{roleLabel}</p>
      </div>
    </div>
  );
}
