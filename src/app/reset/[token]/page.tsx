import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetView } from "./ResetView";

/** Tab title: "Set a new password · Clowork". Static: the link is the only credential and nothing about it is in metadata. */
export const metadata: Metadata = { title: "Set a new password" };

/** A reset link from email. The validity check runs at request time, inside Suspense, so the page can still prerender. */
export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <AuthShell title={null}>
      <Suspense fallback={null}><ResetView params={params} /></Suspense>
    </AuthShell>
  );
}
