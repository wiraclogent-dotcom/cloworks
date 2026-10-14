import { connection } from "next/server";
import { ENTER_PATH, oauthProviderIds } from "@/lib/auth.config";
import { isInviteToken } from "@/lib/authForm";
import { loadInvite } from "@/lib/joinDeps";
import { roleLabel } from "@/lib/invites";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { currentVisitor } from "@/lib/session";
import { AuthForm } from "@/components/auth/AuthForm";
import { authTitleClass } from "@/components/auth/AuthShell";
import { GoogleButton, OrDivider } from "@/components/auth/ProviderButtons";
import { brandSubmit } from "@/components/auth/styles";
import { Alert } from "@/components/ui/Alert";
import { PasswordInput, RememberMe } from "@/components/ui/PasswordInput";
import { fieldClass, hintClass, labelClass } from "@/components/ui/Field";
import { acceptInviteAction } from "./actions";
import { Button } from "@/components/shadcn/button";

const lead = "mt-3 text-base leading-relaxed text-muted-foreground";

/**
 * Shows only the workspace, inviter, role and the MASKED invited email (never the address itself). Members are told
 * they're in; a closed invite asks the inviter for a new one.
 */
export async function InviteView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Request-time only: describeInvite reads the clock (now = new Date()), which cacheComponents forbids in a prerender.
  await connection();
  const [invite, visitor] = await Promise.all([isInviteToken(token) ? loadInvite(token) : null, currentVisitor()]);

  if (visitor.kind === "member") {
    return (
      <div>
        <h1 className={authTitleClass}>You&apos;re already a member</h1>
        <p className={lead}>You&apos;re signed in to a workspace already.</p>
        <Button asChild variant="default" className={`w-full mt-8 ${brandSubmit}`}><a href={ENTER_PATH}>Go to requests</a></Button>
      </div>
    );
  }
  if (!invite || invite.status !== "open") {
    return (
      <div>
        <h1 className={authTitleClass}>Invite expired</h1>
        <div className="mt-8"><Alert tone="warning">This invite has expired — ask {invite?.inviterName || "your admin"} for a new one.</Alert></div>
      </div>
    );
  }

  const here = `/join/invite/${token}`;
  return (
    <div>
      <h1 className={authTitleClass}>
        {invite.linkedName ? (
          <>{invite.inviterName} invited you to join <strong>{invite.workspaceName}</strong> as <strong>{invite.linkedName}</strong></>
        ) : (
          <>{invite.inviterName} invited you to <strong>{invite.workspaceName}</strong> as <strong>{roleLabel(invite)}</strong></>
        )}
      </h1>
      <p className={lead}>This invite is for {invite.maskedEmail}.</p>
      <div className="mt-8 space-y-4">
        {visitor.kind === "applicant" ? (
          <AuthForm action={acceptInviteAction} submitLabel="Accept invite" pendingLabel="Joining…">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="mode" value="applicant" />
          </AuthForm>
        ) : (
          <>
            {oauthProviderIds().includes("google") && (
              <div className="space-y-3">
                <GoogleButton next={here} />
                <OrDivider>or set a password</OrDivider>
              </div>
            )}
            <AuthForm action={acceptInviteAction} submitLabel="Join" pendingLabel="Joining…">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="mode" value="password" />
              {!invite.linkedName && (
                <div>
                  <label htmlFor="invite-name" className={labelClass}>Your name</label>
                  <input id="invite-name" name="name" type="text" autoComplete="name" maxLength={100} required className={fieldClass({ className: "h-11" })} />
                </div>
              )}
              <div>
                <label htmlFor="invite-password" className={labelClass}>Password</label>
                <PasswordInput id="invite-password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={200} required
                  aria-describedby="invite-password-hint" className={fieldClass({ className: "h-11" })} />
                <p id="invite-password-hint" className={hintClass}>At least {MIN_PASSWORD_LENGTH} characters.</p>
              </div>
              <RememberMe id="invite-remember" />
            </AuthForm>
          </>
        )}
      </div>
    </div>
  );
}
