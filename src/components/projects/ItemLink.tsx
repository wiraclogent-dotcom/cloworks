"use client";

import type { ReactNode } from "react";
import { ITEM_OPEN_EVENT } from "./ItemHashOpener";

/** Link to an item row (`#item-{slug}`). Besides moving the hash it asks the row to open, so clicking the same link again
 *  (when the hash does not change) still re-opens a row that was collapsed in the meantime. */
export function ItemLink({ slug, className, title, children }: { slug: string; className?: string; title?: string; children: ReactNode }) {
  return (
    <a
      href={`#item-${slug}`}
      className={className}
      title={title}
      onClick={() => window.dispatchEvent(new CustomEvent(ITEM_OPEN_EVENT, { detail: { slug } }))}
    >
      {children}
    </a>
  );
}
