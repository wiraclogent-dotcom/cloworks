import Link from "next/link";
import { isJoinCode } from "@/lib/authForm";
import { loadJoinCode } from "@/lib/joinDeps";
import { currentVisitor } from "@/lib/session";
import { joinWithCodeAction } from "@/app/lobby/actions";
import { AuthForm } from "@/components/auth/AuthForm";
import { authTitleClass } from "@/components/auth/AuthShell";
import { brandSubmit } from "@/components/auth/styles";
import { buttonClass } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const lead = "mt-3 text-base leading-relaxed text-foreground-secondary";

/** Unknown or switched-off code: dead-link copy. Otherwise by visitor: sign up / sign in, Request to join, or already in. */
export async function JoinCodeView({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const join = isJoinCode(code) ? await loadJoinCode(code) : null;
  if (!join) {
    return (
      <div>
        <h1 className={authTitleClass}>Link not working</h1>
        <div className="mt-8"><Alert tone="warning">This link no longer works. Ask your admin for a new one.</Alert></div>
      </div>
    );
  }
  const visitor = await currentVisitor();
  const here = `/join/${code}`;
  return (
    <div>
      <h1 className={authTitleClass}>Join <strong>{join.workspaceName}</strong> on Cloworks</h1>
      {visitor.kind === "member" ? (
        <>
          <p className={lead}>You&apos;re already in {join.workspaceName}.</p>
          <Link href="/requests" className={buttonClass({ variant: "primary", block: true, className: `mt-8 ${brandSubmit}` })}>Go to requests</Link>
        </>
      ) : visitor.kind === "applicant" ? (
        <>
          <p className={lead}>Send a request and an admin of {join.workspaceName} will let you in.</p>
          <div className="mt-8">
            <AuthForm action={joinWithCodeAction} submitLabel="Request to join" pendingLabel="Sending request…">
              <input type="hidden" name="link" value={code} />
            </AuthForm>
          </div>
        </>
      ) : (
        <>
          <p className={lead}>Create an account, or sign in, and an admin of {join.workspaceName} will let you in.</p>
          <div className="mt-8 space-y-3">
            <Link href={`/signup?join=${encodeURIComponent(code)}`} className={buttonClass({ variant: "primary", block: true, className: brandSubmit })}>Create account</Link>
            <Link href={`/signin?next=${encodeURIComponent(here)}`} className={buttonClass({ variant: "secondary", block: true, className: "h-11 text-[15px]" })}>Sign in</Link>
          </div>
        </>
      )}
    </div>
  );
}
