import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpView, type SignUpSearch } from "./SignUpView";

/** Tab title: "Create your account · Cloworks". */
export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage({ searchParams }: { searchParams: SignUpSearch }) {
  return (
    <AuthShell title="Create your account" intro="Use your work email or Gmail. You'll get into a workspace once your admin invites or approves you.">
      <Suspense fallback={null}><SignUpView searchParams={searchParams} /></Suspense>
    </AuthShell>
  );
}
