import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "./ForgotForm";

/** Tab title: "Reset your password · Clowork". */
export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <AuthShell title="Reset your password" intro="Enter the email you signed up with and we'll send you a link to choose a new password.">
      <ForgotForm />
      <p className="text-sm text-muted-foreground">
        Remembered it? <Link href="/signin" className="font-medium text-brand-deep-blue underline-offset-4 hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
