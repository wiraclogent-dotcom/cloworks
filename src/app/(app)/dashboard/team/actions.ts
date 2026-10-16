"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import { setKpiRosterWith, type RosterResult, type SetKpiRosterInput } from "@/lib/kpi/roster";

/** Leads and admins choose who appears on Team KPI › Requests or › Projects. Failures return as data. */
export async function setKpiRoster(input: SetKpiRosterInput): Promise<RosterResult> {
  return withUser<RosterResult, RosterResult>(requireUser, async (user) => {
    const r = await setKpiRosterWith(dbFor(user), user, input);
    if (r.ok) revalidatePath("/dashboard/team");
    return r;
  }, unauthResult);
}
