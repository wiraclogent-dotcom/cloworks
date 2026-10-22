import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { requireScope } from "@/lib/session";
import { isPlatformAdminUser } from "@/lib/platformAdmin";
import { loadWaitlist } from "@/lib/waitlistDeps";
import { WAITLIST_SIZES } from "@/lib/waitlist";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/shadcn/card";
import { can } from "@/lib/permissions";
import { SettingsTabs } from "../../settings/SettingsTabs";
import { WaitlistTable, type WaitlistRow } from "./WaitlistTable";

const when = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const sizeLabel = (v: string) => WAITLIST_SIZES.find((s) => s.value === v)?.label ?? v;

/**
 * The platform-admin check comes BEFORE the read, so anyone else gets a 404 and the response holds no sign-up data.
 * (A workspace ADMIN is not enough: these entries belong to other companies.)
 */
export async function WaitlistContent() {
  const { user, db } = await requireScope();
  if (!(await isPlatformAdminUser(db, user.id))) notFound();

  const entries = await loadWaitlist();
  const rows: WaitlistRow[] = entries.map((e) => ({
    id: e.id,
    email: e.email,
    team: e.team,
    size: sizeLabel(e.teamSize),
    status: e.status,
    joined: when.format(e.createdAt),
    contacted: e.contactedAt ? when.format(e.contactedAt) : null,
  }));

  return (
    <>
      <PageHeader breadcrumb={[{ label: "Settings", href: "/settings" }, { label: "Waitlist" }]} title="Waitlist" count={rows.length} switcher={<SettingsTabs current="waitlist" admin={can(user.appRole, "admin.manage")} waitlist />}
        description="Teams that asked for a spot from the landing page, newest first." />
      {rows.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="No one on the waitlist yet." description="New sign-ups from the landing page show up here." />
      ) : (
        <Card className="overflow-hidden p-0"><WaitlistTable rows={rows} /></Card>
      )}
    </>
  );
}
