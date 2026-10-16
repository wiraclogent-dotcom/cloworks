"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { requireScope } from "@/lib/session";
import { isPlatformAdminUser } from "@/lib/platformAdmin";
import { deleteWaitlistEntryBy, setWaitlistStatusBy } from "@/lib/waitlistDeps";

/**
 * The waitlist belongs to people outside every workspace, so each action re-checks on the server that the signed-in user
 * is a platform admin (PLATFORM_ADMIN_EMAILS) BEFORE touching data. Anyone else gets a 404, like the page.
 */
async function requirePlatformAdmin(): Promise<void> {
  const { user, db } = await requireScope();
  if (!(await isPlatformAdminUser(db, user.id))) notFound();
}

/** Prisma's "record to update/delete not found": another admin or tab already removed the row. */
const isNotFound = (e: unknown): boolean => typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2025";

/** Runs the write; a row that is already gone counts as done (the page still refreshes), any other error is thrown. */
async function writeOrGone(write: () => Promise<void>): Promise<void> {
  try {
    await write();
  } catch (e) {
    if (!isNotFound(e)) throw e;
  }
  revalidatePath("/admin/waitlist");
}

export async function markWaitlist(id: string, status: "NEW" | "CONTACTED"): Promise<void> {
  await requirePlatformAdmin();
  if (typeof id !== "string" || (status !== "NEW" && status !== "CONTACTED")) return;
  await writeOrGone(() => setWaitlistStatusBy(id, status));
}

export async function deleteWaitlist(id: string): Promise<void> {
  await requirePlatformAdmin();
  if (typeof id !== "string") return;
  await writeOrGone(() => deleteWaitlistEntryBy(id));
}
