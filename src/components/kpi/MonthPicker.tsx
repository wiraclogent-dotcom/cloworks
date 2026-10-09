import { Button } from "@/components/ui/Button";

/**
 * GET form (works without JS): preserves `user` for team members viewing someone else.
 * A month field with a small "Show" button, for the PageHeader actions.
 */
export function MonthPicker({ month, userId, action }: { month: string; userId?: string; action: string }) {
  return (
    <form action={action} method="get" className="flex items-center gap-2">
      <label htmlFor="kpi-month" className="text-[13px] font-medium text-foreground-secondary">Month</label>
      <input id="kpi-month" name="month" type="month" defaultValue={month} required pattern="\d{4}-(0[1-9]|1[0-2])"
        className="h-9 rounded-lg border border-input bg-surface px-3 text-sm text-foreground tabular-nums shadow-card transition-colors duration-150 ease-out hover:border-foreground-secondary" />
      {userId ? <input type="hidden" name="user" value={userId} /> : null}
      <Button type="submit" size="sm">Show</Button>
    </form>
  );
}
