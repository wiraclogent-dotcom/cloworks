import { dbFor, requireUser } from "@/lib/session";
import { isUnauthenticated } from "@/lib/session-core";
import { can } from "@/lib/permissions";
import { isValidMonth, jakartaMonth } from "@/lib/kpi/months";
import { teamRequestsData } from "@/lib/kpi/pageData";
import { teamRequestsFilename, teamRequestsWorkbook } from "@/lib/kpi/exportWorkbook";

/**
 * Team KPI › Requests for `?month=YYYY-MM` (default: the current Jakarta month) as an .xlsx download, for monthly
 * reports. Same data and roster as the page table. A malformed month is a 400, not a silent fallback, so a report
 * never carries the wrong month.
 */
export async function GET(req: Request) {
  let me;
  try {
    me = await requireUser();
  } catch (e) {
    if (isUnauthenticated(e)) return new Response(null, { status: 401 });
    throw e;
  }
  if (!can(me.appRole, "dashboard.teamView")) return new Response(null, { status: 403 });

  const raw = new URL(req.url).searchParams.get("month");
  if (raw !== null && !isValidMonth(raw)) return new Response("Invalid month", { status: 400 });
  const now = new Date();
  const month = raw ?? jakartaMonth(now);

  const { rows } = await teamRequestsData(dbFor(me), month);
  const bytes = await teamRequestsWorkbook(rows, month, now).xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${teamRequestsFilename(month)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
