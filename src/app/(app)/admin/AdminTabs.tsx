import { ClipboardList, ListChecks, Users } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

/**
 * Admin secondary navigation (links; the current section gets aria-current="page"). Sits in the PageHeader.
 * `waitlist` adds the platform-admin-only Waitlist tab; callers pass `await isPlatformAdminUser(...)`.
 */
export function AdminTabs({ current, waitlist = false }: { current: "users" | "lists" | "waitlist"; waitlist?: boolean }) {
  return (
    <SegmentedControl label="Admin sections" value={current} items={[
      { value: "users", label: "Members", icon: <Users aria-hidden="true" />, href: "/admin/users" },
      { value: "lists", label: "Lists", icon: <ListChecks aria-hidden="true" />, href: "/admin/lists" },
      ...(waitlist ? [{ value: "waitlist", label: "Waitlist", icon: <ClipboardList aria-hidden="true" />, href: "/admin/waitlist" }] : []),
    ]} />
  );
}
