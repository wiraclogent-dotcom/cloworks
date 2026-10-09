import type { Metadata } from "next";
import { Suspense, use } from "react";
import { signIn } from "@/lib/auth";
import { oauthProviderIds } from "@/lib/auth.config";
import { PASSWORD_CHANGED_MESSAGE, signInErrorMessage } from "@/lib/signinError";
import { fieldClass, labelClass } from "@/components/ui/Field";
import { passwordSignIn } from "./actions";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/LogoMark";

/** Tab title: "Sign in · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Sign in" };

type SP = Promise<{ error?: string | string[]; changed?: string | string[] }>;

/** Reads the request's query (dynamic), so it sits in its own Suspense boundary and the rest of the page stays static. */
function Notice({ searchParams }: { searchParams: SP }) {
  const sp = use(searchParams);
  const notice = signInErrorMessage(sp.error);
  if (notice) return <Alert tone="danger">{notice}</Alert>;
  return sp.changed ? <Alert tone="success">{PASSWORD_CHANGED_MESSAGE}</Alert> : null;
}

export default function SignInPage({ searchParams }: { searchParams: SP }) {
  const btn = buttonClass({ variant: "secondary", block: true, className: "h-10" });
  const providers = oauthProviderIds();
  return (
    <main id="main" className="flex flex-1 flex-col">
      {/* Brand band: Deep Blue (the sidebar colour in both themes) with an Aqua accent line; the card overlaps it. */}
      <div data-brand-band="" className="border-b-4 border-brand-aqua bg-sidebar px-4 pt-12 pb-24 text-center text-sidebar-foreground sm:pt-16">
        <div className="mx-auto flex max-w-md flex-col items-center">
          <LogoMark size={44} />
          <p className="mt-4 text-2xl font-semibold tracking-tight">Cloworks</p>
          <p className="mt-1 text-sm text-sidebar-foreground-secondary">Request, track and measure creative work.</p>
        </div>
      </div>
      <div className="-mt-16 flex justify-center px-4 pb-8">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-raised">
        <div className="mb-5 text-center">
          <h1 className="text-[22px] leading-7 font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-foreground-secondary">Creative request tracker</p>
        </div>
        <div className="space-y-3">
          <Suspense fallback={null}><Notice searchParams={searchParams} /></Suspense>
          <form action={passwordSignIn} className="space-y-3">
            <div>
              <label htmlFor="signin-email" className={labelClass}>Email</label>
              <input id="signin-email" name="email" type="email" autoComplete="username" required className={fieldClass({ className: "h-10" })} />
            </div>
            <div>
              <label htmlFor="signin-password" className={labelClass}>Password</label>
              <input id="signin-password" name="password" type="password" autoComplete="current-password" required className={fieldClass({ className: "h-10" })} />
            </div>
            <button className={buttonClass({ variant: "primary", block: true, className: "h-10" })}>Sign in</button>
          </form>
          <p className="text-center text-xs text-foreground-secondary">No password yet, or forgot it? Ask Wira to set one.</p>
          {providers.length > 0 && (
            <>
              <p className="pt-2 text-center text-[13px] text-foreground-secondary">Or sign in with your Clogent account.</p>
              {providers.includes("google") && (
                <form
                  action={async () => {
                    "use server";
                    await signIn("google", { redirectTo: "/" });
                  }}
                >
                  <button className={btn}>Continue with Google</button>
                </form>
              )}
              {providers.includes("microsoft-entra-id") && (
                <form
                  action={async () => {
                    "use server";
                    await signIn("microsoft-entra-id", { redirectTo: "/" });
                  }}
                >
                  <button className={btn}>Continue with Microsoft</button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
      </div>
    </main>
  );
}
