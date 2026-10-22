import { CalendarRange, ClipboardList, ListChecks, UserRound, Users } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { isPlatformAdminUser } from "@/lib/platformAdmin";

type Tab = "account" | "users" | "lists" | "calendar" | "waitlist";

/**
 * Settings secondary navigation (links; the current one gets aria-current="page"). Sits in the PageHeader of Settings
 * and of every admin page, which the sidebar no longer lists (2026-10-22). `admin` adds Members, Lists and Marketing
 * calendar; `waitlist` adds the platform-admin-only Waitlist (callers pass `await isPlatformAdminUser(...)`).
 */
export function SettingsTabs({ current, admin = false, waitlist = false }: { current: Tab; admin?: boolean; waitlist?: boolean }) {
  return (
    // Up to five tabs: on a phone the tray scrolls sideways instead of running off the page.
    <SegmentedControl label="Settings sections" value={current} className="max-w-full overflow-x-auto" items={[
      { value: "account", label: "Account", icon: <UserRound aria-hidden="true" />, href: "/settings" },
      ...(admin ? [
        { value: "users", label: "Members", icon: <Users aria-hidden="true" />, href: "/admin/users" },
        { value: "lists", label: "Lists", icon: <ListChecks aria-hidden="true" />, href: "/admin/lists" },
        { value: "calendar", label: "Marketing calendar", icon: <CalendarRange aria-hidden="true" />, href: "/admin/calendar" },
      ] : []),
      ...(waitlist ? [{ value: "waitlist", label: "Waitlist", icon: <ClipboardList aria-hidden="true" />, href: "/admin/waitlist" }] : []),
    ]} />
  );
}

/** The tabs on the Account page: nothing for someone who has only the Account tab. Async, so it renders inside Suspense. */
export async function SettingsSwitcher() {
  const { user, db } = await requireScope();
  const admin = can(user.appRole, "admin.manage");
  const waitlist = await isPlatformAdminUser(db, user.id);
  return admin || waitlist ? <SettingsTabs current="account" admin={admin} waitlist={waitlist} /> : null;
}
