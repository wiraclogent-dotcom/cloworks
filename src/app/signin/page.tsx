import { signIn } from "@/lib/auth";

export default function SignInPage() {
  const btn =
    "w-full rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 text-card-foreground">
        <h1 className="text-2xl font-semibold">Creative Request Tracker</h1>
        <p className="text-sm text-muted-foreground">Sign in with your Clogent account.</p>
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
