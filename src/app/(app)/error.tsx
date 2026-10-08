"use client";

import Link from "next/link";

/** Generic on purpose: production redacts server error messages, so nothing here depends on `error.message`. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 p-8">
      <div role="alert" className="space-y-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p>Something went wrong. Try again, or sign in again.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => reset()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            Try again
          </button>
          <Link href="/signin" className="text-sm underline focus-visible:outline-2 focus-visible:outline-ring">Sign in again</Link>
        </div>
      </div>
    </main>
  );
}
