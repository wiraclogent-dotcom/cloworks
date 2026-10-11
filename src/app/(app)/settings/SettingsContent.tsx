import Link from "next/link";
import { Building2, ChevronRight, ListChecks, Mail, Users } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { accountRows } from "@/lib/settings/account";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { cn, focusRing } from "@/components/ui/cn";
import { ChangePasswordForm } from "./ChangePasswordForm";

/**
 * Settings: a profile card (who you are, read-only) beside the password form and, for admins, the way into the admin
 * pages (the sidebar no longer lists them). Async, so it renders inside Suspense.
 */
export async function SettingsContent() {
  const { user, db } = await requireScope();
  const me = await db.user.findUnique({
    where: { id: user.id },
    select: { fullName: true, email: true, title: true, department: true, passwordHash: true },
  });
  const hasPassword = !!me?.passwordHash;
  const rows = accountRows({
    fullName: me?.fullName ?? "", email: me?.email ?? null, title: me?.title ?? null, department: me?.department ?? null,
    appRole: user.appRole, jobRole: user.jobRole,
  });
  const value = (label: string) => rows.find((r) => r.label === label)?.value ?? "—";
  const fullName = me?.fullName || user.name;
  const title = value("Title");
  const isAdmin = can(user.appRole, "admin.manage");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Card className="p-5">
        <CardTitle as="h2" className="sr-only">Account</CardTitle>
        <div className="flex flex-col items-center text-center">
          <Avatar name={fullName} size="lg" />
          <p className="mt-3 text-lg font-semibold text-foreground">{fullName}</p>
          {title !== "—" ? <p className="text-sm text-foreground-secondary">{title}</p> : null}
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <Chip>{value("Role")}</Chip>
            <Chip>{value("Job role")}</Chip>
          </div>
        </div>
        <dl className="mt-5 grid gap-4 border-t border-border pt-5">
          <ProfileRow icon={<Mail aria-hidden="true" />} label="Email" value={value("Email")} />
          <ProfileRow icon={<Building2 aria-hidden="true" />} label="Department" value={value("Department")} />
        </dl>
      </Card>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div>
              <CardTitle as="h2">Password</CardTitle>
              <p className="mt-1 text-sm text-foreground-secondary">
                Use at least 10 characters. Changing it signs you out, so sign in again with the new one.
              </p>
            </div>
          </CardHeader>
          {hasPassword ? (
            <ChangePasswordForm />
          ) : (
            <p className="text-sm text-foreground-secondary">You sign in without a password. Ask an admin if you want one.</p>
          )}
        </Card>

        {isAdmin ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle as="h2">Administration</CardTitle>
                <p className="mt-1 text-sm text-foreground-secondary">Manage people and the lists the board uses.</p>
              </div>
            </CardHeader>
            <ul className="grid divide-y divide-border">
              <AdminLink href="/admin/users" icon={<Users aria-hidden="true" />} label="Members" hint="Invite people, approve join requests, roles and passwords" />
              <AdminLink href="/admin/lists" icon={<ListChecks aria-hidden="true" />} label="Lists" hint="Brands, divisions and request types" />
            </ul>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 text-foreground-muted [&_svg]:size-4">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-foreground-muted">{label}</dt>
        <dd className="truncate text-sm text-foreground">{value}</dd>
      </div>
    </div>
  );
}

function AdminLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <li>
      <Link href={href} className={cn("-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-muted [&_svg]:size-4", focusRing)}>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-secondary">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block text-xs text-foreground-secondary">{hint}</span>
        </span>
        <ChevronRight aria-hidden="true" className="text-foreground-muted" />
      </Link>
    </li>
  );
}
