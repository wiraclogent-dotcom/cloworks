import { Suspense } from "react";
import type { AppRole } from "@prisma/client";
import { Bell, CalendarDays, ChartColumn, CircleHelp, FolderKanban, Inbox, LogOut, Plug, SquareKanban, Users } from "lucide-react";
// eslint-disable-next-line no-restricted-imports -- Workspace is unscoped
import { prisma } from "@/lib/db";
import { requireScope, requireUserOrRedirect } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Skeleton } from "./ui/Skeleton";
import { ThemeSwitch } from "./ui/ThemeSwitch";
import { AppFrame } from "./shell/AppFrame";
import { NavItem } from "./shell/NavItem";
import { DisabledNavItem } from "./shell/DisabledNavItem";
import { UserChipView } from "./shell/UserChipView";
import { sidebarRowClass } from "./shell/classes";

const ROLE_LABEL: Record<AppRole, string> = { REQUESTER: "Requester", CREATIVE: "Creative", LEAD: "Lead", ADMIN: "Admin" };

/**
 * A titled group of sidebar links. The title stays the list's accessible name when the rail hides it.
 * `divided` puts a hairline above the group (every group except the first), in the expanded sidebar and the rail alike.
 */
function NavGroup({ id, label, divided = false, children }: { id: string; label: string; divided?: boolean; children: React.ReactNode }) {
  return (
    <div className={divided ? "mt-3 border-t border-sidebar-border pt-3" : undefined}>
      <p id={id} className="sb-label px-2.5 pb-1.5 text-[13px] font-medium text-sidebar-foreground-secondary">{label}</p>
      <ul aria-labelledby={id} className="space-y-0.5">{children}</ul>
    </div>
  );
}

/** Team KPI is only offered to users who may open it (the page re-checks on the server). */
export async function TeamKpiItem() {
  const { appRole } = await requireUserOrRedirect();
  return can(appRole, "dashboard.team") ? <NavItem href="/dashboard/team" label="Team KPI" icon={<Users aria-hidden="true" />} /> : null;
}

/** Brief Calendar follows the Team KPI rule (the page re-checks on the server). */
export async function BriefCalendarItem() {
  const { appRole } = await requireUserOrRedirect();
  return can(appRole, "dashboard.team") ? <NavItem href="/dashboard/briefs" label="Brief Calendar" icon={<CalendarDays aria-hidden="true" />} /> : null;
}

/** The signed-in person's workspace name, under the app name in the sidebar header. `Workspace` is not scoped. */
export async function WorkspaceName() {
  const { workspaceId } = await requireUserOrRedirect();
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
  return ws?.name ?? null;
}

async function UserChip() {
  const { user: { id, appRole }, db } = await requireScope();
  const me = await db.user.findUnique({ where: { id }, select: { name: true } });
  return <UserChipView name={me?.name ?? ""} roleLabel={ROLE_LABEL[appRole]} />;
}

function UserChipFallback() {
  return (
    <div className="sb-item flex items-center gap-2.5 px-1.5 py-1">
      <Skeleton rounded="full" className="size-7 bg-sidebar-hover" />
      <Skeleton className="sb-expanded-only h-3.5 w-24 bg-sidebar-hover" />
    </div>
  );
}

/**
 * Shell for authenticated pages: Deep Blue sidebar (Work / Insights / Tools; admin pages open from Settings), user chip, theme switch, sign out.
 * Per-user reads (role checks, the name) each sit in their own Suspense boundary (cacheComponents); the static
 * links render immediately. The sign-in page does not use it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame
      workspace={<Suspense fallback={null}><WorkspaceName /></Suspense>}
      nav={
        <nav aria-label="Main">
          <NavGroup id="nav-work" label="Work">
            <NavItem href="/requests" label="Requests" icon={<SquareKanban aria-hidden="true" />} />
            <NavItem href="/projects" label="Projects" icon={<FolderKanban aria-hidden="true" />} />
            <Suspense fallback={null}><BriefCalendarItem /></Suspense>
          </NavGroup>
          <NavGroup id="nav-insights" label="Insights" divided>
            <NavItem href="/dashboard" label="My KPI" icon={<ChartColumn aria-hidden="true" />} />
            <Suspense fallback={null}><TeamKpiItem /></Suspense>
          </NavGroup>
          <NavGroup id="nav-tools" label="Tools" divided>
            <DisabledNavItem label="Notifications" icon={<Bell aria-hidden="true" />} />
            <DisabledNavItem label="Inbox" icon={<Inbox aria-hidden="true" />} />
            <DisabledNavItem label="Integrations" icon={<Plug aria-hidden="true" />} />
          </NavGroup>
        </nav>
      }
      footer={
        <>
          <ul className="space-y-0.5">
            <NavItem href="/help" label="Help center" icon={<CircleHelp aria-hidden="true" />} />
          </ul>
          <Suspense fallback={<UserChipFallback />}><UserChip /></Suspense>
          <ThemeSwitch tone="sidebar" />
          <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }}>
            <button title="Sign out" className={sidebarRowClass}>
              <LogOut aria-hidden="true" />
              <span className="sb-label">Sign out</span>
            </button>
          </form>
        </>
      }>
      {children}
    </AppFrame>
  );
}
