import type { AppRole } from "@prisma/client";

export const ACTIONS = [
  "request.create",
  "request.assign",
  "request.transition",
  "dashboard.team",
  "dashboard.teamView",
  "dashboard.self",
  "briefs.view",
  "project.manage",
  "admin.manage",
  "library.manage",
] as const;

export type Action = (typeof ACTIONS)[number];

// dashboard.teamView: read the Team KPI table. dashboard.team: also set targets and open another person's KPI page.
const REQUESTER: readonly Action[] = ["request.create", "dashboard.self", "dashboard.teamView", "briefs.view"];
const CREATIVE: readonly Action[] = [...REQUESTER, "request.transition", "project.manage"];
const LEAD: readonly Action[] = [...CREATIVE, "request.assign", "dashboard.team", "library.manage"];
const ADMIN: readonly Action[] = [...LEAD, "admin.manage"];

const GRANTS: Record<AppRole, readonly Action[]> = { REQUESTER, CREATIVE, LEAD, ADMIN };

export function can(role: AppRole, action: Action): boolean {
  return GRANTS[role]?.includes(action) ?? false;
}
