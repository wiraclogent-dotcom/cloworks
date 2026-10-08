import { JobRole, type AppRole, type PrismaClient } from "@prisma/client";
import { can } from "@/lib/permissions";
import { isValidMonth } from "./months";

export type SetTargetInput = { userId: string; month: string; role: JobRole; targetTasks: number; note?: string };
export type TargetCode = "FORBIDDEN" | "INVALID" | "NOT_FOUND" | "UNAUTHENTICATED";
export type SetTargetResult = { ok: true } | { ok: false; code: TargetCode; message: string };

const fail = (code: TargetCode, message: string): SetTargetResult => ({ ok: false, code, message });

export async function setTargetWith(
  db: PrismaClient,
  user: { id: string; appRole: AppRole },
  input: SetTargetInput,
): Promise<SetTargetResult> {
  if (!can(user.appRole, "dashboard.team")) return fail("FORBIDDEN", "Only leads and admins can set KPI targets.");
  if (typeof input.userId !== "string" || !input.userId) return fail("INVALID", "Choose a person.");
  if (typeof input.month !== "string" || !isValidMonth(input.month)) return fail("INVALID", "Month must be in YYYY-MM format.");
  if (!Object.values(JobRole).includes(input.role)) return fail("INVALID", "Unknown role.");
  const t = input.targetTasks;
  if (typeof t !== "number" || !Number.isInteger(t) || t < 0 || t > 10000) {
    return fail("INVALID", "Target must be a whole number between 0 and 10,000.");
  }
  // undefined = leave the stored note alone; "" / whitespace = clear it.
  const note = typeof input.note === "string" ? input.note.trim() : undefined;
  if (note !== undefined && note.length > 200) return fail("INVALID", "Note must be 200 characters or fewer.");

  const target = await db.user.findUnique({ where: { id: input.userId }, select: { id: true } });
  if (!target) return fail("NOT_FOUND", "Person not found.");

  const data = { role: input.role, targetTasks: t };
  await db.kpiTarget.upsert({
    where: { userId_month: { userId: input.userId, month: input.month } },
    create: { userId: input.userId, month: input.month, ...data, note: note || null },
    update: note === undefined ? data : { ...data, note: note || null },
  });
  return { ok: true };
}
