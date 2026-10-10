"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Folder, Pin, Plus, Search, Settings2 } from "lucide-react";
import { moveItem, setPinned, type LibraryActionResult } from "@/app/(app)/library/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { CountPill } from "@/components/ui/Chip";
import { EmptyState } from "@/components/ui/EmptyState";
import { fieldClass } from "@/components/ui/Field";
import { cn, focusRing } from "@/components/ui/cn";
import { filterRows, type LibraryRow } from "@/lib/libraryView";
import { LibraryRowItem } from "./LibraryRow";
import { categoryIcon } from "./categoryIcons";
import { CategoriesDialog } from "./CategoriesDialog";
import { ConfirmDelete } from "./ConfirmDelete";
import { ItemDialog, type ItemDraft } from "./ItemDialog";

export type LibraryViewProps = {
  rows: LibraryRow[];
  categories: { id: string; name: string; icon: string | null }[];
  /** Brands in use (for the filter). */
  brands: { id: string; name: string }[];
  /** All workspace brands, for the item dialog. */
  brandOptions?: { id: string; name: string }[];
  canManage: boolean;
  now: Date;
};

const chipClass = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors duration-150",
    on ? "border-transparent bg-accent text-accent-foreground" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
    focusRing,
  );

export function LibraryView({ rows, categories, brands, brandOptions = [], canManage, now }: LibraryViewProps) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [brandId, setBrandId] = useState<string | null>(null);

  const [itemDraft, setItemDraft] = useState<ItemDraft | null>(null);
  const [deleting, setDeleting] = useState<LibraryRow | null>(null);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newItem = (categoryId?: string): ItemDraft => ({
    title: "", url: "", description: null, categoryId: categoryId ?? categories[0]?.id ?? "", brandId: null, pinned: false, files: [],
  });
  const editItem = (r: LibraryRow): ItemDraft => ({
    id: r.id, title: r.title, url: r.url, description: r.description, categoryId: r.categoryId, brandId: r.brandId, pinned: r.pinned,
    files: r.files ?? [],
  });
  async function act(p: Promise<LibraryActionResult>) {
    setError(null);
    let r: LibraryActionResult;
    try { r = await p; } catch { setError("Something went wrong. Try again."); return; }
    if (!r.ok) setError(r.message);
    else router.refresh();
  }
  const actionsFor = (r: LibraryRow, inPinnedStrip = false) => {
    const peers = rows.filter((x) => x.categoryId === r.categoryId);
    const i = peers.findIndex((x) => x.id === r.id);
    return {
      // Move reorders within the category, so it is hidden in the Pinned strip (where it would look arbitrary).
      canMove: !inPinnedStrip, canUp: i > 0, canDown: i < peers.length - 1,
      onEdit: () => setItemDraft(editItem(r)),
      onDelete: () => setDeleting(r),
      onPin: () => void act(setPinned(r.id, !r.pinned)),
      onMove: (dir: "up" | "down") => void act(moveItem(r.id, dir)),
    };
  };
  const renderRow = (r: LibraryRow, inPinnedStrip = false) => (
    <LibraryRowItem key={r.id} row={r} now={now} actions={canManage ? actionsFor(r, inPinnedStrip) : undefined} />
  );

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
        {canManage ? (
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" icon={<Settings2 />} onClick={() => setManaging(true)}>Manage categories</Button>
            <Button variant="primary" icon={<Plus />} disabled={categories.length === 0} onClick={() => setItemDraft(newItem())}>Add link</Button>
          </div>
        ) : null}
      </div>
      <div className="-mt-1 flex flex-wrap gap-2">
        <button type="button" aria-pressed={categoryId === null} onClick={() => setCategoryId(null)} className={chipClass(categoryId === null)}>All</button>
        {categories.filter((c) => canManage || rows.some((r) => r.categoryId === c.id)).map((c) => (
          <button key={c.id} type="button" aria-pressed={categoryId === c.id} onClick={() => setCategoryId(c.id)} className={chipClass(categoryId === c.id)}>
            {c.name}
          </button>
        ))}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {categories.length === 0 && canManage ? (
        <EmptyState
          icon={<Folder />}
          title="No categories yet"
          description="Create a category with Manage categories, then add links to it."
          action={<Button variant="secondary" onClick={() => setManaging(true)}>Manage categories</Button>}
        />
      ) : filtered.length === 0 && filtering ? (
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
                {pinned.map((r) => renderRow(r, true))}
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
                    {items.map((r) => renderRow(r))}
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-foreground-secondary">No links in this category yet.</p>
                    {canManage ? <Button size="sm" variant="secondary" onClick={() => setItemDraft(newItem(c.id))}>Add the first link</Button> : null}
                  </div>
                )}
              </Card>
            );
          })}
        </>
      )}

      {itemDraft ? (
        <ItemDialog item={itemDraft} categories={categories} brandOptions={brandOptions} onClose={() => setItemDraft(null)} />
      ) : null}
      {deleting ? <ConfirmDelete id={deleting.id} title={deleting.title} onClose={() => setDeleting(null)} /> : null}
      {managing ? <CategoriesDialog categories={categories} onClose={() => setManaging(false)} /> : null}
    </div>
  );
}
