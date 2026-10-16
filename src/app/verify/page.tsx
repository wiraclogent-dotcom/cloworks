import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { VerifyView, type VerifySearch } from "./VerifyView";

/** Tab title: "Check your email · Cloworks". */
export const metadata: Metadata = { title: "Check your email" };

/**
 * Open to anonymous visitors too (sign-up with an email that already has an account lands here without a session),
 * so the screen is the same for everyone and never shows the email address.
 */
export default function VerifyPage({ searchParams }: { searchParams: VerifySearch }) {
  return (
    <AuthShell title="Check your email" intro="We sent a 6-digit code to the email you signed up with. Enter it below. It expires in 15 minutes.">
      <Suspense fallback={null}><VerifyView searchParams={searchParams} /></Suspense>
    </AuthShell>
  );
}
