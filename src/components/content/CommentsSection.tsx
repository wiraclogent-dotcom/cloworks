"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addContentComment } from "@/app/(app)/content/actions";
import type { PanelComment } from "@/lib/content/panelView";
import { relativeTime } from "@/lib/relativeTime";
import { Button } from "@/components/ui/Button";
import { FieldError, fieldClass } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";

/** Post comments, oldest first. A lead's "Send back" note is highlighted as feedback. Anyone can comment. */
export function CommentsSection({ postId, comments, canComment }: { postId: string; comments: PanelComment[]; canComment: boolean }) {
  const router = useRouter();
  const uid = useId();
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const r = await addContentComment(postId, body);
      if (r.ok) {
        setBody("");
        router.refresh();
      } else setError(r.fieldErrors?.body ?? r.message);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  const now = new Date();
  return (
    <section aria-labelledby={`${uid}-h`} className="flex flex-col gap-2">
      <h3 id={`${uid}-h`} className="text-xs font-medium text-muted-foreground">{`Comments (${comments.length})`}</h3>
      {comments.length ? (
        <ul className="flex flex-col gap-1.5">
          {comments.map((c) => (
            <li key={c.id} data-feedback={c.isFeedback ? "" : undefined} data-tone={c.isFeedback ? "due-soon" : undefined}
              className={cn("rounded-lg px-3 py-2 text-compact", c.isFeedback ? "bg-tone-tint" : "bg-muted")}>
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{c.authorName}</span>
                {c.isFeedback ? " · feedback" : null}
                {" · "}<time dateTime={c.createdAt} suppressHydrationWarning>{relativeTime(new Date(c.createdAt), now)}</time>
              </p>
              <p className="mt-0.5 whitespace-pre-line text-foreground">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {canComment ? (
        <form onSubmit={submit} noValidate className="flex flex-col gap-2">
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} aria-label="Add a comment" placeholder="Add a comment… (@name to mention)"
            aria-invalid={error ? true : undefined} aria-describedby={error ? `${uid}-err` : undefined}
            className={fieldClass({ kind: "textarea", invalid: !!error, className: "min-h-16" })} />
          <FieldError id={`${uid}-err`}>{error}</FieldError>
          <Button size="sm" type="submit" className="self-end" disabled={!body.trim()} loading={pending}>Comment</Button>
        </form>
      ) : null}
    </section>
  );
}
