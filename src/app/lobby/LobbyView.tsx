import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import type { JoinNotice } from "@/lib/applicants";
import { first } from "@/lib/authForm";
import { loadLobbyState } from "@/lib/joinDeps";
import { requireApplicantOrRedirect } from "@/lib/session";
import { AuthForm } from "@/components/auth/AuthForm";
import { authTitleClass } from "@/components/auth/AuthShell";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { FieldDescription } from "@/components/shadcn/field";
import { joinWithCodeAction, signOutAction } from "./actions";
import { LobbyPoll } from "./LobbyPoll";

export type LobbySearch = Promise<{ notice?: string | string[] }>;

/** Why verification didn't create a join request (`?notice=`); unknown values show nothing. */
const NOTICE: Record<JoinNotice, string> = {
  LINK_INVALID: "The join link you used no longer works, so no request was sent. Ask your admin for a new one.",
  INACTIVE_MEMBER: "This email belongs to a deactivated account. Contact your admin.",
  REJECTED: "An earlier request from this account wasn't approved, so no new request was sent. Contact your admin.",
};

function SignOut() {
  return (
    <form action={signOutAction}>
      <SubmitButton variant="ghost" size="sm" pendingLabel="Signing out…">Sign out</SubmitButton>
    </form>
  );
}

function Panel({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="space-y-6">
      <h1 className={authTitleClass}>{title}</h1>
      {children}
      <SignOut />
    </div>
  );
}

const lead = "text-base leading-relaxed text-muted-foreground";

export async function LobbyView({ searchParams }: { searchParams: LobbySearch }) {
  const me = await requireApplicantOrRedirect();
  const state = await loadLobbyState(me.id);
  // The row is gone (approved and upgraded on the next session read, or cleaned up): start again from sign-in.
  if (!state) redirect("/signin");
  if (state.kind === "unverified") redirect("/verify");

  if (state.kind === "waiting") {
    return (
      <Panel title="Request sent">
        <p className={lead}>Request sent to {state.workspaceName}. We&apos;ll email you when you&apos;re approved.</p>
        <p className="text-sm text-muted-foreground">You can keep this page open: it moves you in as soon as you&apos;re approved.</p>
        <LobbyPoll />
      </Panel>
    );
  }
  if (state.kind === "rejected") {
    return (
      <Panel title="Not approved">
        <p className={lead}>Your request to {state.workspaceName} wasn&apos;t approved.</p>
        <p className="text-sm text-muted-foreground">If you think this is a mistake, contact your admin.</p>
      </Panel>
    );
  }
  const raw = first((await searchParams).notice);
  const notice = raw && raw in NOTICE ? NOTICE[raw as JoinNotice] : null;
  return (
    <Panel title="Almost there">
      <p className={lead}>You&apos;re not in a workspace yet. Ask your admin for an invite link, or paste it here.</p>
      {notice && <Alert variant="destructive"><AlertDescription>{notice}</AlertDescription></Alert>}
      <AuthForm action={joinWithCodeAction} submitLabel="Request to join" pendingLabel="Sending request…">
        <div>
          <Label htmlFor="lobby-link">Invite link</Label>
          <Input id="lobby-link" name="link" type="text" autoComplete="off" required maxLength={500} placeholder="https://…/join/…" aria-describedby="lobby-link-hint"
            className="h-11" />
          <FieldDescription id="lobby-link-hint">The whole link, or just the code at its end.</FieldDescription>
        </div>
      </AuthForm>
    </Panel>
  );
}
