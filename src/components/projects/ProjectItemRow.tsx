"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Pencil } from "lucide-react";
import type { ProjectStage, ProjectStatus } from "@prisma/client";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { AvatarStack } from "@/components/ui/Avatar";
import { DeadlineChip } from "@/components/ui/DeadlineChip";
import { cn } from "@/components/ui/cn";
import { fieldClass } from "@/components/ui/Field";
import { tableClass } from "@/components/ui/table";
import { daysLeft } from "@/lib/daysLeft";
import { PROJECT_STAGE_TONE, PROJECT_STATUS_TONE, type Tone } from "@/lib/palette";
import type { ProjectItem } from "@/lib/projectItemList";
import { PROJECT_STAGES, type TaskMode } from "@/lib/projectProgress";
import { PROJECT_STAGE_LABEL, TASK_STATUS_LABEL, TASK_STATUS_ORDER } from "@/lib/projectTasks";
import { safeAction } from "@/lib/safeAction";
import { AddDetailForm } from "@/app/(app)/projects/[id]/tasks/AddDetailForm";
import { TaskRow, type TaskRowData } from "@/app/(app)/projects/[id]/tasks/TaskRow";
import { renameItem, setItemStage, setItemStatus } from "@/app/(app)/projects/[id]/tasks/actions";
import { ITEM_OPEN_EVENT, slugFromHash } from "./ItemHashOpener";

const tbl = tableClass();

function segmentOf(key: ProjectStage | ProjectStatus | "none", mode: TaskMode): { label: string; tone: Tone } {
  if (key === "none") return { label: mode === "status" ? "No status yet" : "No stage yet", tone: "tag-neutral" };
  return mode === "status"
    ? { label: TASK_STATUS_LABEL[key as ProjectStatus], tone: PROJECT_STATUS_TONE[key as ProjectStatus] }
    : { label: PROJECT_STAGE_LABEL[key as ProjectStage], tone: PROJECT_STAGE_TONE[key as ProjectStage] };
}

/**
 * One item of the project page: a collapsed summary row (stage bar, owners, due date, "Set all to…") that expands into
 * the item's variants, each editable in place. Closed by default; opens itself on a `project-item-open` event for its slug.
 */
