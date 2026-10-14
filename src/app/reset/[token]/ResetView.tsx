import Link from "next/link";
import { connection } from "next/server";
import { authTitleClass } from "@/components/auth/AuthShell";
import { Alert } from "@/components/ui/Alert";
import { isInviteToken } from "@/lib/authForm";
import { resetLinkUsable } from "@/lib/joinDeps";
import { ResetForm } from "./ResetForm";

/** Heading, form or the "not working" notice, decided per request. */
export async function ResetView({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const usable = isInviteToken(token) && (await resetLinkUsable(token));
  if (usable) {
    return (
      <>
        <h1 className={authTitleClass}>Set a new password</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">Choose a password you haven&apos;t used before.</p>
        <div className="mt-8"><ResetForm token={token} /></div>
      </>
    );
  }
  return (
    <>
      <h1 className={authTitleClass}>Link not working</h1>
      <div className="mt-8 space-y-4">
        <Alert tone="warning">This link has expired or was already used. Ask for a new one.</Alert>
        <p className="text-sm text-muted-foreground">
          <Link href="/forgot" className="font-medium text-brand-deep-blue underline-offset-4 hover:underline">Request a new link</Link>
        </p>
      </div>
    </>
  );
}
