import type { ScopedDb } from "../db";
import { MarketingError } from "./errors";
import { assertCanSaveActivity } from "./rules";
import { validateActivity } from "./validate";
import type { ActivityInput, MarketingViewer } from "./types";

/** `YYYY-MM-DD` → the value a `@db.Date` column stores. */
export const dateOnly = (day: string) => new Date(`${day}T00:00:00Z`);

/** Divisions this person leads (DivisionLead rows), any calendar state. */
export async function loadLeadDivisionIds(db: ScopedDb, userId: string): Promise<string[]> {
  const rows = await db.divisionLead.findMany({ where: { userId }, select: { divisionId: true }, orderBy: { divisionId: "asc" } });
  return rows.map((r) => r.divisionId);
}

async function calendarDivisionIds(db: ScopedDb): Promise<string[]> {
  return (await db.division.findMany({ where: { onMarketingCalendar: true, archivedAt: null }, select: { id: true } })).map((d) => d.id);
}

/** Creates (`id` null) or updates an activity: validate → find → permission → write (spec 2026-10-19). */
export async function saveActivityWith(db: ScopedDb, viewer: MarketingViewer, id: string | null, input: ActivityInput): Promise<{ id: string }> {
  const valid = validateActivity(input);
  const existing = id ? await db.marketingActivity.findFirst({ where: { id }, select: { divisionId: true } }) : null;
  if (id && !existing) throw new MarketingError("NOT_FOUND", "Activity not found.");
  const [leads, calendar] = await Promise.all([loadLeadDivisionIds(db, viewer.id), calendarDivisionIds(db)]);
  assertCanSaveActivity(viewer, leads, calendar, existing?.divisionId ?? null, valid.divisionId);
  const data = { divisionId: valid.divisionId, title: valid.title, startDay: dateOnly(valid.startDay), endDay: dateOnly(valid.endDay), status: valid.status, updatedById: viewer.id };
  if (id) {
    await db.marketingActivity.update({ where: { id }, data });
    return { id };
  }
  const created = await db.marketingActivity.create({ data: { ...data, createdById: viewer.id }, select: { id: true } });
  return { id: created.id };
}

/** Only someone who may edit the activity's current division deletes it. */
export async function deleteActivityWith(db: ScopedDb, viewer: MarketingViewer, id: string): Promise<void> {
  const existing = await db.marketingActivity.findFirst({ where: { id }, select: { divisionId: true } });
  if (!existing) throw new MarketingError("NOT_FOUND", "Activity not found.");
  const leads = viewer.appRole === "ADMIN" ? [] : await loadLeadDivisionIds(db, viewer.id);
  if (viewer.appRole !== "ADMIN" && !leads.includes(existing.divisionId)) {
    throw new MarketingError("FORBIDDEN", "You can only edit activities of divisions you lead.");
  }
  await db.marketingActivity.delete({ where: { id } });
}