export function ProjectItemRow({ projectId, item, rows, mode, owners, canManage }: {
  projectId: string; item: ProjectItem; rows: TaskRowData[]; mode: TaskMode;
  owners: { id: string; name: string }[]; canManage: boolean;
}) {
  const router = useRouter();
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const renameBtnRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const wasRenaming = useRef(false);
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setAll, setSetAll] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(item.title);
  const [pending, startTransition] = useTransition();

  // Focus follows the inline editor: into the field when it opens, back to the Rename button when it closes.
  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
    else if (wasRenaming.current) renameBtnRef.current?.focus();
    wasRenaming.current = renaming;
  }, [renaming]);

  useEffect(() => {
    function reveal() {
      setOpen(true);
      ref.current?.scrollIntoView({ block: "start" });
    }
    function onOpen(e: Event) {
      if ((e as CustomEvent<{ slug?: string }>).detail?.slug === item.slug) reveal();
    }
    // A first-load deep link must not depend on whether ItemHashOpener's event fires after this listener exists.
    if (window.location.hash.startsWith("#item-") && slugFromHash(window.location.hash) === item.slug) reveal();
    window.addEventListener(ITEM_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(ITEM_OPEN_EVENT, onOpen);
  }, [item.slug]);

  const total = item.counts.reduce((sum, c) => sum + c.n, 0);
  const variants = `${rows.length} ${rows.length === 1 ? "variant" : "variants"}`;
  const options = mode === "status"
    ? TASK_STATUS_ORDER.map((s) => ({ value: s as string, label: TASK_STATUS_LABEL[s] }))
    : PROJECT_STAGES.map((s) => ({ value: s as string, label: PROJECT_STAGE_LABEL[s] }));

  function applyAll() {
    if (!setAll) return;
    const value = setAll;
    setError(null);
    setNote("");
    startTransition(async () => {
      const r = await safeAction(() => mode === "status"
        ? setItemStatus(projectId, item.title, value as ProjectStatus)
        : setItemStage(projectId, item.title, value as ProjectStage));
      if (r.ok) {
        setSetAll("");
        if (r.changed === 0) setNote("No variants changed. Canceled variants are skipped.");
        router.refresh();
        selectRef.current?.focus();
      } else {
        setError(r.message);
      }
    });
  }

  function saveName() {
    setError(null);
    startTransition(async () => {
      const r = await safeAction(() => renameItem(projectId, item.title, draft));
      if (r.ok) {
        setRenaming(false);
        router.refresh();
      } else {
        setError(r.message);
      }
    });
  }

  return (
    <div ref={ref} id={`item-${item.slug}`} data-open={open || undefined} className="min-w-0 scroll-mt-4 rounded-xl border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
        <div className="flex min-w-0 flex-1 basis-56 items-center gap-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${item.title}, ${variants}`}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <ChevronRight aria-hidden="true" className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-150", open && "rotate-90")} />
          <span className="min-w-0">
            <span className={cn("block truncate text-sm font-medium", item.allCancelled ? "text-foreground-muted line-through" : "text-foreground")}>{item.title}</span>
            <span className="block text-xs text-muted-foreground">{variants}</span>
          </span>
        </button>
        {canManage && !renaming && (
          <IconButton
            size="sm"
            className="size-7 shrink-0 [&_svg]:size-3.5"
            ref={renameBtnRef}
            aria-label={`Rename item ${item.title}`}
            title="Rename item"
            icon={<Pencil aria-hidden="true" />}
            onClick={() => { setError(null); setDraft(item.title); setRenaming(true); }}
          />
        )}
        </div>

        <div className="flex basis-40 flex-col gap-1">
          <div aria-hidden="true" className="flex h-2 w-full gap-px overflow-hidden rounded-full bg-muted">
            {item.counts.map((c) => (
              <div key={c.key} data-segment={c.key} data-tone={segmentOf(c.key, mode).tone} className="h-full bg-tone-accent" style={{ width: `${(c.n / total) * 100}%` }} />
            ))}
          </div>
          <ul className="sr-only">
            {item.counts.map((c) => <li key={c.key}>{`${segmentOf(c.key, mode).label}: ${c.n}`}</li>)}
          </ul>
        </div>

        <AvatarStack names={item.owners} max={3} size="sm" label="Owners" />

        <div className="min-w-24 text-sm">
          {item.dueDate ? <DeadlineChip daysLeft={daysLeft(item.dueDate)} /> : item.dueTbc ? <span className="text-muted-foreground">TBC</span> : <span className="text-foreground-muted">—</span>}
        </div>

        {canManage && !item.allCancelled && (
          <div className="flex items-center gap-1.5">
            <select
              ref={selectRef}
              aria-label={`Set all variants of ${item.title}`}
              value={setAll}
              onChange={(e) => setSetAll(e.target.value)}
              className={fieldClass({ kind: "select", size: "sm", className: "w-36" })}
            >
              <option value="">Set all to…</option>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Button size="sm" variant="secondary" aria-label={`Apply to all variants of ${item.title}`} disabled={!setAll || pending} onClick={applyAll}>
              {pending && setAll ? "Applying…" : "Apply"}
            </Button>
          </div>
        )}
      </div>

      {renaming && (
        <form
          onSubmit={(e) => { e.preventDefault(); saveName(); }}
          className="flex flex-wrap items-center gap-2 px-3 pb-2.5"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setRenaming(false); setError(null); } }}
            aria-label={`New name for ${item.title}`}
            disabled={pending}
            ref={renameInputRef}
            className={fieldClass({ size: "sm", className: "min-w-56 flex-1" })}
          />
          <Button type="submit" size="sm" variant="primary" disabled={pending || !draft.trim()}>{pending ? "Saving…" : "Save"}</Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => { setRenaming(false); setError(null); }}>Cancel</Button>
        </form>
      )}

      {canManage && !item.allCancelled && (
        <p role="status" aria-live="polite" className={note ? "px-3 pb-2.5 text-xs text-muted-foreground" : "sr-only"}>{note}</p>
      )}

      {error && <div className="px-3 pb-2.5"><Alert tone="danger">{error}</Alert></div>}

      {open && (
        <div id={panelId} className="border-t border-border">
          <div className={cn(tbl.wrapper, "max-w-full overflow-x-auto rounded-none border-0 shadow-none")}>
            <table className={tbl.table}>
              <thead className={tbl.thead}>
                <tr>
                  {["Detail", "Owner", mode === "status" ? "Status" : "Stage", "Start", "Due", "File"].map((h) => (
                    <th key={h} scope="col" className={tbl.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((t, i) => (
                  <TaskRow
                    key={t.id}
                    hideItem
                    isFirst={i === 0}
                    isLast={i === rows.length - 1}
                    projectId={projectId}
                    canManage={canManage}
                    owners={owners}
                    mode={mode}
                    task={t}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {canManage && (
            <div className="border-t border-border p-3">
              <AddDetailForm projectId={projectId} mode={mode} owners={owners} defaultTitle={item.title} label="Add variant" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
