import { Suspense, use } from "react";
import { signIn } from "@/lib/auth";
import { signInErrorMessage } from "@/lib/signinError";

type SP = Promise<{ error?: string | string[] }>;

/** Reads the request's query (dynamic), so it sits in its own Suspense boundary and the rest of the page stays static. */
function Notice({ searchParams }: { searchParams: SP }) {
  const notice = signInErrorMessage(use(searchParams).error);
  return notice ? <p role="alert" className="rounded-md border border-border bg-muted p-3 text-sm">{notice}</p> : null;
}

export default function SignInPage({ searchParams }: { searchParams: SP }) {
  const btn =
    "w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 text-card-foreground">
        <h1 className="text-2xl font-semibold">Creative Request Tracker</h1>
        <p className="text-sm text-muted-foreground">Sign in with your Clogent account.</p>
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
    </main>
  );
}
