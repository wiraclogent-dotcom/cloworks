"use server";

import { requireUser } from "@/lib/session";
import { changeOwnPasswordAndSignOut } from "@/lib/ownPassword";
import type { AdminFormState } from "@/lib/adminForm";

/** Changes the signed-in person's password, then signs them out so they sign in again with the new one. */
export async function changePassword(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return changeOwnPasswordAndSignOut(requireUser, fd);
}
