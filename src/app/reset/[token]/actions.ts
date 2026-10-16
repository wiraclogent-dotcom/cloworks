"use server";

import { redirect } from "next/navigation";
import { JoinError } from "@/lib/applicants";
import { failed, field, isInviteToken, type AuthFormState } from "@/lib/authForm";
import { resetPasswordBy } from "@/lib/joinDeps";

/** Sets the new password from a reset link, then sends them to sign in with it. */
export async function resetAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const token = field(fd, "token", { max: 128 });
  if (!isInviteToken(token)) return failed("This link has expired or was already used. Ask for a new one.");
  const password = field(fd, "password", { max: 1000, trim: false });
  const confirm = field(fd, "confirmPassword", { max: 1000, trim: false });
  if (password !== confirm) return failed("The passwords don't match.");
  try {
    await resetPasswordBy(token, password);
  } catch (e) {
    if (e instanceof JoinError) return failed(e.message);
    throw e;
  }
  redirect("/signin?changed=1");
}
