"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ContentSurface } from "@prisma/client";
import { ExternalLink, Trash2, X } from "lucide-react";
import { deletePost, loadApprove } from "@/app/(app)/content/actions";
import type { ApproveFormData } from "@/lib/content/approve";
import type { PostPanelView } from "@/lib/content/panelView";
import { relativeTime } from "@/lib/relativeTime";
import { STATUS_LABEL as REQUEST_STATUS_LABEL } from "@/lib/statusLabels";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/shadcn/button";
import { cn, focusRing } from "@/components/ui/cn";
import { ApproveForm } from "./ApproveForm";
import { CommentsSection } from "./CommentsSection";
import { PostPanelEditor } from "./PostPanelEditor";
import { PostPanelReview } from "./PostPanelReview";
import { STATUS_LABEL, STATUS_TONE } from "./PostTile";

const SURFACE_TITLE: Record<ContentSurface, string> = { FEED: "Feed post", REEL: "Reel", STORY: "Story" };

/** Why the fields are read-only, or null while the post is editable. */
function lockLine(view: PostPanelView): string | null {
  const { post } = view;
  if (post.status === "SUBMITTED") {
    const when = post.submittedAt ? `, ${relativeTime(new Date(post.submittedAt), new Date())}` : "";
    return `🔒 Locked while waiting for approval · submitted by ${post.author.name}${when}`;
  }
  if (post.status === "APPROVED" || post.status === "IN_PRODUCTION" || post.status === "DONE") return "🔒 Locked · approved and sent to the creative team";
  return null;
}

/** Two-step delete; afterwards the panel closes. */
function DeletePost({ postId, closeHref }: { postId: string; closeHref: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setPending(true);
    setError(null);
    try {
      const r = await deletePost(postId);
      if (r.ok) router.push(closeHref);
      else setError(r.message);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
      {error ? <p role="alert" className="mr-auto text-xs text-danger">{error}</p> : null}
      {confirming ? (
        <>
          <span className="text-compact text-muted-foreground">Delete this post and its media?</span>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>Keep</Button>
          <Button size="sm" variant="destructive" loading={pending} onClick={remove}>Delete</Button>
        </>
      ) : (
        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setConfirming(true)}>Delete post</Button>
      )}
    </div>
  );
}

/**
 * The right column for the open post (`?post=`): the drafting editor while editable for this user, else the
 * read-only review with the lead's Send back / Approve; the approve form replaces both while open. Below 1024px it
 * is a full-screen sheet. Closing is a link that drops `post` from the URL.
 */
export function PostPanel({ view, closeHref }: { view: PostPanelView; closeHref: string }) {
  const { post, can } = view;
  const router = useRouter();
  const [approveForm, setApproveForm] = useState<ApproveFormData | null>(null);
  const [loadingApprove, setLoadingApprove] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function startApprove() {
    setLoadingApprove(true);
    setMessage(null);
    try {
      const r = await loadApprove(post.id);
      if (r.ok) setApproveForm(r.form);
      else {
        setMessage(r.message);
        if (r.code === "CONFLICT") router.refresh();
      }
    } catch {
      setMessage("Something went wrong. Try again.");
    } finally {
      setLoadingApprove(false);
    }
  }

  const request = requestId ? { id: requestId, status: null } : post.request;
  const lock = lockLine(view);
  const published = post.kind === "PUBLISHED";
  return (
    <aside aria-label="Post details"
      className={cn("flex flex-col gap-4 bg-card p-4 max-xl:fixed max-xl:inset-0 max-xl:z-40 max-xl:overflow-y-auto",
        "xl:rounded-xl xl:border xl:border-border xl:shadow-card")}>
      <header className="flex items-center gap-2">
        {approveForm ? <h2 className="text-sm font-semibold text-foreground">Approve &amp; create request</h2> : (
          <>
            {!published ? (
              <span data-badge="" data-tone={STATUS_TONE[post.status]} className="rounded bg-tone-tint px-1.5 py-0.5 text-xs font-semibold text-tone-text">
                {STATUS_LABEL[post.status]}
              </span>
            ) : null}
            <h2 className="text-sm font-semibold text-foreground">{published ? `Posted ${SURFACE_TITLE[post.surface].toLowerCase()}` : SURFACE_TITLE[post.surface]}</h2>
          </>
        )}
        <Link href={closeHref} aria-label="Close" title="Close"
          className={cn("ml-auto flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-4", focusRing)}>
          <X aria-hidden="true" />
        </Link>
      </header>

      {approveForm ? (
        <ApproveForm form={approveForm} authorName={post.author.name} mockupCount={view.mockups.length}
          onCancel={() => setApproveForm(null)}
          onApproved={(id) => { setApproveForm(null); setRequestId(id); router.refresh(); }} />
      ) : (
        <>
          {lock ? <p className="text-xs text-muted-foreground" suppressHydrationWarning>{lock}</p> : null}
          {request ? (
            <Link href={`/requests/${request.id}`}
              className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-compact font-medium text-foreground hover:bg-muted [&_svg]:size-4", focusRing)}>
              <span className="flex-1">{request.status ? `View request · ${REQUEST_STATUS_LABEL[request.status]}` : "View request"}</span>
              <ExternalLink aria-hidden="true" />
            </Link>
          ) : null}
          {message ? <Alert tone="danger">{message}</Alert> : null}
          {can.edit
            ? <PostPanelEditor view={view} />
            : <PostPanelReview view={view} onApprove={startApprove} approving={loadingApprove} />}
          <CommentsSection postId={post.id} comments={view.comments} canComment={can.comment} />
          {can.delete ? <DeletePost postId={post.id} closeHref={closeHref} /> : null}
        </>
      )}
    </aside>
  );
}
