"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createPost } from "@/app/(app)/content/actions";
import { planHref, TAB_SURFACE, type ContentTab } from "@/lib/content/params";
import { Button } from "@/components/shadcn/button";
import { FieldError, fieldClass } from "@/components/ui/Field";
import { cn, focusRing } from "@/components/ui/cn";
import { TILE_ASPECT } from "./PostTile";

/** The "+" tile at the top of the grid: creates an IDEA post in this tab and opens it. Drafters only. */
export function NewPostTile({ channelId, tab }: { channelId: string; tab: ContentTab }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function add() {
    setPending(true);
    setError(null);
    try {
      const r = await createPost({ channelId, surface: TAB_SURFACE[tab], kind: "PLANNED" });
      if (r.ok) router.push(planHref({ channel: channelId, tab, post: r.id }));
      else setError(r.message);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }
  // The error sits over the tile, outside the button, so the button's label never hides it.
  return (
    <div className="relative">
      <button type="button" onClick={add} disabled={pending} aria-label="New post" title="New post" aria-busy={pending || undefined}
        className={cn("flex w-full items-center justify-center border border-dashed border-border-strong bg-card text-muted-foreground",
          "transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground disabled:opacity-55 [&_svg]:size-6",
          TILE_ASPECT[tab], focusRing)}>
        <Plus aria-hidden="true" />
      </button>
      {error ? (
        <p role="alert" className="pointer-events-none absolute inset-x-1 bottom-1 rounded bg-background/90 px-1 text-center text-xs leading-4 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** "+ Already posted" at the divider: records a post that is already live, by its posting date. Drafters only. */
export function AlreadyPostedButton({ channelId, tab }: { channelId: string; tab: ContentTab }) {
  const router = useRouter();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await createPost({ channelId, surface: TAB_SURFACE[tab], kind: "PUBLISHED", publishedAt: date });
      if (r.ok) {
        setOpen(false);
        setDate("");
        router.push(planHref({ channel: channelId, tab, post: r.id }));
      } else setError(r.fieldErrors?.publishedAt ?? r.message);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => setOpen(true)}>Already posted</Button>;
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-wrap items-center justify-center gap-2">
      <label htmlFor={`${uid}-date`} className="text-xs text-muted-foreground">Posted on</label>
      <input id={`${uid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required autoFocus
        aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : undefined}
        className={fieldClass({ size: "sm", invalid: !!error, className: "w-auto" })} />
      <Button type="submit" size="sm" variant="default" loading={pending}>Add</Button>
      <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
      <FieldError id={`${uid}-err`} className="w-full justify-center">{error}</FieldError>
    </form>
  );
}
