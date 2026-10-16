"use server";

import { redirect } from "next/navigation";
import { ENTER_PATH } from "@/lib/auth.config";
import { signOut } from "@/lib/auth";
import { JoinError, requestJoinByCode } from "@/lib/applicants";
import { failed, field, isJoinCode, type AuthFormState } from "@/lib/authForm";
import { joinDeps } from "@/lib/joinDeps";
import { currentVisitor } from "@/lib/session";

const JOIN_ERROR: Partial<Record<JoinError["code"], string>> = {
  LINK_INVALID: "This link no longer works. Ask your admin for a new one.",
  REJECTED: "An earlier request from this account wasn't approved, so you can't request again. Contact your admin.",
  INACTIVE_MEMBER: "This email belongs to a deactivated account. Contact your admin.",
};

/** The join code from a pasted join link (".../join/<code>", any host) or a bare code; null when it is neither. */
function codeFrom(raw: string): string | null {
  const s = raw.trim();
  if (isJoinCode(s)) return s;
  const m = /\/join\/([^/?#\s]+)\/?(?:[?#].*)?$/.exec(s);
  return m && m[1] !== "invite" && isJoinCode(m[1]) ? m[1] : null;
}

/**
 * Lobby paste box and the "Request to join" button on /join/<code>: asks that workspace to let the signed-in applicant
 * in, then shows the lobby. Invite links are personal and are accepted by opening them, not here.
 */
export async function joinWithCodeAction(_prev: AuthFormState, fd: FormData): Promise<AuthFormState> {
  const raw = field(fd, "link", { max: 500 });
  const visitor = await currentVisitor();
  if (visitor.kind === "member") redirect(ENTER_PATH);
  if (visitor.kind !== "applicant") redirect("/signin");
  if (/\/join\/invite\//.test(raw)) return failed("That's an invite link. Open it in your browser to accept the invite.");
  const code = codeFrom(raw);
  if (!code) return failed("That doesn't look like a join link. Paste the whole link your admin sent.");
  try {
    await requestJoinByCode(await joinDeps(), visitor.applicant.id, code);
  } catch (e) {
    if (!(e instanceof JoinError)) throw e;
    // Not verified yet: finish that first, then come back to this link.
    if (e.code === "VALIDATION") redirect(`/verify?next=${encodeURIComponent(`/join/${code}`)}`);
    return failed(JOIN_ERROR[e.code] ?? "Something went wrong. Try again.");
  }
  redirect("/lobby");
}

/** Every lobby state offers this. */
export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: "/signin" });
}
