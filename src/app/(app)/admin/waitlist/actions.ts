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

export async function markWaitlist(id: string, status: "NEW" | "CONTACTED"): Promise<void> {
  await requirePlatformAdmin();
  if (status !== "NEW" && status !== "CONTACTED") return;
  await setWaitlistStatusBy(id, status);
  revalidatePath("/admin/waitlist");
}

export async function deleteWaitlist(id: string): Promise<void> {
  await requirePlatformAdmin();
  await deleteWaitlistEntryBy(id);
  revalidatePath("/admin/waitlist");
}
