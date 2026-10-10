"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Generic on purpose: production redacts server error messages, so nothing here depends on `error.message`.
 * Try again uses `retry()` (re-fetches the segment), not `reset()`, which re-renders the same failed result.
 */
export default function AppError({ retry }: { error: Error & { digest?: string }; reset: () => void; retry: () => void }) {
  return (
    <EmptyState role="alert" titleAs="h1" icon={<TriangleAlert />} title="Something went wrong" className="mx-auto mt-6 max-w-xl"
      description="Something went wrong. Try again, or sign in again."
      action={<>
        <Button variant="primary" icon={<RotateCcw aria-hidden="true" />} onClick={() => retry()}>Try again</Button>
        <Link href="/requests" className={buttonClass({ variant: "secondary" })}>Back to requests</Link>
        <Link href="/signin" className={buttonClass({ variant: "ghost" })}>Sign in again</Link>
      </>} />
  );
}
