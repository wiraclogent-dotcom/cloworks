"use server";

import { redirect } from "next/navigation";
import { ENTER_PATH } from "@/lib/auth.config";
import { JoinError, resendCode, verifyCode } from "@/lib/applicants";
import { failed, field, told, type AuthFormState } from "@/lib/authForm";
import { joinDeps } from "@/lib/joinDeps";
import { safeNext } from "@/lib/joinTokens";
import { currentVisitor } from "@/lib/session";

const WRONG = "That code isn't right or has expired.";
const SENT = "We sent a new code.";

/**
 * Checks the code for the signed-in applicant. Anonymous visitors (sign-up with a taken email) always get the
 * wrong-code answer, so the screen behaves the same either way. On success: to the lobby when a join request was made
 * or refused (with a notice), else to the sanitised `next` (default /lobby).
 */
export async function verifyAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const code = field(fd, "code", { max: 20 });
  const visitor = await currentVisitor();
  if (visitor.kind === "member") redirect(ENTER_PATH);
  if (visitor.kind !== "applicant" || !/^\d{6}$/.test(code)) return failed(WRONG);
  let res: Awaited<ReturnType<typeof verifyCode>>;
  try {
    res = await verifyCode(await joinDeps(), visitor.applicant.id, code);
  } catch (e) {
    if (!(e instanceof JoinError)) throw e;
    return failed(e.code === "TOO_MANY" ? "Too many wrong codes. Ask for a new one." : WRONG);
  }
  if (res.notice) redirect(`/lobby?notice=${res.notice}`);
  redirect(res.joined ? "/lobby" : safeNext(field(fd, "next", { max: 300 })));
}

/** New code for the signed-in applicant (rate limited). Anonymous visitors get the same "sent" answer, and nothing happens. */
export async function resendAction(): Promise<AuthFormState> {
  const visitor = await currentVisitor();
  if (visitor.kind === "member") redirect(ENTER_PATH);
  if (visitor.kind !== "applicant") return told(SENT, { sentAt: Date.now() });
  try {
    await resendCode(await joinDeps(), visitor.applicant.id);
  } catch (e) {
    if (!(e instanceof JoinError)) throw e;
    if (e.code === "RATE_LIMITED") return failed(e.message);
    // Nothing left to verify (already verified): the lobby is the next step.
    redirect("/lobby");
  }
  return told(SENT, { sentAt: Date.now() });
}
