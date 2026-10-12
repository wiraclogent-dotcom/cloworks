"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { ENTER_PATH } from "@/lib/auth.config";
import { signIn } from "@/lib/auth";
import { AdminError } from "@/lib/admin";
import { failed, field, isInviteToken, rememberOf, type AuthFormState } from "@/lib/authForm";
import { INVITE_STALE_MESSAGE } from "@/lib/invites";
import { acceptInviteBy } from "@/lib/joinDeps";
import { currentVisitor } from "@/lib/session";

const GONE = "This invite has expired or was already used. Ask your admin for a new one.";

/** AdminError → fixed copy (the library's messages are fixed text; they never carry the full invited email). */
function copyFor(e: AdminError): string {
  if (e.code === "NOT_FOUND") return e.message === INVITE_STALE_MESSAGE ? e.message : GONE;
  if (e.code === "VALIDATION" || e.code === "FORBIDDEN" || e.code === "CONFLICT") return e.message;
  return "Something went wrong. Try again.";
}

/**
 * Accepts an invite. `mode=applicant`: the signed-in applicant becomes the member (same id, so the next session read
 * upgrades the token) and goes to /requests via /lobby/enter. `mode=password`: a new account with the given name and password, then a
 * password sign-in to /requests.
 */
export async function acceptInviteAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const token = field(fd, "token", { max: 200 });
  if (!isInviteToken(token)) return failed(GONE);
  const visitor = await currentVisitor();
  if (visitor.kind === "member") redirect(ENTER_PATH);

  if (field(fd, "mode") === "applicant") {
    if (visitor.kind !== "applicant") return failed("Your session ended — sign in again.");
    try {
      await acceptInviteBy(token, { applicantId: visitor.applicant.id });
    } catch (e) {
      if (e instanceof AdminError) return failed(copyFor(e));
      throw e;
    }
    // Through /lobby/enter: it writes the upgraded (member) token to the cookie, else the edge sends them back to /lobby.
    redirect(ENTER_PATH);
  }

  const name = field(fd, "name", { max: 200 });
  const password = field(fd, "password", { max: 1000, trim: false });
  let email: string;
  try {
    ({ email } = await acceptInviteBy(token, { name, password }));
  } catch (e) {
    if (e instanceof AdminError) return failed(copyFor(e), { name });
    throw e;
  }
  try {
    await signIn("credentials", { email, password, ...rememberOf(fd), redirectTo: "/requests" });
  } catch (e) {
    // signIn's success path throws Next's redirect, which must propagate.
    if (e instanceof AuthError) redirect("/signin");
    throw e;
  }
  return null;
}
