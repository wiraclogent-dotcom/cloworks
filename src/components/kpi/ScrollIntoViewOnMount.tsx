"use client";

import { useEffect } from "react";

/**
 * Scrolls `targetId` into view once on mount, unless the URL already has a hash (the browser handles that itself).
 * Legacy `?view=projects` links use it to land on the Projects section.
 */
export function ScrollIntoViewOnMount({ targetId }: { targetId: string }) {
  useEffect(() => {
    if (!window.location.hash) document.getElementById(targetId)?.scrollIntoView();
  }, [targetId]);
  return null;
}
