"use server";

import { requireUserForPasswordChange } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { changeOwnPasswordAndSignOut } from "@/lib/ownPassword";
import type { AdminFormState } from "@/lib/adminForm";

/** Replaces the temporary password with one of their own, then signs out. Works while the password change is pending. */
export async function changePasswordFirstTime(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  return changeOwnPasswordAndSignOut(requireUserForPasswordChange, fd);
}

/** Lets a flagged person leave without choosing a password yet. */
export async function signOutFromPasswordChange(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
