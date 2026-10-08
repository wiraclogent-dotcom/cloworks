"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";

/** Generic on purpose: production redacts server error messages, so nothing here depends on `error.message`. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <div role="alert" className="space-y-4 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-card">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p>Something went wrong. Try again, or sign in again.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => reset()}
            className={buttonClass({ variant: "primary" })}>
            Try again
          </button>
          <Link href="/signin" className="text-sm text-link underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">Sign in again</Link>
        </div>
      </div>
    </div>
  );
}
