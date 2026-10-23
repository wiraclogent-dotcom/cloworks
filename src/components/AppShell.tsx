import { Suspense } from "react";
import { CalendarDays, CalendarRange, ChartColumn, FolderKanban, LayoutGrid, LibraryBig, SquareKanban, StickyNote, Users } from "lucide-react";
// eslint-disable-next-line no-restricted-imports -- Workspace is unscoped
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { ThemeSync } from "./ui/darkMode";
import { AppFrame } from "./shell/AppFrame";
import { NavItem } from "./shell/NavItem";
import { ProfileMenu } from "./shell/ProfileMenu";
import { PhotoDirectory } from "./shell/PhotoDirectory";
import { NotificationBell } from "./shell/NotificationBell";
import { ChatDock } from "./chat/ChatDock";
import { Skeleton } from "@/components/shadcn/skeleton";


/**
 * A titled group of sidebar links. The title stays the list's accessible name when the rail hides it.
 * `divided` puts a hairline above the group (every group except the first), in the expanded sidebar and the rail alike.
 */
function NavGroup({ id, label, divided = false, children }: { id: string; label: string; divided?: boolean; children: React.ReactNode }) {
  return (
    <div className={divided ? "mt-3 border-t border-sidebar-border pt-3" : undefined}>
      <p id={id} className="sb-label px-2.5 pb-1.5 text-compact font-medium text-sidebar-foreground-secondary">{label}</p>
      <ul aria-labelledby={id} className="space-y-0.5">{children}</ul>
    </div>
  );
}

/** Team KPI is offered to everyone who has a KPI dashboard (the page re-checks on the server). */
export async function TeamKpiItem() {
  const { appRole } = await requireUserOrRedirect();
  return can(appRole, "dashboard.teamView") ? <NavItem href="/dashboard/team" label="Team KPI" icon={<Users aria-hidden="true" />} /> : null;
}

/** Brief Calendar is offered to every signed-in user (the page re-checks on the server). */
export async function BriefCalendarItem() {
  const { appRole } = await requireUserOrRedirect();
  return can(appRole, "briefs.view") ? <NavItem href="/dashboard/briefs" label="Brief Calendar" icon={<CalendarDays aria-hidden="true" />} /> : null;
}

/** The signed-in person's workspace name, under the app name in the sidebar header. `Workspace` is not scoped. */
export async function WorkspaceName() {
  const { workspaceId } = await requireUserOrRedirect();
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
  return ws?.name ?? null;
}

/**
 * Shell for authenticated pages: white V3 sidebar (Work / Insights / Tools) with the profile card (Settings, Help
 * center, Dark mode, Sign out) at its bottom. The notification bell sits at the top right of every page, the chat dock
 * at the bottom right; admin pages are tabs of Settings.
 * Per-user reads (role checks, the name) each sit in their own Suspense boundary (cacheComponents); the static
 * links render immediately. The sign-in page does not use it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame
      workspace={<Suspense fallback={null}><WorkspaceName /></Suspense>}
      topRight={
        <div className="flex items-center gap-2">
          <Suspense fallback={<Skeleton className="size-9 rounded-full" />}><NotificationBell /></Suspense>
          <Suspense fallback={null}><PhotoDirectory /></Suspense>
        </div>
      }
      footer={<Suspense fallback={<Skeleton className="h-[54px] rounded-xl" />}><ProfileMenu /></Suspense>}
      nav={
        <nav aria-label="Main">
          <NavGroup id="nav-work" label="Work">
            <NavItem href="/requests" label="Requests" icon={<SquareKanban aria-hidden="true" />} />
            <NavItem href="/projects" label="Projects" icon={<FolderKanban aria-hidden="true" />} />
            <Suspense fallback={null}><BriefCalendarItem /></Suspense>
            <NavItem href="/marketing" label="Marketing Calendar" icon={<CalendarRange aria-hidden="true" />} />
          </NavGroup>
          <NavGroup id="nav-insights" label="Insights" divided>
            <NavItem href="/dashboard" label="My KPI" icon={<ChartColumn aria-hidden="true" />} />
            <Suspense fallback={null}><TeamKpiItem /></Suspense>
          </NavGroup>
          <NavGroup id="nav-tools" label="Tools" divided>
            <NavItem href="/library" label="Library" icon={<LibraryBig aria-hidden="true" />} />
            <NavItem href="/content" label="Content Plan" icon={<LayoutGrid aria-hidden="true" />} />
            <NavItem href="/notes" label="Notes" icon={<StickyNote aria-hidden="true" />} />
          </NavGroup>
        </nav>
      }
>
      <ThemeSync />
      {children}
      <Suspense fallback={null}><ChatDock /></Suspense>
    </AppFrame>
  );
}
