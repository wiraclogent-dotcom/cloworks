import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { can } from "@/lib/permissions";

const LINK = "rounded-md px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring hover:underline";

/** Team KPI is only offered to users who may open it (the page re-checks on the server). */
async function TeamKpiLink() {
  const { appRole } = await requireUserOrRedirect();
  return can(appRole, "dashboard.team") ? <Link href="/dashboard/team" className={LINK}>Team KPI</Link> : null;
}

/** Admin pages are only offered to users who may open them (the pages re-check on the server). */
async function AdminLink() {
  const { appRole } = await requireUserOrRedirect();
  return can(appRole, "admin.manage") ? <Link href="/admin/users" className={LINK}>Admin</Link> : null;
}

async function UserMenu() {
  const { id } = await requireUserOrRedirect();
  const me = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="text-sm">{me?.name}</span>
      <form action={async () => { "use server"; await signOut({ redirectTo: "/signin" }); }}>
        <button className="rounded-md border border-border px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring">Sign out</button>
      </form>
    </div>
  );
}

/** Header + nav for authenticated pages. The sign-in page does not use it. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const link = LINK;
  return (
    <>
      <header className="border-b border-border bg-card text-card-foreground">
        <div className="mx-auto flex w-full max-w-[96rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/requests" className="font-semibold">Creative Requests</Link>
          <nav aria-label="Main" className="flex gap-1">
            <Link href="/requests" className={link}>Requests</Link>
            <Link href="/requests/new" className={link}>New request</Link>
            <Link href="/projects" className={link}>Projects</Link>
            <Link href="/dashboard" className={link}>KPI</Link>
            <Suspense fallback={null}><TeamKpiLink /></Suspense>
            <Suspense fallback={null}><AdminLink /></Suspense>
          </nav>
          <Suspense fallback={<span className="ml-auto" />}><UserMenu /></Suspense>
        </div>
      </header>
      {children}
    </>
  );
}
