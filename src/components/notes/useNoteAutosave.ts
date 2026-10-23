"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import type { NotesActionResult } from "@/app/(app)/notes/actions";

export type SaveStatus = { kind: "saved"; at: Date } | { kind: "saving" } | { kind: "retrying" } | { kind: "failed"; message: string };
type Saved = { title: string; preview: string; updatedAt: Date };
type Save = (id: string, body: JSONContent) => Promise<NotesActionResult<Saved>>;

const DEBOUNCE_MS = 1000;
const RETRY_MS = [2000, 5000, 10_000, 30_000];

/**
 * Autosave for one note (spec 2026-10-23): saves 1 s after the last change, one save at a time (a newer body waits
 * behind it), and flushes when the note closes, the tab hides or the page goes away. A refused save (too large,
 * invalid, deleted, session ended) shows its message and waits for the next edit; a network failure retries after
 * 2, 5, 10, then every 30 s. The browser warns before leaving while an edit is unsaved.
 */
export function useNoteAutosave(noteId: string, save: Save, onSaved: (id: string, r: Saved) => void, savedAt: Date) {
  const [status, setStatus] = useState<SaveStatus>({ kind: "saved", at: savedAt });
  const pending = useRef<JSONContent | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const attempt = useRef(0);
  const live = useRef({ save, onSaved });
  useEffect(() => { live.current = { save, onSaved }; });

  const flush = useCallback(async function flush(): Promise<void> {
    clearTimeout(timer.current);
    if (inFlight.current) {
      await inFlight.current;
      return flush();
    }
    const body = pending.current;
    if (!body) return;
    pending.current = null;
    const run = (async () => {
      setStatus({ kind: "saving" });
      try {
        const r = await live.current.save(noteId, body);
        attempt.current = 0;
        if (r.ok) {
          setStatus({ kind: "saved", at: r.updatedAt });
          live.current.onSaved(noteId, { title: r.title, preview: r.preview, updatedAt: r.updatedAt });
        } else {
          pending.current ??= body; // still unsaved: the next edit tries again, and leaving the page warns
          setStatus({ kind: "failed", message: r.message });
        }
      } catch {
        pending.current ??= body;
        setStatus({ kind: "retrying" });
        timer.current = setTimeout(() => void flush(), RETRY_MS[Math.min(attempt.current++, RETRY_MS.length - 1)]);
      }
    })();
    inFlight.current = run;
    await run;
    inFlight.current = null;
  }, [noteId]);

  const change = useCallback((body: JSONContent) => {
    pending.current = body;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") void flush(); };
    const onPageHide = () => void flush();
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (pending.current || inFlight.current) e.preventDefault(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  return { status, change, flush };
}
