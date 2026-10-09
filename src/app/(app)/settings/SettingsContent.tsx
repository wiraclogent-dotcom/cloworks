import Link from "next/link";
import { ChevronRight, ListChecks, Users } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { accountRows } from "@/lib/settings/account";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";
import { cn, focusRing } from "@/components/ui/cn";
import { ChangePasswordForm } from "./ChangePasswordForm";

/**
 * The General settings: the signed-in user's account (read-only), password, appearance and, for admins, the way into
 * the admin pages (the sidebar no longer lists them). Async, so it renders inside Suspense.
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

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle as="h2">Account</CardTitle>
        </CardHeader>
        <dl className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          {rows.map((r) => (
            <div key={r.label} className="contents">
              <dt className="text-sm text-foreground-secondary">{r.label}</dt>
              <dd className="text-sm text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Password</CardTitle>
        </CardHeader>
        {hasPassword ? (
          <ChangePasswordForm />
        ) : (
          <p className="text-sm text-foreground-secondary">You sign in without a password. Ask an admin if you want one.</p>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Appearance</CardTitle>
        </CardHeader>
        <ThemeSwitch />
      </Card>
      {can(user.appRole, "admin.manage") ? (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Administration</CardTitle>
          </CardHeader>
          <ul className="-mx-2 grid gap-1">
            <AdminLink href="/admin/users" icon={<Users aria-hidden="true" />} label="Users" hint="People, roles, access and passwords" />
            <AdminLink href="/admin/lists" icon={<ListChecks aria-hidden="true" />} label="Lists" hint="Brands, divisions and request types" />
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function AdminLink({ href, icon, label, hint }: { href: string; icon: React.ReactNode; label: string; hint: string }) {
  return (
    <li>
      <Link href={href} className={cn("flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-muted [&_svg]:size-4", focusRing)}>
        <span className="text-foreground-secondary">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block text-xs text-foreground-secondary">{hint}</span>
        </span>
        <ChevronRight aria-hidden="true" className="text-foreground-muted" />
      </Link>
    </li>
  );
}
