import { ChevronRight } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { activeChip, appRoleChip, jobRoleChip } from "@/lib/adminChips";
import { PageHeader } from "@/components/ui/PageHeader";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/shadcn/badge";
import { Card } from "@/components/shadcn/card";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHeader } from "@/components/shadcn/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/shadcn/collapsible";
import { cn, focusRing } from "@/components/ui/cn";
import { AdminDenied } from "../AdminDenied";
import { AdminTabs } from "../AdminTabs";
import { isPlatformAdminUser } from "@/lib/platformAdmin";
import { listLinkablePeople } from "@/lib/linkPerson";
import { loadJoinAdmin, requestBaseUrl } from "@/lib/joinDeps";
import { InvitedList, type InviteRow } from "./InvitedList";
import { InviteLinkCard } from "./InviteLinkCard";
import { MemberTabs, parseMemberTab } from "./MemberTabs";
import { RequestsList, type RequestRow } from "./RequestsList";
import { ActiveToggle, EditUserForm, LoginEmailForm, MergeForm, PasswordForm } from "./UserForms";

function TonedChip({ chip, ...rest }: { chip: { label: string; tone: Parameters<typeof Badge>[0]["tone"] } } & Record<`data-${string}`, string>) {
  return <Badge tone={chip.tone} {...rest}>{chip.label}</Badge>;
}

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric" });

/** Permission is checked BEFORE any query, so a non-admin payload contains no admin data. `tab`: members | invited | requests. */
export async function UsersContent({ tab, merged }: { tab?: string; merged?: string } = {}) {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "admin.manage")) return <AdminDenied />;
  const current = parseMemberTab(tab);

  const [{ workspace, requests }, base] = await Promise.all([loadJoinAdmin(viewer), requestBaseUrl()]);
  const toRow = (r: (typeof requests.pending)[number]): RequestRow => ({ applicantId: r.applicantId, name: r.name, email: r.email, source: r.source, requestedAt: when.format(r.requestedAt) });

  let panel: React.ReactNode;
  let count: number | undefined;
  if (current === "invited") {
    const invites = await loadInvites(db);
    panel = <InvitedList invites={invites} linkable={await listLinkablePeople(db)} />;
  } else if (current === "requests") {
    panel = <RequestsList pending={requests.pending.map(toRow)} rejected={requests.rejected.map(toRow)} linkable={await listLinkablePeople(db)} />;
  } else {
    const loaded = await loadMembers(db);
    count = loaded.users.length;
    panel = loaded.view;
  }

  return (
    <>
      <PageHeader breadcrumb={[{ label: "Settings", href: "/settings" }, { label: "Admin" }, { label: "Members" }]} title="People and access" count={count} switcher={<AdminTabs current="users" waitlist={await isPlatformAdminUser(db, viewer.id)} />}
        description="Anyone active with a login email can sign in. Invite people, or approve those who ask to join." />
      {merged && <Alert variant="success" className="mb-4"><AlertDescription>Merged into {merged}.</AlertDescription></Alert>}
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
    select: { id: true, email: true, appRole: true, jobRole: true, expiresAt: true, invitedBy: { select: { name: true } }, user: { select: { name: true } } },
  });
  return rows.map((i) => ({ id: i.id, email: i.email, appRole: i.appRole, jobRole: i.jobRole, invitedBy: i.invitedBy.name, linkedName: i.user?.name ?? null, expiresOn: day.format(i.expiresAt), expired: i.expiresAt.getTime() <= now }));
}

async function loadMembers(db: Awaited<ReturnType<typeof requireScope>>["db"]) {
  const users = await db.user
    .findMany({
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, fullName: true, title: true, appRole: true, jobRole: true, aliases: true, email: true, active: true, passwordHash: true },
    })
    .then((rows) => rows.map(({ passwordHash, ...u }) => ({ ...u, hasPassword: !!passwordHash })));

  const view = (
    <>
      <Card className="overflow-hidden p-0">
        <Table containerClassName="max-h-[calc(100dvh-15rem)]" className="min-w-[60rem]">
          <TableCaption className="sr-only">All people</TableCaption>
          <TableHeader>
            <TableRow>
              {["Name", "Job role", "App role", "Login email", "Status", "Manage"].map((h) => (
                <TableHead key={h} scope="col">{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className="align-top">
                <TableRowHeader className="align-top">
                  <div className="flex items-start gap-2.5">
                    <Avatar name={u.name} size="md" decorative className={cn(!u.active && "opacity-60")} />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs font-normal text-muted-foreground">
                        <span className="sr-only">Full name: </span>{u.fullName}
                        <span aria-hidden="true"> · </span>
                        <span className="sr-only">Title: </span>{u.title ?? "—"}
                      </p>
                    </div>
                  </div>
                </TableRowHeader>
                <TableCell className="align-top"><TonedChip chip={jobRoleChip(u.jobRole)} data-job-role={u.jobRole} /></TableCell>
                <TableCell className="align-top"><TonedChip chip={appRoleChip(u.appRole)} data-app-role={u.appRole} /></TableCell>
                <TableCell className="align-top break-all">
                  {u.email ?? <span className="text-muted-foreground italic">No login</span>}
                  {u.email && (
                    <p className="mt-0.5 text-xs text-muted-foreground" data-has-password={String(u.hasPassword)}>
                      {u.hasPassword ? "Password set" : "No password yet"}
                    </p>
                  )}
                </TableCell>
                <TableCell className="align-top"><TonedChip chip={activeChip(u.active)} data-active={String(u.active)} /></TableCell>
                <TableCell className="min-w-72 align-top">
                  <Collapsible className="group">
                    <CollapsibleTrigger className={cn("inline-flex cursor-pointer items-center gap-1 rounded-md text-left font-medium text-link hover:underline", focusRing)}>
                      <ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-4 transition-transform duration-150 group-data-[state=open]:rotate-90" />Edit {u.name}
                    </CollapsibleTrigger>
                    <CollapsibleContent keepMounted className="mt-3 space-y-4 rounded-lg border border-border bg-muted p-3">
                      <EditUserForm u={u} />
                      <LoginEmailForm u={u} />
                      <PasswordForm u={u} />
                      <ActiveToggle u={u} />
                      <MergeForm u={u} others={users.filter((o) => o.id !== u.id).map((o) => ({ id: o.id, name: o.name, fullName: o.fullName }))} />
                    </CollapsibleContent>
                  </Collapsible>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
  return { users, view };
}
