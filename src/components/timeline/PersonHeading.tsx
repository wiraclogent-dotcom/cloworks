import type { TimelinePerson } from "@/lib/workload";
import { Avatar, UnassignedAvatar } from "../ui/Avatar";

/** Avatar, name (the section's h3) and the open count. */
export function PersonHeading({ person, headingId }: { person: TimelinePerson; headingId: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {person.assigneeId ? <Avatar name={person.name} size="sm" decorative /> : <UnassignedAvatar size="sm" decorative />}
      <div className="min-w-0">
        <h3 id={headingId} className="truncate text-sm font-medium text-foreground">{person.name}</h3>
        <p className="text-xs text-foreground-secondary tabular-nums">{`${person.count} open`}</p>
      </div>
    </div>
  );
}
