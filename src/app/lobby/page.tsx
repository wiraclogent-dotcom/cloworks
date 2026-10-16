import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthShell } from "@/components/auth/AuthShell";
import { LobbyView, type LobbySearch } from "./LobbyView";

/** Tab title: "Lobby · Clowork". */
export const metadata: Metadata = { title: "Lobby" };

/** Where a signed-in applicant waits: request sent, no workspace yet, or not approved. */
export default function LobbyPage({ searchParams }: { searchParams: LobbySearch }) {
  return (
    <AuthShell title={null}>
      <Suspense fallback={null}><LobbyView searchParams={searchParams} /></Suspense>
    </AuthShell>
  );
}
