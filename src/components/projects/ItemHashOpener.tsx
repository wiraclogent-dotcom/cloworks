"use client";

import { useEffect } from "react";

/** Event the item rows listen for: `detail.slug` names the item to open and scroll to. */
export const ITEM_OPEN_EVENT = "project-item-open";

/** Renders nothing. When the URL hash is `#item-{slug}` (on load, and whenever it changes) it asks that item row to open. */
export function ItemHashOpener() {
  useEffect(() => {
    function open() {
      const hash = window.location.hash;
      if (!hash.startsWith("#item-")) return;
      window.dispatchEvent(new CustomEvent(ITEM_OPEN_EVENT, { detail: { slug: decodeURIComponent(hash.slice("#item-".length)) } }));
    }
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
