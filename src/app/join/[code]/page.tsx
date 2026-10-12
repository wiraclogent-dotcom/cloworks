import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { JoinCodeView } from "./JoinCodeView";

/** Tab title: "Join a workspace · Cloworks". Static: the workspace name is not put in metadata. */
export const metadata: Metadata = { title: "Join a workspace" };

/** A shared join link (/join/<code>): sign up or sign in, then request to join. */
export default function JoinCodePage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <AuthShell title={null}>
      <Suspense fallback={null}><JoinCodeView params={params} /></Suspense>
    </AuthShell>
  );
}
