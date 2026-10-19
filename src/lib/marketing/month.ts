import type { ScopedDb } from "../db";
import { isValidMonth } from "../kpi/months";
import { dateOnly } from "./activities";
import { MarketingError } from "./errors";
import { canManageMonth } from "./rules";
import { validateAnnouncement, validateProductFocus } from "./validate";
import type { AnnouncementInput, MarketingViewer } from "./types";

function assertManager(viewer: MarketingViewer) {
  if (!canManageMonth(viewer)) throw new MarketingError("FORBIDDEN", "Only admins can edit the product focus and announcements.");
}

/** Upserts the month's product focus; an empty text clears it (spec 2026-10-19). */
export async function saveProductFocusWith(db: ScopedDb, viewer: MarketingViewer, month: string, text: string): Promise<void> {
  const productFocus = validateProductFocus(text);
  if (!isValidMonth(month)) throw new MarketingError("INVALID", "Pick a valid month.", { month: "Pick a valid month." });
  assertManager(viewer);
  const existing = await db.marketingMonth.findFirst({ where: { month }, select: { id: true } });
  if (existing) await db.marketingMonth.update({ where: { id: existing.id }, data: { productFocus, updatedById: viewer.id } });
  else await db.marketingMonth.create({ data: { month, productFocus, updatedById: viewer.id } });
}

export async function saveAnnouncementWith(db: ScopedDb, viewer: MarketingViewer, id: string | null, input: AnnouncementInput): Promise<{ id: string }> {
  const valid = validateAnnouncement(input);
  if (id && !(await db.marketingAnnouncement.findFirst({ where: { id }, select: { id: true } }))) throw new MarketingError("NOT_FOUND", "Announcement not found.");
  assertManager(viewer);
  const data = {
    month: valid.month, body: valid.body,
    startDay: valid.startDay ? dateOnly(valid.startDay) : null, endDay: valid.endDay ? dateOnly(valid.endDay) : null,
  };
  if (id) {
    await db.marketingAnnouncement.update({ where: { id }, data });
    return { id };
  }
  return { id: (await db.marketingAnnouncement.create({ data: { ...data, createdById: viewer.id }, select: { id: true } })).id };
}

export async function deleteAnnouncementWith(db: ScopedDb, viewer: MarketingViewer, id: string): Promise<void> {
  if (!(await db.marketingAnnouncement.findFirst({ where: { id }, select: { id: true } }))) throw new MarketingError("NOT_FOUND", "Announcement not found.");
  assertManager(viewer);
  await db.marketingAnnouncement.delete({ where: { id } });
}
