import { Suspense } from "react";
import type { AppRole } from "@prisma/client";
import { ChartColumn, FolderKanban, LogOut, ShieldCheck, SquareKanban, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Skeleton } from "./ui/Skeleton";
import { ThemeSwitch } from "./ui/ThemeSwitch";
import { AppFrame } from "./shell/AppFrame";
import { NavItem } from "./shell/NavItem";
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

/** Admin pages are only offered to users who may open them (the pages re-check on the server). */
export async function AdminGroup() {
  const { appRole } = await requireUserOrRedirect();
  return can(appRole, "admin.manage") ? (
    <NavGroup id="nav-admin" label="Admin" divided>
      <NavItem href="/admin/users" label="Admin" icon={<ShieldCheck aria-hidden="true" />} />
    </NavGroup>
  ) : null;
}

async function UserChip() {
  const { id, appRole } = await requireUserOrRedirect();
  const me = await prisma.user.findUnique({ where: { id }, select: { name: true } });
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
 * Shell for authenticated pages: Deep Blue sidebar (Work / Insights / Admin), user chip, theme switch, sign out.
 * Per-user reads (role checks, the name) each sit in their own Suspense boundary (cacheComponents); the static
 * links render immediately. The sign-in page does not use it.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AppFrame
      nav={
        <nav aria-label="Main">
          <NavGroup id="nav-work" label="Work">
            <NavItem href="/requests" label="Requests" icon={<SquareKanban aria-hidden="true" />} />
            <NavItem href="/projects" label="Projects" icon={<FolderKanban aria-hidden="true" />} />
          </NavGroup>
          <NavGroup id="nav-insights" label="Insights" divided>
            <NavItem href="/dashboard" label="My KPI" icon={<ChartColumn aria-hidden="true" />} />
            <Suspense fallback={null}><TeamKpiItem /></Suspense>
          </NavGroup>
          <Suspense fallback={null}><AdminGroup /></Suspense>
        </nav>
      }
      footer={
        <>
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
