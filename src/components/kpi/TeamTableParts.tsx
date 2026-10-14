import Link from "next/link";
import { MoveHorizontal } from "lucide-react";
import type { JobRole } from "@prisma/client";
import { Avatar } from "@/components/ui/Avatar";
import { Chip } from "@/components/ui/Chip";
import { tableClass } from "@/components/ui/table";
import { cn } from "@/components/ui/cn";

/** Building blocks shared by the two Team KPI tables (Requests, Projects) so they look and behave the same. */
export const JOB_ROLE_LABEL: Record<JobRole, string> = { DESIGNER: "Designer", SOCIAL_MEDIA: "Social media", OTHER: "Other" };

/** Cell, header, number and row classes. Both tables use these, so heights, header style and alignment match. */
export const teamT = tableClass();

/**
 * Hint + scroll wrapper + table. Below lg the table keeps `minWidth` and scrolls sideways inside its card (with a
 * visible hint); the caller adds `lg:min-w-0` when it fits from lg up.
 */
export function TeamTableFrame({ caption, minWidth, children }: { caption: string; minWidth: string; children: React.ReactNode }) {
  return (
    <>
      <p data-scroll-hint="" className="mb-2 flex items-center gap-1.5 text-xs text-foreground-secondary lg:hidden">
        <MoveHorizontal aria-hidden="true" strokeWidth={1.75} className="size-3.5" />Scroll sideways to see every column.
      </p>
      <div className={cn(teamT.wrapper, "max-h-[calc(100dvh-16rem)]")}>
        <table className={cn(teamT.table, minWidth)}>
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </>
  );
}

/** First cell of a row: avatar, name (a link when `href` is given) and the role chip. */
export function TeamPersonCell({ name, role, href }: { name: string; role: JobRole; href?: string }) {
  return (
    <th scope="row" className={cn(teamT.rowHeader, "text-left")}>
      <div className="flex items-center gap-2.5">
        <Avatar name={name} size="md" decorative />
        <div className="min-w-0">
          {href ? (
            <Link href={href} className="-my-1 inline-flex min-h-7 items-center rounded-md font-medium text-foreground hover:text-link hover:underline">{name}</Link>
          ) : <span className="font-medium text-foreground">{name}</span>}
          <div className="mt-0.5"><Chip tone="tag-neutral" data-role={role}>{JOB_ROLE_LABEL[role]}</Chip></div>
        </div>
      </div>
    </th>
  );
}
