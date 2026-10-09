import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { accountRows } from "@/lib/settings/account";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { ThemeSwitch } from "@/components/ui/ThemeSwitch";

/** The General settings: the signed-in user's account (read-only) and appearance. Async, so it renders inside Suspense. */
export async function SettingsContent() {
  const user = await requireUserOrRedirect();
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true, email: true, title: true, department: true },
  });
  const rows = accountRows({ ...(me ?? { fullName: "", email: null, title: null, department: null }), appRole: user.appRole, jobRole: user.jobRole });

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
          <CardTitle as="h2">Appearance</CardTitle>
        </CardHeader>
        <ThemeSwitch />
      </Card>
    </div>
  );
}
