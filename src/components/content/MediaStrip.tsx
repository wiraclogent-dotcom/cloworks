"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ContentMediaRole } from "@prisma/client";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { setPostMedia } from "@/app/(app)/content/actions";
import type { PanelMedia } from "@/lib/content/panelView";
import { MediaUpload } from "@/components/media/MediaUpload";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/components/ui/cn";
import { STRIPES } from "./PostTile";

// Small overlay buttons inside a media tile: the shadcn icon-sm Button, shrunk to 20px.
const iconBtn = "size-5 rounded bg-background/90 text-foreground hover:bg-background hover:text-foreground [&_svg]:size-3.5";

/**
 * A row of thumbnails for one media role. With `editable`, each can be moved or removed and "+" uploads another;
 * every change saves the full ordered list with setPostMedia and the page refreshes from the server.
 */
export function MediaStrip({ postId, role, items, editable, mediaReady, label }: {
  postId: string; role: ContentMediaRole; items: PanelMedia[]; editable: boolean; mediaReady: boolean; label: string;
}) {
  const router = useRouter();
  // Local copy for optimistic moves; resynced whenever the server sends a new list.
  const [list, setList] = useState(items);
  const [seen, setSeen] = useState(items);
  if (seen !== items) { setSeen(items); setList(items); }
  // The latest list for callbacks that finish later (an upload completing after a refresh or another change).
  const listRef = useRef(list);
  useEffect(() => { listRef.current = list; }, [list]);
  const [pending, setPending] = useState(false);
  // Moves and removes wait while a file uploads, so the save that follows it cannot undo them.
  const [uploading, setUploading] = useState(false);
  const locked = pending || uploading;
  const [error, setError] = useState<string | null>(null);

  async function save(next: PanelMedia[]) {
    const before = listRef.current;
    listRef.current = next;
    setList(next);
    setPending(true);
    setError(null);
    try {
      const r = await setPostMedia(postId, next.map((m) => ({ mediaId: m.mediaId, role })));
      if (!r.ok) {
        listRef.current = before;
        setList(before);
        setError(r.message);
        if (r.code === "LOCKED" || r.code === "CONFLICT") router.refresh();
      }
    } catch {
      listRef.current = before;
      setList(before);
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }
  const move = (i: number, d: -1 | 1) => {
    const next = [...list];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    void save(next);
  };

  if (!editable && !list.length) return null;
  return (
    <div role="group" aria-label={label} aria-busy={pending || undefined}>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="flex flex-wrap items-start gap-1.5">
        {list.map((m, i) => (
          <li key={m.mediaId} className={cn("group relative aspect-[3/4] w-14 overflow-hidden rounded-md bg-muted", !m.url && STRIPES)}>
            {m.url ? (
              // eslint-disable-next-line @next/next/no-img-element -- Cloudinary already sizes and formats the image
              <img src={m.url} alt={`${label} ${i + 1}`} className="size-full object-cover" />
            ) : <span className="sr-only">{`${label} ${i + 1}`}</span>}
            {m.type === "VIDEO" ? (
              <span aria-hidden="true" className="absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded bg-background/85 [&_svg]:size-3"><Play /></span>
            ) : null}
            {editable ? (
              <span className="absolute inset-x-0.5 top-0.5 flex justify-between gap-0.5">
                <span className="flex gap-0.5">
                  {i > 0 ? <Button variant="ghost" size="icon-sm" className={iconBtn} aria-label={`Move ${i + 1} earlier`} disabled={locked} onClick={() => move(i, -1)}><ChevronLeft aria-hidden="true" /></Button> : null}
                  {i < list.length - 1 ? <Button variant="ghost" size="icon-sm" className={iconBtn} aria-label={`Move ${i + 1} later`} disabled={locked} onClick={() => move(i, 1)}><ChevronRight aria-hidden="true" /></Button> : null}
                </span>
                <Button variant="ghost" size="icon-sm" className={iconBtn} aria-label={`Remove ${i + 1}`} disabled={locked}
                  onClick={() => void save(list.filter((x) => x.mediaId !== m.mediaId))}><X aria-hidden="true" /></Button>
              </span>
            ) : null}
          </li>
        ))}
        {editable ? (
          <li>
            <MediaUpload purpose="content" accept="both" disabled={pending || !mediaReady} onBusyChange={setUploading}
              onUploaded={(u) => {
                const cur = listRef.current;
                void save([...cur, { mediaId: u.id, type: u.type, url: u.url, order: cur.length }]);
              }} />
          </li>
        ) : null}
      </ul>
      {editable && !mediaReady ? <p className="mt-1 text-xs text-muted-foreground">Media storage is not configured</p> : null}
      {error ? <p role="alert" className="mt-1 text-xs text-danger">{error}</p> : null}
    </div>
  );
}
