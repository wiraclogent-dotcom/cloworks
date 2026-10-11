"use server";

import { field, failed, told, type AuthFormState } from "@/lib/authForm";
import { joinDeps } from "@/lib/joinDeps";
import { requestPasswordReset } from "@/lib/passwordReset";

/** Always answers the same way, whether or not the address has an account (no enumeration). */
export async function forgotAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const email = field(fd, "email", { max: 320 });
  if (!email.includes("@")) return failed("Enter the email you signed up with.", { email });
  const { db, mailer, baseUrl } = await joinDeps();
  await requestPasswordReset({ db, mailer, baseUrl }, email);
  return told("If an account exists for that email, we've sent a reset link. It expires in one hour.");
}
