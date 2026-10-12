import { ChevronRight } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { activeChip, appRoleChip, jobRoleChip } from "@/lib/adminChips";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { tableClass } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";
import { AdminDenied } from "../AdminDenied";
import { AdminTabs } from "../AdminTabs";
import { loadJoinAdmin, requestBaseUrl } from "@/lib/joinDeps";
import { InvitedList, type InviteRow } from "./InvitedList";
import { InviteLinkCard } from "./InviteLinkCard";
import { MemberTabs, parseMemberTab } from "./MemberTabs";
import { RequestsList, type RequestRow } from "./RequestsList";
import { ActiveToggle, EditUserForm, LoginEmailForm, PasswordForm } from "./UserForms";

function TonedChip({ chip, ...rest }: { chip: { label: string; tone: Parameters<typeof Chip>[0]["tone"] } } & Record<`data-${string}`, string>) {
  return <Chip tone={chip.tone} {...rest}>{chip.label}</Chip>;
}

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });

/** Permission is checked BEFORE any query, so a non-admin payload contains no admin data. `tab`: members | invited | requests. */
export async function UsersContent({ tab }: { tab?: string } = {}) {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "admin.manage")) return <AdminDenied />;
  const current = parseMemberTab(tab);

  const [{ workspace, requests }, base] = await Promise.all([loadJoinAdmin(viewer), requestBaseUrl()]);
  const toRow = (r: (typeof requests.pending)[number]): RequestRow => ({ applicantId: r.applicantId, name: r.name, email: r.email, source: r.source, requestedAt: when.format(r.requestedAt) });

  let panel: React.ReactNode;
  let count: number | undefined;
  if (current === "invited") {
    const invites = await loadInvites(db);
    panel = <InvitedList invites={invites} />;
  } else if (current === "requests") {
    panel = <RequestsList pending={requests.pending.map(toRow)} rejected={requests.rejected.map(toRow)} />;
  } else {
    const loaded = await loadMembers(db);
    count = loaded.users.length;
    panel = loaded.view;
  }

  return (
    <>
      <PageHeader breadcrumb={[{ label: "Settings", href: "/settings" }, { label: "Admin" }, { label: "Members" }]} title="People and access" count={count} switcher={<AdminTabs current="users" />}
        description="Anyone active with a login email can sign in. Invite people, or approve those who ask to join." />
      <InviteLinkCard base={base} joinCode={workspace.joinCode} enabled={workspace.joinLinkEnabled} emailDomain={workspace.emailDomain} />
      <div className="mb-4"><MemberTabs current={current} pending={requests.pending.length} /></div>
      {panel}
    </>
  );
}

async function loadInvites(db: Awaited<ReturnType<typeof requireScope>>["db"]): Promise<InviteRow[]> {
  const now = Date.now();
  const rows = await db.invite.findMany({
    where: { acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, appRole: true, jobRole: true, expiresAt: true, invitedBy: { select: { name: true } } },
  });
  return rows.map((i) => ({ id: i.id, email: i.email, appRole: i.appRole, jobRole: i.jobRole, invitedBy: i.invitedBy.name, expiresOn: day.format(i.expiresAt), expired: i.expiresAt.getTime() <= now }));
}

async function loadMembers(db: Awaited<ReturnType<typeof requireScope>>["db"]) {
  const users = await db.user
    .findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, fullName: true, title: true, appRole: true, jobRole: true, aliases: true, email: true, active: true, passwordHash: true },
    })
    .then((rows) => rows.map(({ passwordHash, ...u }) => ({ ...u, hasPassword: !!passwordHash })));
  const t = tableClass({ minWidth: "min-w-[60rem]" });

  const view = (
    <>
      <div className={cn(t.wrapper, "max-h-[calc(100dvh-15rem)]")}>
        <table className={t.table}>
          <caption className="sr-only">All people</caption>
          <thead>
            <tr>
              {["Name", "Job role", "App role", "Login email", "Status", "Manage"].map((h) => (
                <th key={h} scope="col" className={t.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={cn(t.tr, "align-top")}>
                <th scope="row" className={cn(t.rowHeader, "align-top")}>
                  <div className="flex items-start gap-2.5">
                    <Avatar name={u.name} size="md" decorative className={cn(!u.active && "opacity-60")} />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs font-normal text-foreground-secondary">
                        <span className="sr-only">Full name: </span>{u.fullName}
                        <span aria-hidden="true"> · </span>
                        <span className="sr-only">Title: </span>{u.title ?? "—"}
                      </p>
                    </div>
                  </div>
                </th>
                <td className={cn(t.td, "align-top")}><TonedChip chip={jobRoleChip(u.jobRole)} data-job-role={u.jobRole} /></td>
                <td className={cn(t.td, "align-top")}><TonedChip chip={appRoleChip(u.appRole)} data-app-role={u.appRole} /></td>
                <td className={cn(t.td, "align-top break-all")}>
                  {u.email ?? <span className="text-foreground-secondary italic">No login</span>}
                  {u.email && (
                    <p className="mt-0.5 text-xs text-foreground-secondary" data-has-password={String(u.hasPassword)}>
                      {u.hasPassword ? "Password set" : "No password yet"}
                    </p>
                  )}
                </td>
                <td className={cn(t.td, "align-top")}><TonedChip chip={activeChip(u.active)} data-active={String(u.active)} /></td>
                <td className={cn(t.td, "min-w-72 align-top")}>
                  <details className="group">
                    <summary className="inline-flex cursor-pointer items-center gap-1 rounded-md font-medium text-link hover:underline">
                      <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 transition-transform duration-150 group-open:rotate-90" />Edit {u.name}
                    </summary>
                    <div className="mt-3 space-y-4 rounded-lg border border-border bg-surface-muted p-3">
                      <EditUserForm u={u} />
                      <LoginEmailForm u={u} />
                      <PasswordForm u={u} />
                      <ActiveToggle u={u} />
                    </div>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
  return { users, view };
}
