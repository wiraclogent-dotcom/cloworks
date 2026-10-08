import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/Button";

/**
 * GET form (works without JS): preserves `user` for team members viewing someone else.
 * Rendered as a pill (calendar icon + month field) with a small "Show" button, for the PageHeader actions.
 */
export function MonthPicker({ month, userId, action }: { month: string; userId?: string; action: string }) {
  return (
    <form action={action} method="get" className="flex items-center gap-2">
      <label htmlFor="kpi-month" className="text-[13px] font-medium text-foreground-secondary">Month</label>
      <span className="relative inline-flex items-center">
        <CalendarDays aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute left-3 size-4 text-foreground-secondary" />
        <input id="kpi-month" name="month" type="month" defaultValue={month} required pattern="\d{4}-(0[1-9]|1[0-2])"
          className="h-9 rounded-full border border-input bg-surface pr-3 pl-9 text-sm text-foreground tabular-nums shadow-card transition-colors duration-150 ease-out hover:border-foreground-secondary" />
      </span>
      {userId ? <input type="hidden" name="user" value={userId} /> : null}
      <Button type="submit" size="sm">Show</Button>
    </form>
  );
}
