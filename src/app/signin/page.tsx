import { Suspense, use } from "react";
import { signIn } from "@/lib/auth";
import { signInErrorMessage } from "@/lib/signinError";
import { Alert } from "@/components/ui/Alert";
import { buttonClass } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/LogoMark";

type SP = Promise<{ error?: string | string[] }>;

/** Reads the request's query (dynamic), so it sits in its own Suspense boundary and the rest of the page stays static. */
function Notice({ searchParams }: { searchParams: SP }) {
  const notice = signInErrorMessage(use(searchParams).error);
  return notice ? <Alert tone="danger">{notice}</Alert> : null;
}

export default function SignInPage({ searchParams }: { searchParams: SP }) {
  const btn = buttonClass({ variant: "secondary", block: true, className: "h-10" });
  return (
    <main id="main" className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 text-card-foreground shadow-card">
        <div className="mb-6 flex flex-col items-center text-center">
          <LogoMark size={40} />
          <h1 className="mt-4 text-[22px] leading-7 font-semibold">Creative Request Tracker</h1>
          <p className="mt-1 text-sm text-foreground-secondary">Request, track and measure creative work.</p>
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
    </main>
  );
}
