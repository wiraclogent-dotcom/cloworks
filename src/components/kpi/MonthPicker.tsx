/** GET form (works without JS): preserves `user` for team members viewing someone else. */
export function MonthPicker({ month, userId, action }: { month: string; userId?: string; action: string }) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor="kpi-month" className="mb-1 block text-sm font-medium">Month</label>
        <input id="kpi-month" name="month" type="month" defaultValue={month} required pattern="\d{4}-(0[1-9]|1[0-2])"
          className="rounded-md border border-input bg-background px-2 py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring" />
      </div>
      {userId ? <input type="hidden" name="user" value={userId} /> : null}
      <button className="rounded-md border border-border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-ring">Show</button>
    </form>
  );
}
