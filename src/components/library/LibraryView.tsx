"use client";

import type { LibraryRow } from "@/lib/libraryView";

export type LibraryViewProps = {
  rows: LibraryRow[];
  categories: { id: string; name: string; icon: string | null }[];
  brands: { id: string; name: string }[];
  canManage: boolean;
  now: Date;
};

/** Minimal placeholder; Task 5 replaces this with the real Library view. */
export function LibraryView({ rows }: LibraryViewProps) {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id}>
          <a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a>
        </li>
      ))}
    </ul>
  );
}
