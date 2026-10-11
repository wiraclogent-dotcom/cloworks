"use client";

import { useEffect } from "react";

const POLL_MS = 15_000;
const assign = (url: string) => window.location.assign(url);

/**
 * While a join request waits: every 15 s reads the session (the read refreshes the token, which becomes a member token
 * once approved) and leaves for /requests as soon as it carries an app role. Renders nothing.
 */
export function LobbyPoll({ go = assign }: { go?: (url: string) => void }) {
  useEffect(() => {
    let done = false;
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const json = (await res.json()) as { user?: { appRole?: string } } | null;
        if (!done && json?.user?.appRole) {
          done = true;
          clearInterval(t);
          go("/requests");
        }
      } catch {
        // Offline or a hiccup: try again next tick.
      }
    }, POLL_MS);
    return () => {
      done = true;
      clearInterval(t);
    };
  }, [go]);
  return null;
}
