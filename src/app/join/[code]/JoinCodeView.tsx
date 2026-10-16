import Link from "next/link";
import { ENTER_PATH } from "@/lib/auth.config";
import { isJoinCode } from "@/lib/authForm";
import { loadJoinCode } from "@/lib/joinDeps";
import { currentVisitor } from "@/lib/session";
import { joinWithCodeAction } from "@/app/lobby/actions";
import { AuthForm } from "@/components/auth/AuthForm";
import { authTitleClass } from "@/components/auth/AuthShell";
import { brandSubmit } from "@/components/auth/styles";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/components/ui/cn";

const lead = "mt-3 text-base leading-relaxed text-muted-foreground";

/** Unknown or switched-off code: dead-link copy. Otherwise by visitor: sign up / sign in, Request to join, or already in. */
export async function JoinCodeView({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const join = isJoinCode(code) ? await loadJoinCode(code) : null;
  if (!join) {
    return (
      <div>
        <h1 className={authTitleClass}>Link not working</h1>
        <div className="mt-8"><Alert variant="warning"><AlertDescription>This link no longer works. Ask your admin for a new one.</AlertDescription></Alert></div>
      </div>
    );
  }
  const visitor = await currentVisitor();
  const here = `/join/${code}`;
  return (
    <div>
      <h1 className={authTitleClass}>Join <strong>{join.workspaceName}</strong> on Clowork</h1>
      {visitor.kind === "member" ? (
        <>
          <p className={lead}>You&apos;re already in {join.workspaceName}.</p>
          <Button asChild variant="default" className={`w-full mt-8 ${brandSubmit}`}><a href={ENTER_PATH}>Go to requests</a></Button>
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
            <Button asChild variant="default" className={cn("w-full", brandSubmit)}><Link href={`/signup?join=${encodeURIComponent(code)}`}>Create account</Link></Button>
            <Button asChild variant="outline" className="w-full h-11 text-[15px]"><Link href={`/signin?next=${encodeURIComponent(here)}`}>Sign in</Link></Button>
          </div>
        </>
      )}
    </div>
  );
}
