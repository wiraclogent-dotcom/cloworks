"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/shadcn/button";
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
        <Button variant="default" icon={<RotateCcw aria-hidden="true" />} onClick={() => retry()}>Try again</Button>
        <Button asChild variant="outline"><Link href="/requests">Back to requests</Link></Button>
        <Button asChild variant="ghost"><Link href="/signin">Sign in again</Link></Button>
      </>} />
  );
}
