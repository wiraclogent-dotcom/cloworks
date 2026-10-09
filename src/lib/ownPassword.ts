import { dbFor } from "@/lib/session";
import { signOut } from "@/lib/auth";
import { withUser } from "@/lib/actionUser";
import type { SessionUser } from "@/lib/session-core";
import { AdminError, changeOwnPassword } from "@/lib/admin";
import { adminResult, adminUnauth, type AdminFormState } from "@/lib/adminForm";

const s = (fd: FormData, k: string) => (typeof fd.get(k) === "string" ? (fd.get(k) as string) : "");

/**
 * Shared core of the two "change my own password" actions (Settings and the forced /change-password page): the same
 * mismatch check, `changeOwnPassword`, then sign out so they sign in again with the new one. Typed passwords are never
 * echoed back in the form state.
 */
export async function changeOwnPasswordAndSignOut(getUser: () => Promise<SessionUser>, fd: FormData): Promise<AdminFormState> {
  const scrub = (r: NonNullable<AdminFormState>): NonNullable<AdminFormState> => ({ ...r, values: {} });
  const r = await withUser<NonNullable<AdminFormState>, NonNullable<AdminFormState>>(getUser, async (me) => {
    const db = dbFor(me);
    return adminResult(fd, async () => {
      const next = s(fd, "newPassword");
      if (next !== s(fd, "confirmPassword")) throw new AdminError("VALIDATION", "The new passwords don't match.");
      await changeOwnPassword(db, me.id, s(fd, "currentPassword"), next);
      return "Password changed.";
    });
  }, () => adminUnauth(fd));
  if (r.ok) await signOut({ redirectTo: "/signin?changed=1" });
  return scrub(r);
}
