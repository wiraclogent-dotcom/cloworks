"use server";

import { revalidatePath } from "next/cache";
import { dbFor, requireUser } from "@/lib/session";
import { withUser, unauthResult } from "@/lib/actionUser";
import type { ScopedDb } from "@/lib/db";
import type { SessionUser } from "@/lib/session-core";
import { MarketingError, type MarketingErrorCode } from "@/lib/marketing/errors";
import { deleteActivityWith, saveActivityWith } from "@/lib/marketing/activities";
import { deleteAnnouncementWith, saveAnnouncementWith, saveProductFocusWith } from "@/lib/marketing/month";
import type { ActivityInput, AnnouncementInput } from "@/lib/marketing/types";

export type MarketingActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: MarketingErrorCode | "UNAUTHENTICATED"; message: string; fieldErrors?: Record<string, string> };

/** Auth, scoped db, MarketingError → result object (Next redacts thrown errors in production), revalidate on success. */
function run<T extends object>(fn: (db: ScopedDb, user: SessionUser) => Promise<T | void>): Promise<MarketingActionResult<T>> {
  return withUser<MarketingActionResult<T>, MarketingActionResult<T>>(requireUser, async (user) => {
    try {
      const r = await fn(dbFor(user), user);
      revalidatePath("/marketing");
      return { ok: true, ...(r ?? {}) } as MarketingActionResult<T>;
    } catch (e) {
      if (!(e instanceof MarketingError)) throw e;
      return e.fieldErrors ? { ok: false, code: e.code, message: e.message, fieldErrors: e.fieldErrors } : { ok: false, code: e.code, message: e.message };
    }
  }, unauthResult);
}

export async function saveActivity(id: string | null, input: ActivityInput): Promise<MarketingActionResult<{ id: string }>> {
  return run((db, u) => saveActivityWith(db, u, id, input));
}
export async function deleteActivity(id: string): Promise<MarketingActionResult> {
  return run((db, u) => deleteActivityWith(db, u, id));
}
export async function saveProductFocus(month: string, text: string): Promise<MarketingActionResult> {
  return run((db, u) => saveProductFocusWith(db, u, month, text));
}
export async function saveAnnouncement(id: string | null, input: AnnouncementInput): Promise<MarketingActionResult<{ id: string }>> {
  return run((db, u) => saveAnnouncementWith(db, u, id, input));
}
export async function deleteAnnouncement(id: string): Promise<MarketingActionResult> {
  return run((db, u) => deleteAnnouncementWith(db, u, id));
}
