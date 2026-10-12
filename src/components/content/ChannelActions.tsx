"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { deleteChannel, moveChannel } from "@/app/(app)/content/actions";
import { planHref, type ContentTab } from "@/lib/content/params";
import type { ChannelSummary } from "@/lib/content/view";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { LibraryDialog } from "@/components/library/LibraryDialog";
import { ChannelForm, type BrandOption } from "./ChannelForm";

/** One reorder: the channel to move and the neighbours (top to bottom) it lands between. */
export type ChannelMove = { id: string; aboveId: string | null; belowId: string | null };

function DeleteChannelDialog({ channel, current, tab, onClose }: { channel: ChannelSummary; current: boolean; tab: ContentTab; onClose: () => void }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function confirm() {
    setPending(true);
    setError(null);
    let r;
    try { r = await deleteChannel(channel.id); }
    catch { setError("Something went wrong. Try again."); return; }
    finally { setPending(false); }
    if (!r.ok) { setError(r.message); return; }
    onClose();
    // The open channel is gone: fall back to the first one, keeping the tab.
    if (current) router.push(planHref({ tab }));
    else router.refresh();
  }
  return (
    <LibraryDialog title={`Delete @${channel.handle}?`} onClose={onClose}>
      <p className="mb-4 text-sm text-foreground-secondary">This removes the channel with every post planned or posted on it. It cannot be undone.</p>
      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={pending} onClick={confirm}>Delete</Button>
      </div>
    </LibraryDialog>
  );
}

/**
 * Edit, Move up, Move down and Delete for one channel. `up` and `down` are the moves within its brand group, or null
 * at the group's ends. Channel managers only (the caller decides).
 */
export function ChannelActions({ channel, up, down, current, tab, brands }: {
  channel: ChannelSummary; up: ChannelMove | null; down: ChannelMove | null; current: boolean; tab: ContentTab; brands: BrandOption[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function move(m: ChannelMove) {
    setBusy(true);
    setError(null);
    try {
      const r = await moveChannel(m.id, m.aboveId, m.belowId);
      if (r.ok) router.refresh();
      else setError(r.message);
    } catch {
      setError("Could not move the channel. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="px-1 pb-1">
      <div className="flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" icon={<Pencil />} onClick={() => setDialog("edit")}>Edit</Button>
        <Button variant="ghost" size="sm" icon={<ArrowUp />} disabled={!up || busy} onClick={() => up && void move(up)}>Move up</Button>
        <Button variant="ghost" size="sm" icon={<ArrowDown />} disabled={!down || busy} onClick={() => down && void move(down)}>Move down</Button>
        <Button variant="ghost" size="sm" icon={<Trash2 />} onClick={() => setDialog("delete")}>Delete</Button>
      </div>
      {error ? <Alert tone="danger" className="mt-1">{error}</Alert> : null}
      {dialog === "edit" ? <ChannelForm brands={brands} channel={channel} onClose={() => setDialog(null)} /> : null}
      {dialog === "delete" ? <DeleteChannelDialog channel={channel} current={current} tab={tab} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
