import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isPlatformAdminUser } from "@/lib/platformAdmin";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/shadcn/button";
import { Card } from "@/components/shadcn/card";
import { AdminDenied } from "../AdminDenied";
import { SettingsTabs } from "../../settings/SettingsTabs";
import { DivisionCalendarForm } from "../lists/ListForms";

/**
 * Settings › Marketing calendar: one open row per division with its lane colour, calendar switch, order and leads
 * (moved out of the folded Lists panels, 2026-10-22). Permission is checked before any query.
 */
export async function CalendarContent() {
  const { user: viewer, db } = await requireScope();
  if (!can(viewer.appRole, "admin.manage")) return <AdminDenied />;

  const [divisions, members] = await Promise.all([
    db.division.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { leads: { select: { userId: true } } } }),
    db.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <>
      <PageHeader breadcrumb={[{ label: "Settings", href: "/settings" }, { label: "Marketing calendar" }]} title="Marketing calendar"
        switcher={<SettingsTabs current="calendar" admin waitlist={await isPlatformAdminUser(db, viewer.id)} />}
        description="Which divisions get a lane, in what order and colour, and who leads them. Leads add and edit their division's activities." />
      {divisions.length === 0 ? (
        <EmptyState icon={<CalendarRange />} title="No divisions yet" description="Add divisions in Lists, then pick here which ones get a lane."
          action={<Button asChild variant="outline" size="sm"><Link href="/admin/lists">Add divisions in Lists</Link></Button>} />
      ) : (
        <Card className="p-0">
          <ul aria-label="Divisions" className="divide-y divide-border">
            {divisions.map((d) => (
              <li key={d.id} className="px-4 py-3">
                <DivisionCalendarForm members={members}
                  division={{ id: d.id, name: d.name, color: d.color, onMarketingCalendar: d.onMarketingCalendar, sortOrder: d.sortOrder, leadIds: d.leads.map((l) => l.userId) }} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
