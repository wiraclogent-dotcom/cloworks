import type { AppRole } from "@prisma/client";

export type Action =
  | "request.create"
  | "request.assign"
  | "request.transition"
  | "dashboard.team"
  | "dashboard.self"
  | "project.manage"
  | "admin.manage";

const REQUESTER: readonly Action[] = ["request.create"];
const CREATIVE: readonly Action[] = [...REQUESTER, "request.transition", "dashboard.self", "project.manage"];
const LEAD: readonly Action[] = [...CREATIVE, "request.assign", "dashboard.team"];
const ADMIN: readonly Action[] = [...LEAD, "admin.manage"];

const GRANTS: Record<AppRole, readonly Action[]> = { REQUESTER, CREATIVE, LEAD, ADMIN };

export function can(role: AppRole, action: Action): boolean {
  return GRANTS[role]?.includes(action) ?? false;
}
