import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { InviteView } from "./InviteView";

/** Tab title: "Accept invite · Clowork". Static: no invite details in metadata. */
export const metadata: Metadata = { title: "Accept invite" };

/** An emailed invite (/join/invite/<token>): set a password or use Google, or Accept when already signed in. */
export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <AuthShell title={null}>
      <Suspense fallback={null}><InviteView params={params} /></Suspense>
    </AuthShell>
  );
}
