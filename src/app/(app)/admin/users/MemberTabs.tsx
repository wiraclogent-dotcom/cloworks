import { SegmentedControl } from "@/components/ui/SegmentedControl";

export type MemberTab = "members" | "invited" | "requests";

/** `?tab=` value to a tab; anything unknown is Members. */
export const parseMemberTab = (v: unknown): MemberTab => (v === "invited" || v === "requests" ? v : "members");

/** Members | Invited | Requests (n): links, so each tab is a server render of its own data. */
export function MemberTabs({ current, pending }: { current: MemberTab; pending: number }) {
  return (
    <SegmentedControl label="Member views" value={current} items={[
      { value: "members", label: "Members", href: "/admin/users" },
      { value: "invited", label: "Invited", href: "/admin/users?tab=invited" },
      { value: "requests", label: pending > 0 ? `Requests ${pending}` : "Requests", href: "/admin/users?tab=requests" },
    ]} />
  );
}
