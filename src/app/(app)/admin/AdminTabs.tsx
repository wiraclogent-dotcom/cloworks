import { SegmentedControl } from "@/components/ui/SegmentedControl";

export function AdminTabs({ current }: { current: "users" | "lists" }) {
  return (
    <SegmentedControl label="Admin" value={current} className="mb-4" items={[
      { value: "users", label: "People and access", href: "/admin/users" },
      { value: "lists", label: "Brands, divisions, types", href: "/admin/lists" },
    ]} />
  );
}
