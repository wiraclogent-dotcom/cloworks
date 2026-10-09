import { ChevronRight, Mail } from "lucide-react";
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
import { ActiveToggle, AddAllowedForm, AddPersonForm, EditUserForm, LoginEmailForm, PasswordForm, RemoveAllowed } from "./UserForms";

function TonedChip({ chip, ...rest }: { chip: { label: string; tone: Parameters<typeof Chip>[0]["tone"] } } & Record<`data-${string}`, string>) {
  return <Chip tone={chip.tone} {...rest}>{chip.label}</Chip>;
}

/** Permission is checked BEFORE any query, so a non-admin payload contains no admin data. */
export async function UsersContent() {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "admin.manage")) return <AdminDenied />;

  const [users, allowed] = await Promise.all([
    // Explicit select: rows go to client forms, so secrets (passwordHash) must never be loaded here.
    db.user
      .findMany({
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: { id: true, name: true, fullName: true, title: true, appRole: true, jobRole: true, aliases: true, email: true, active: true, passwordHash: true },
      })
      .then((rows) => rows.map(({ passwordHash, ...u }) => ({ ...u, hasPassword: !!passwordHash }))),
    db.allowedEmail.findMany({ orderBy: { email: "asc" } }),
  ]);
  const owners = new Map(users.filter((u) => u.email).map((u) => [u.email!.toLowerCase(), u.name]));
  const t = tableClass({ minWidth: "min-w-[60rem]" });

  return (
    <>
      <PageHeader breadcrumb={[{ label: "Admin" }, { label: "Users" }]} title="People and access" count={users.length} switcher={<AdminTabs current="users" />}
        description="Company-domain addresses can sign in once bound to a person. Anyone else needs the address on the allowed list (adding a login email below does this for you)." />

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

      <div className="mt-6 grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <section aria-labelledby="add-person-h">
            <CardHeader><CardTitle id="add-person-h">Add person</CardTitle></CardHeader>
            <AddPersonForm />
          </section>
        </Card>

        <Card>
          <section aria-labelledby="allowed-h">
            <CardHeader>
              <CardTitle id="allowed-h">Allowed emails</CardTitle>
              <p className="text-[13px] text-foreground-secondary">Outside addresses that may sign in.</p>
            </CardHeader>
            {allowed.length === 0 ? (
              <p className="mb-4 text-sm text-foreground-secondary">No outside addresses are allowed.</p>
            ) : (
              <ul className="mb-4 divide-y divide-border rounded-lg border border-border">
                {allowed.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span aria-hidden="true" className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-foreground-secondary"><Mail strokeWidth={1.75} className="size-3.5" /></span>
                      <div className="min-w-0">
                        <p className="font-medium break-all text-foreground">{a.email}</p>
                        <p className="text-[13px] text-foreground-secondary">
                          {owners.has(a.email.toLowerCase()) ? `Used by ${owners.get(a.email.toLowerCase())}` : "Not linked to a person"}
                          {a.note ? ` · ${a.note}` : ""}
                        </p>
                      </div>
                    </div>
                    <RemoveAllowed email={a.email} />
                  </li>
                ))}
              </ul>
            )}
            <AddAllowedForm />
          </section>
        </Card>
      </div>
    </>
  );
}
