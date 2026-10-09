import type { Metadata } from "next";
import { Suspense } from "react";
import { Button } from "@/components/ui/Button";
import { LogoMark } from "@/components/ui/LogoMark";
import { ChangePasswordPageForm } from "./ChangePasswordPageForm";
import { SessionGate } from "./SessionGate";
import { signOutFromPasswordChange } from "./actions";

/** Tab title: "Choose a new password · Cloworks" (root layout template). Static: no per-user data in metadata. */
export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Outside the (app) group on purpose: the app shell sends people with a pending password change here, so it must not
 * run for this page. Anyone signed in may use it; it is just a password change.
 */
export default function ChangePasswordPage() {
  return (
    <main id="main" className="flex flex-1 flex-col">
      <Suspense fallback={null}><SessionGate /></Suspense>
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
            <h1 className="text-[22px] leading-7 font-semibold">Choose a new password</h1>
            <p className="mt-1 text-sm text-foreground-secondary">Choose your own password before you continue. The one you were given is temporary.</p>
          </div>
          <ChangePasswordPageForm />
          <form action={signOutFromPasswordChange} className="mt-4 text-center">
            <Button type="submit" variant="ghost" size="sm">Sign out</Button>
          </form>
        </div>
      </div>
    </main>
  );
}
