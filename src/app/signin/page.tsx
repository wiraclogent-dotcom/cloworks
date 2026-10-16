import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, use } from "react";
import { signIn } from "@/lib/auth";
import { oauthProviderIds } from "@/lib/auth.config";
import { first } from "@/lib/authForm";
import { safeNext } from "@/lib/joinTokens";
import { LINKED_MESSAGE, PASSWORD_CHANGED_MESSAGE, signInErrorMessage } from "@/lib/signinError";
import { PasswordInput, RememberMe } from "@/components/ui/PasswordInput";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { passwordSignIn } from "./actions";
import { Alert, AlertDescription } from "@/components/shadcn/alert";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { cn } from "@/components/ui/cn";
import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton, OrDivider } from "@/components/auth/ProviderButtons";
import { brandSubmit, providerButton } from "@/components/auth/styles";

/** Tab title: "Sign in · Clowork" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Sign in" };

type SP = Promise<{ error?: string | string[]; changed?: string | string[]; linked?: string | string[]; next?: string | string[] }>;

/** The sanitised `next` (a join or lobby path), or undefined. */
const nextOf = (raw: string | string[] | undefined) => {
  const n = safeNext(first(raw), "");
  return n || undefined;
};

/** Reads the request's query (dynamic), so it sits in its own Suspense boundary and the rest of the page stays static. */
function Notice({ searchParams }: { searchParams: SP }) {
  const sp = use(searchParams);
  const notice = signInErrorMessage(sp.error);
  if (notice) return <Alert variant="destructive"><AlertDescription>{notice}</AlertDescription></Alert>;
  if (sp.changed) return <Alert variant="success"><AlertDescription>{PASSWORD_CHANGED_MESSAGE}</AlertDescription></Alert>;
  return sp.linked ? <Alert><AlertDescription>{LINKED_MESSAGE}</AlertDescription></Alert> : null;
}

/** Carries `?next=` into a form (sanitised here and again by the action). */
function NextField({ searchParams }: { searchParams: SP }) {
  const next = nextOf(use(searchParams).next);
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

function GoogleWithNext({ searchParams }: { searchParams: SP }) {
  return <GoogleButton next={nextOf(use(searchParams).next)} />;
}

const signUpLink = "font-medium text-brand-deep-blue underline-offset-4 hover:underline";
function SignUpLink({ searchParams }: { searchParams: SP }) {
  const next = nextOf(use(searchParams).next);
  return <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className={signUpLink}>Create an account</Link>;
}

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 21 21" aria-hidden="true" className="size-4">
      <path fill="#F25022" d="M0 0h10v10H0z" />
      <path fill="#7FBA00" d="M11 0h10v10H11z" />
      <path fill="#00A4EF" d="M0 11h10v10H0z" />
      <path fill="#FFB900" d="M11 11h10v10H11z" />
    </svg>
  );
}

/** Microsoft sign-in is not set up yet (no Entra app registration), so its button stays hidden even if env vars exist. */
const SHOW_MICROSOFT_BUTTON = false;

export default function SignInPage({ searchParams }: { searchParams: SP }) {
  const providers = oauthProviderIds().filter((p) => p !== "microsoft-entra-id" || SHOW_MICROSOFT_BUTTON);
  return (
    <AuthShell title="Sign in" intro="Send briefs, follow them across the board, and pick up the work assigned to you.">
      <div className="space-y-4">
        <Suspense fallback={null}><Notice searchParams={searchParams} /></Suspense>

        {providers.length > 0 && (
          <div className="space-y-3">
            {providers.includes("google") && (
              <Suspense fallback={<GoogleButton />}><GoogleWithNext searchParams={searchParams} /></Suspense>
            )}
            {providers.includes("microsoft-entra-id") && (
              <form
                action={async () => {
                  "use server";
                  await signIn("microsoft-entra-id", { redirectTo: "/requests" });
                }}
              >
                <SubmitButton variant="outline" className={cn("w-full", providerButton)} pendingLabel="Opening Microsoft…">
                  <MicrosoftMark />Continue with Microsoft
                </SubmitButton>
              </form>
            )}
            <OrDivider />
          </div>
        )}

        <form action={passwordSignIn} className="space-y-4">
          <Suspense fallback={null}><NextField searchParams={searchParams} /></Suspense>
          <div>
            <Label htmlFor="signin-email">Email</Label>
            <Input id="signin-email" name="email" type="email" autoComplete="username" placeholder="name@clogent.co.id" required className="h-11" />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="signin-password" className="text-compact font-medium text-foreground">Password</label>
              <Link href="/forgot" className="text-compact font-medium text-brand-deep-blue underline-offset-4 hover:underline">Forgot password?</Link>
            </div>
            <PasswordInput id="signin-password" name="password" autoComplete="current-password" required className="h-11" />
          </div>
          <RememberMe id="signin-remember" />
          <SubmitButton variant="default" className={cn("w-full", brandSubmit)} pendingLabel="Signing in…">
            Sign in
          </SubmitButton>
        </form>
        <p className="text-sm text-muted-foreground">
          New here? <Suspense fallback={<Link href="/signup" className={signUpLink}>Create an account</Link>}><SignUpLink searchParams={searchParams} /></Suspense>
        </p>
      </div>
    </AuthShell>
  );
}
