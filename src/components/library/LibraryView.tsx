"use client";

import { useMemo, useState } from "react";
import { BookOpen, Box, Folder, Megaphone, Palette, Pin, Search, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { CountPill } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { fieldClass } from "@/components/ui/Field";
import { cn, focusRing } from "@/components/ui/cn";
import { filterRows, type LibraryRow } from "@/lib/libraryView";
import { LibraryRowItem } from "./LibraryRow";

export type LibraryViewProps = {
  rows: LibraryRow[];
  categories: { id: string; name: string; icon: string | null }[];
  brands: { id: string; name: string }[];
  canManage: boolean;
  now: Date;
};

const CATEGORY_ICON: Record<string, LucideIcon> = {
  book: BookOpen, palette: Palette, box: Box, megaphone: Megaphone, folder: Folder,
};
const categoryIcon = (key: string | null): LucideIcon => (key ? CATEGORY_ICON[key] : undefined) ?? Folder;

const chipClass = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
    on ? "border-transparent bg-accent text-accent-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
    focusRing,
  );

export function LibraryView({ rows, categories, brands, canManage, now }: LibraryViewProps) {
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);

  const filtered = useMemo(() => filterRows(rows, { q, categoryId, brandId }), [rows, q, categoryId, brandId]);
  const pinned = filtered.filter((r) => r.pinned);
  const filtering = q.trim() !== "" || categoryId !== null || brandId !== null;
  const clear = () => { setQ(""); setCategoryId(null); setBrandId(null); };

  const sections = categories
    .map((c) => ({ c, items: filtered.filter((r) => r.categoryId === c.id) }))
    .filter((s) => s.items.length > 0 || (canManage && !filtering));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block">
          <span className="sr-only">Search library</span>
          <Search aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-foreground-secondary" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            maxLength={200}
            placeholder="Search title, notes or site"
            className={fieldClass({ className: "w-full pl-8 sm:w-64" })}
          />
        </label>
        {brands.length > 0 ? (
          <label className="block">
            <span className="sr-only">Brand</span>
            <select
              value={brandId ?? ""}
              onChange={(e) => setBrandId(e.target.value || null)}
              className={fieldClass({ kind: "select", className: "w-auto" })}
            >
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      <div className="-mt-1 flex flex-wrap gap-2">
        <button type="button" aria-pressed={categoryId === null} onClick={() => setCategoryId(null)} className={chipClass(categoryId === null)}>All</button>
        {categories.map((c) => (
          <button key={c.id} type="button" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)} className={chipClass(categoryId === c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      {filtered.length === 0 && filtering ? (
        <EmptyState
          icon={<Search />}
          title="No links match"
          description="Try a different search or clear the filters."
          action={<Button variant="secondary" onClick={clear}>Clear filters</Button>}
        />
      ) : filtered.length === 0 && !canManage ? (
        <EmptyState icon={<Folder />} title="No links yet" description="Shared links will show up here." />
      ) : (
        <>
          {pinned.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Pin aria-hidden="true" strokeWidth={1.75} className="size-4 text-foreground-secondary" />Pinned</CardTitle>
              </CardHeader>
              <div className="space-y-0.5">
                {pinned.map((r) => <LibraryRowItem key={r.id} row={r} now={now} />)}
              </div>
            </Card>
          ) : null}
          {sections.map(({ c, items }) => {
            const Icon = categoryIcon(c.icon);
            return (
              <Card key={c.id}>
                <CardHeader actions={<CountPill value={items.length} aria-label={`${items.length} links`} />}>
                  <CardTitle className="flex items-center gap-2">
                    <Icon aria-hidden="true" strokeWidth={1.75} className="size-4 text-foreground-secondary" />
                    {c.name}
                  </CardTitle>
                </CardHeader>
                {items.length > 0 ? (
                  <div className="space-y-0.5">
                    {items.map((r) => <LibraryRowItem key={r.id} row={r} now={now} />)}
                  </div>
                ) : (
                  <p className="text-sm text-foreground-secondary">No links in this category yet.</p>
                )}
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
