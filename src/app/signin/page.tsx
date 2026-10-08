import type { Metadata } from "next";
import { Suspense, use } from "react";
import { signIn } from "@/lib/auth";
import { signInErrorMessage } from "@/lib/signinError";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/LogoMark";

/** Tab title: "Sign in · Creative Tracker" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Sign in" };

type SP = Promise<{ error?: string | string[] }>;

/** Reads the request's query (dynamic), so it sits in its own Suspense boundary and the rest of the page stays static. */
function Notice({ searchParams }: { searchParams: SP }) {
  const notice = signInErrorMessage(use(searchParams).error);
  return notice ? <Alert tone="danger">{notice}</Alert> : null;
}

export default function SignInPage({ searchParams }: { searchParams: SP }) {
  const btn = buttonClass({ variant: "secondary", block: true, className: "h-10" });
  return (
    <main id="main" className="flex flex-1 flex-col">
      {/* Brand band: Deep Blue (the sidebar colour in both themes) with an Aqua accent line; the card overlaps it. */}
      <div data-brand-band="" className="border-b-4 border-brand-aqua bg-sidebar px-4 pt-12 pb-24 text-center text-sidebar-foreground sm:pt-16">
        <div className="mx-auto flex max-w-md flex-col items-center">
          <LogoMark size={44} />
          <p className="mt-4 text-2xl font-semibold tracking-tight">Creative Tracker</p>
          <p className="mt-1 text-sm text-sidebar-foreground-secondary">Request, track and measure creative work.</p>
        </div>
      </div>
      <div className="-mt-16 flex justify-center px-4 pb-8">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-raised">
        <div className="mb-5 text-center">
          <h1 className="text-[22px] leading-7 font-semibold">Sign in</h1>
          <p className="mt-1 text-sm text-foreground-secondary">Creative Request Tracker</p>
        </div>
        <div className="space-y-3">
          <p className="text-center text-[13px] text-foreground-secondary">Sign in with your Clogent account.</p>
          <Suspense fallback={null}><Notice searchParams={searchParams} /></Suspense>
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
          >
            <button className={btn}>Continue with Google</button>
          </form>
          <form
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: "/" });
            }}
          >
            <button className={btn}>Continue with Microsoft</button>
          </form>
        </div>
      </div>
      </div>
    </main>
  );
}
