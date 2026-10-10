"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { createCategory, deleteCategory, moveCategory, updateCategory, type LibraryActionResult } from "@/app/(app)/library/actions";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { fieldClass } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { CATEGORY_ICON_KEYS } from "./categoryIcons";
import { LibraryDialog } from "./LibraryDialog";

type Cat = { id: string; name: string; icon: string | null };

function IconSelect({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={fieldClass({ kind: "select", className: "w-28" })}>
      <option value="">Default</option>
      {CATEGORY_ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
    </select>
  );
}

function CategoryRow({ cat, first, last, run, pending }: {
  cat: Cat; first: boolean; last: boolean; pending: boolean; run: (p: Promise<LibraryActionResult>) => Promise<boolean>;
}) {
  const [name, setName] = useState(cat.name);
  const [icon, setIcon] = useState(cat.icon ?? "");
  const dirty = name.trim() !== cat.name || icon !== (cat.icon ?? "");
  return (
    <li className="flex flex-wrap items-center gap-2">
      <input aria-label={`Name of ${cat.name}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60}
        className={fieldClass({ className: "min-w-0 flex-1" })} />
      <IconSelect label={`Icon for ${cat.name}`} value={icon} onChange={setIcon} disabled={pending} />
      <Button size="sm" variant="secondary" disabled={!dirty || pending}
        onClick={() => run(updateCategory(cat.id, { name: name.trim(), icon: icon || null }))}>Save</Button>
      <IconButton size="sm" aria-label={`Move ${cat.name} up`} icon={<ArrowUp />} disabled={first || pending} onClick={() => run(moveCategory(cat.id, "up"))} />
      <IconButton size="sm" aria-label={`Move ${cat.name} down`} icon={<ArrowDown />} disabled={last || pending} onClick={() => run(moveCategory(cat.id, "down"))} />
      <IconButton size="sm" aria-label={`Delete ${cat.name}`} icon={<Trash2 />} disabled={pending} onClick={() => run(deleteCategory(cat.id))} />
    </li>
  );
}

export function CategoriesDialog({ categories, onClose }: { categories: Cat[]; onClose: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("");

  const [pending, setPending] = useState(false);

  async function run(p: Promise<LibraryActionResult>): Promise<boolean> {
    setPending(true);
    setError(null);
    let r: LibraryActionResult;
    try { r = await p; } catch { setError("Something went wrong. Try again."); return false; } finally { setPending(false); }
    if (!r.ok) { setError(r.fieldErrors ? Object.values(r.fieldErrors)[0] ?? r.message : r.message); return false; }
    router.refresh();
    return true;
  }
  async function add() {
    if (await run(createCategory({ name: newName.trim(), icon: newIcon || null }))) { setNewName(""); setNewIcon(""); }
  }

  return (
    <LibraryDialog title="Manage categories" onClose={onClose} wide>
      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      <ul className="space-y-2">
        {categories.map((c, i) => (
          <CategoryRow key={`${c.id}:${c.name}:${c.icon}`} cat={c} first={i === 0} last={i === categories.length - 1} pending={pending} run={run} />
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        <input aria-label="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60}
          placeholder="New category" className={fieldClass({ className: "min-w-0 flex-1" })} />
        <IconSelect label="New category icon" value={newIcon} onChange={setNewIcon} disabled={pending} />
        <Button variant="primary" disabled={newName.trim() === "" || pending} loading={pending} onClick={add}>Add category</Button>
      </div>
    </LibraryDialog>
  );
}
