import { dbFor, requireUser } from "@/lib/session";
import { isUnauthenticated } from "@/lib/session-core";
import { can } from "@/lib/permissions";
import { isValidMonth, jakartaMonth } from "@/lib/kpi/months";
import { teamRequestsData } from "@/lib/kpi/pageData";
import { teamRequestsFilename, teamRequestsWorkbook } from "@/lib/kpi/exportWorkbook";
import { measureOfTeam, resolveTeam } from "@/lib/kpi/team";
import { parseTeamParam } from "../../params";

/**
 * Team KPI's main table for `?month=YYYY-MM` (default: the current Jakarta month) and `?team=` as an .xlsx download,
 * for monthly reports. Same data, roster and team rule as the page (only an admin may pick the team; for anyone else
 * `team` is ignored, as on the page). A malformed month is a 400, not a silent fallback, so a report never carries
 * the wrong month.
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

  const params = new URL(req.url).searchParams;
  const raw = params.get("month");
  if (raw !== null && !isValidMonth(raw)) return new Response("Invalid month", { status: 400 });
  const now = new Date();
  const month = raw ?? jakartaMonth(now);

  const team = resolveTeam(me, parseTeamParam(params.get("team") ?? undefined));
  const measure = measureOfTeam(team);
  const { rows } = await teamRequestsData(dbFor(me), month, team);
  const bytes = await teamRequestsWorkbook(rows, month, now, measure).xlsx.writeBuffer();
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${teamRequestsFilename(month, measure)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
