import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/permissions";
import { daysLeft } from "@/lib/daysLeft";
import { isHttpUrl, parseFieldSchema } from "@/lib/fieldSchema";
import { splitMentions } from "@/lib/collab";
import { STATUS_LABEL, StatusBadge, deadlineText } from "@/components/status";
import { AssigneePicker, AttachmentForm, CommentForm, MoveControl, RemoveAttachmentButton } from "./DetailForms";

const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const stamp = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  if (!isHttpUrl(href)) return <span className="break-all">{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="break-all underline focus-visible:outline-2 focus-visible:outline-ring">{children}<span className="sr-only"> (opens in a new tab)</span></a>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

async function DetailContent({ params }: { params: PageProps<"/requests/[id]">["params"] }) {
  const user = await requireUser();
  const { id } = await params;
  const req = await prisma.request.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } }, division: { select: { name: true } },
      type: { select: { name: true, fieldSchema: true } },
      requester: { select: { name: true } }, assignee: { select: { name: true } },
      statusEvents: { orderBy: { at: "asc" }, include: { actor: { select: { name: true } } } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
      attachments: { orderBy: { createdAt: "asc" }, include: { uploader: { select: { name: true } } } },
    },
  });
  if (!req) notFound();

  const canAssign = can(user.appRole, "request.assign");
  const assignees = canAssign
    ? await prisma.user.findMany({ where: { active: true, appRole: { in: ["CREATIVE", "LEAD", "ADMIN"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];
  // Keep a current assignee who has since gone inactive visible so the picker does not silently show "Unassigned".
  if (canAssign && req.assigneeId && req.assignee && !assignees.some((a) => a.id === req.assigneeId)) assignees.unshift({ id: req.assigneeId, name: `${req.assignee.name} (inactive)` });
  const canMove = can(user.appRole, "request.transition");
  const open = req.status !== "DONE" && req.status !== "CANCELLED";
  const left = daysLeft(req.deadline);
  const schema = parseFieldSchema(req.type.fieldSchema);
  const fields = (req.fields ?? {}) as Record<string, unknown>;
  const shown = schema.filter((f) => fields[f.key] !== undefined && fields[f.key] !== "");

  return (
    <article className="space-y-8">
      <header className="space-y-2">
        <p><Link href="/requests" className="text-sm underline focus-visible:outline-2 focus-visible:outline-ring">← Back to requests</Link></p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold break-words">{req.title}</h1>
          <StatusBadge status={req.status} />
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <section aria-labelledby="details-h">
            <h2 id="details-h" className="mb-2 text-lg font-semibold">Details</h2>
            <dl className="divide-y divide-border rounded-md border border-border px-3">
              <Row label="Brand">{req.brand.name}</Row>
              <Row label="Division">{req.division.name}</Row>
              <Row label="Type">{req.type.name}</Row>
              <Row label="Requester">{req.requester.name}</Row>
              <Row label="Assignee">{req.assignee?.name ?? <span className="text-muted-foreground">Unassigned</span>}</Row>
              <Row label="Requested">{day.format(req.requestedAt)}</Row>
              <Row label="Deadline">
                {req.deadline ? <>{day.format(req.deadline)}{open && left !== null && <> · {left < 0 && <span aria-hidden="true">⚠ </span>}{deadlineText(left)}</>}</> : "No deadline"}
              </Row>
              {req.briefUrl && <Row label="Brief"><ExtLink href={req.briefUrl}>{req.briefUrl}</ExtLink></Row>}
              {shown.map((f) => {
                const v = fields[f.key];
                return (
                  <Row key={f.key} label={f.label}>
                    {typeof v === "boolean" ? (v ? "Yes" : "No") : f.type === "url" && typeof v === "string" ? <ExtLink href={v}>{v}</ExtLink> : <span className="whitespace-pre-wrap">{String(v)}</span>}
                  </Row>
                );
              })}
              {req.designFolderUrl && <Row label="Design folder"><ExtLink href={req.designFolderUrl}>{req.designFolderUrl}</ExtLink></Row>}
              {req.status === "DONE" && <Row label="Outputs">{req.outputCount}</Row>}
            </dl>
            {req.notes && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-muted-foreground">Notes</h3>
                <p className="whitespace-pre-wrap break-words text-sm">{req.notes}</p>
              </div>
            )}
          </section>

          <section aria-labelledby="comments-h" className="space-y-4">
            <h2 id="comments-h" className="text-lg font-semibold">Comments</h2>
            {req.comments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No comments yet.</p>
            ) : (
              <ol className="space-y-3">
                {req.comments.map((c) => (
                  <li key={c.id} className="rounded-md border border-border bg-card p-3 text-card-foreground">
                    <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{c.author.name}</span> · <time dateTime={c.createdAt.toISOString()}>{stamp.format(c.createdAt)} WIB</time></p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                      {splitMentions(c.body).map((s, i) => s.mention ? <strong key={i} className="rounded bg-muted px-0.5 underline decoration-dotted">{s.text}</strong> : <span key={i}>{s.text}</span>)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
            <CommentForm requestId={req.id} />
          </section>

          <section aria-labelledby="files-h" className="space-y-4">
            <h2 id="files-h" className="text-lg font-semibold">Links</h2>
            {req.attachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No links yet.</p>
            ) : (
              <ul className="space-y-2">
                {req.attachments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <ExtLink href={a.url}>{a.name}</ExtLink>
                    <span className="text-xs text-muted-foreground">added by {a.uploader.name}, {day.format(a.createdAt)}</span>
                    {(a.uploaderId === user.id || canAssign) && <RemoveAttachmentButton attachmentId={a.id} name={a.name} />}
                  </li>
                ))}
              </ul>
            )}
            <AttachmentForm requestId={req.id} />
          </section>
        </div>

        <aside className="space-y-6" aria-label="Actions and history">
          {(canAssign || canMove) && (
            <section aria-labelledby="actions-h" className="space-y-4">
              <h2 id="actions-h" className="text-lg font-semibold">Manage</h2>
              {canAssign && req.status !== "CANCELLED" && <AssigneePicker key={req.assigneeId ?? "none"} requestId={req.id} current={req.assigneeId} options={assignees} />}
              {canMove && <MoveControl key={req.status} requestId={req.id} title={req.title} status={req.status} />}
            </section>
          )}
          <section aria-labelledby="history-h">
            <h2 id="history-h" className="mb-2 text-lg font-semibold">Status history</h2>
            {req.statusEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No status changes yet.</p>
            ) : (
              <ol className="space-y-2 border-l border-border pl-4">
                {req.statusEvents.map((e) => (
                  <li key={e.id} className="text-sm">
                    <p>{e.from ? <>{statusText(e.from)} → <strong>{statusText(e.to)}</strong></> : <>Created as <strong>{statusText(e.to)}</strong></>}</p>
                    <p className="text-xs text-muted-foreground">{e.actor.name} · <time dateTime={e.at.toISOString()}>{stamp.format(e.at)} WIB</time></p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </article>
  );
}

const statusText = (s: keyof typeof STATUS_LABEL) => STATUS_LABEL[s];

export default function RequestDetailPage({ params }: PageProps<"/requests/[id]">) {
  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <Suspense fallback={<p className="text-muted-foreground">Loading request…</p>}>
        <DetailContent params={params} />
      </Suspense>
    </main>
  );
}
