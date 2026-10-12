import { Building2, Mail } from "lucide-react";
import { requireScope } from "@/lib/session";
import { accountRows } from "@/lib/settings/account";
import { photoUrl } from "@/lib/profilePhotoUrl";
import { Avatar } from "@/components/ui/Avatar";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { PhotoEditor } from "./PhotoEditor";

/**
 * Settings: a profile card (who you are, read-only) beside the password form and, for admins, the way into the admin
 * pages (the sidebar no longer lists them). Async, so it renders inside Suspense.
 */
export async function SettingsContent() {
  const { user, db } = await requireScope();
  const me = await db.user.findUnique({
    where: { id: user.id },
    select: { fullName: true, email: true, title: true, department: true, passwordHash: true, avatarUpdatedAt: true },
  });
  const hasPassword = !!me?.passwordHash;
  const rows = accountRows({
    fullName: me?.fullName ?? "", email: me?.email ?? null, title: me?.title ?? null, department: me?.department ?? null,
    appRole: user.appRole, jobRole: user.jobRole,
  });
  const value = (label: string) => rows.find((r) => r.label === label)?.value ?? "—";
  const fullName = me?.fullName || user.name;
  const photoSrc = me?.avatarUpdatedAt ? photoUrl(user.id, me.avatarUpdatedAt) : null;
  const title = value("Title");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
      <Card className="p-5">
        <CardTitle as="h2" className="sr-only">Account</CardTitle>
        <div className="flex flex-col items-center text-center">
          <Avatar name={fullName} size="lg" src={photoSrc} className="size-24 text-2xl" />
          <div className="mt-3"><PhotoEditor hasPhoto={!!photoSrc} /></div>
          <p className="mt-4 text-lg font-semibold text-foreground">{fullName}</p>
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

