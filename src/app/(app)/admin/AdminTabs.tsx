import { ListChecks, Users } from "lucide-react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

/** Admin secondary navigation (links; the current section gets aria-current="page"). Sits in the PageHeader. */
export function AdminTabs({ current }: { current: "users" | "lists" }) {
  return (
    <SegmentedControl label="Admin sections" value={current} items={[
      { value: "users", label: "Users", icon: <Users aria-hidden="true" />, href: "/admin/users" },
      { value: "lists", label: "Lists", icon: <ListChecks aria-hidden="true" />, href: "/admin/lists" },
    ]} />
  );
}
