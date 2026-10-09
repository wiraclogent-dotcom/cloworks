"use server";

import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { withUser } from "@/lib/actionUser";
import { AdminError, changeOwnPassword } from "@/lib/admin";
import { adminResult, adminUnauth, type AdminFormState } from "@/lib/adminForm";

const s = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");
/** Typed passwords are never echoed back in the form state. */
const scrub = (r: NonNullable<AdminFormState>): NonNullable<AdminFormState> => ({ ...r, values: {} });

/** Changes the signed-in person's password, then signs them out so they sign in again with the new one. */
export async function changePassword(_prev: AdminFormState, fd: FormData): Promise<AdminFormState> {
  const r = await withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(requireUser, async (me) => {
    return adminResult(fd, async () => {
      const next = s(fd, "newPassword");
      if (next !== s(fd, "confirmPassword")) {
        throw new AdminError("VALIDATION", "The new passwords don't match.");
      }
      await changeOwnPassword(prisma, me.id, s(fd, "currentPassword"), next);
      return "Password changed.";
    });
  }, () => adminUnauth(fd));
  if (r.ok) await signOut({ redirectTo: "/signin?changed=1" });
  return scrub(r);
}
