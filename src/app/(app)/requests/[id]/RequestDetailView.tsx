import Link from "next/link";
import type { RequestStatus } from "@prisma/client";
import { ChevronLeft, CircleSlash, ExternalLink, FileText, FolderOpen, Link2, Target } from "lucide-react";
import { isOpenStatus, shortLabel } from "@/lib/reschedule";
import { jakartaDate } from "@/lib/createRequest";
import { isHttpUrl } from "@/lib/fieldSchema";
import { splitMentions } from "@/lib/collab";
import { REQUEST_STATUS_TONE } from "@/lib/palette";
import { STATUS_LABEL } from "@/components/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { BrandTag, Chip, CountPill } from "@/components/ui/Chip";
import { StatusChip } from "@/components/ui/StatusChip";
import { NeedsMotionChip } from "@/components/ui/NeedsMotionChip";
import { DeadlineChip } from "@/components/ui/DeadlineChip";
import { Avatar, UnassignedAvatar } from "@/components/ui/Avatar";
import { buttonClass } from "@/components/ui/Button";
import { cn, focusRing } from "@/components/ui/cn";
import { AssigneePicker, AttachmentForm, CommentForm, DeadlineControl, IncludeKpiToggle, MoveControl, NeedsMotionToggle, RemoveAttachmentButton } from "./DetailForms";

const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const stamp = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });

/** What the page loads for one request (a structural subset of the Prisma result). */
export type RequestDetail = {
  id: string; title: string; status: RequestStatus; needsMotion: boolean; includeKpi: boolean;
  briefUrl: string | null; notes: string | null; designFolderUrl: string | null; outputCount: number;
  requestedAt: Date; deadline: Date | null; assigneeId: string | null;
  brand: { name: string }; division: { name: string }; type: { name: string };
  requester: { name: string }; assignee: { name: string } | null;
  statusEvents: { id: string; from: RequestStatus | null; to: RequestStatus; at: Date; actor: { name: string } }[];
  deadlineEvents: { id: string; from: Date | null; to: Date; at: Date; actor: { name: string } }[];
  comments: { id: string; body: string; createdAt: Date; author: { name: string } }[];
  attachments: { id: string; name: string; url: string; createdAt: Date; uploaderId: string; uploader: { name: string } }[];
};
/** Type-specific fields that have a value, already resolved from the type's schema. */
export type ExtraField = { key: string; label: string; value: unknown; url: boolean };

const LINK = cn("break-all text-link underline-offset-2 hover:underline", focusRing, "rounded-sm");

function ExtLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  if (!isHttpUrl(href)) return <span className="break-all">{children}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className={className ?? LINK}>{children}<span className="sr-only"> (opens in a new tab)</span></a>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-center gap-3 py-2 text-sm">
      <dt className="text-[13px] text-foreground-secondary">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  );
}

function Person({ name }: { name: string }) {
  return <span className="flex min-w-0 items-center gap-2"><Avatar name={name} size="sm" decorative /><span className="truncate">{name}</span></span>;
}

/**
 * Request detail page body (server-safe, no data access): header with chips, a wide column (Brief, Attachments,
 * Comments, Activity) and a sticky side column (Details, and Manage for people who may assign or move).
 */
export function RequestDetailView({ req, extra, daysLeft, userId, canAssign, canMove, assignees }: {
  req: RequestDetail; extra: ExtraField[]; daysLeft: number | null; userId: string;
  canAssign: boolean; canMove: boolean; assignees: { id: string; name: string }[];
}) {
  const open = req.status !== "DONE" && req.status !== "CANCELLED";
  const activity = [
    ...req.statusEvents.map((e) => ({ kind: "status" as const, at: e.at, e })),
    ...req.deadlineEvents.map((e) => ({ kind: "deadline" as const, at: e.at, e })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  return (
    <article className="@container">
      <nav aria-label="Breadcrumb" className="mb-2">
        <Link href="/requests" className={cn("inline-flex items-center gap-1 rounded-md text-[13px] font-medium text-foreground-secondary hover:text-foreground", focusRing)}>
          <ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-4" />Requests
        </Link>
      </nav>
      <PageHeader title={<span className="break-words">{req.title}</span>} className="mb-2" />
      <div className="mb-6 flex flex-wrap items-center gap-2" data-detail-chips="">
        <StatusChip status={req.status} />
        {req.needsMotion && <NeedsMotionChip />}
        {req.includeKpi
          ? <Chip tone="done" icon={<Target aria-hidden="true" strokeWidth={1.75} />}>Counts toward KPI</Chip>
          : <Chip tone="tag-neutral" icon={<CircleSlash aria-hidden="true" strokeWidth={1.75} />}>Not counted toward KPI</Chip>}
      </div>

      <div className="grid items-start gap-5 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <section aria-labelledby="brief-h">
              <CardTitle id="brief-h">Brief</CardTitle>
              <div className="mt-3 space-y-4">
                {req.briefUrl ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <ExtLink href={req.briefUrl} className={buttonClass({ variant: "secondary", size: "sm" })}><FileText aria-hidden="true" strokeWidth={1.75} />Open brief<ExternalLink aria-hidden="true" strokeWidth={1.75} /></ExtLink>
                    <span className="min-w-0 truncate text-xs text-foreground-secondary" title={req.briefUrl}>{req.briefUrl}</span>
                  </div>
                ) : null}
                {req.notes ? (
                  <div>
                    <h3 className="mb-1 text-[13px] font-medium text-foreground-secondary">Notes</h3>
                    <p className="text-sm break-words whitespace-pre-wrap text-foreground">{req.notes}</p>
                  </div>
                ) : null}
                {extra.length > 0 && (
                  <dl className="divide-y divide-border">
                    {extra.map((f) => (
                      <Row key={f.key} label={f.label}>
                        {typeof f.value === "boolean" ? (f.value ? "Yes" : "No") : f.url && typeof f.value === "string" ? <ExtLink href={f.value}>{f.value}</ExtLink> : <span className="whitespace-pre-wrap">{String(f.value)}</span>}
                      </Row>
                    ))}
                  </dl>
                )}
                {!req.briefUrl && !req.notes && extra.length === 0 && <p className="text-sm text-foreground-secondary">No brief link or notes were added.</p>}
              </div>
            </section>
          </Card>

          <Card>
            <section aria-labelledby="files-h">
              <CardHeader className="mb-2"><CardTitle id="files-h">Attachments</CardTitle></CardHeader>
              {req.attachments.length === 0 ? (
                <p className="mb-4 text-sm text-foreground-secondary">No links yet.</p>
              ) : (
                <ul className="mb-4 divide-y divide-border">
                  {req.attachments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-foreground-secondary"><Link2 strokeWidth={1.75} className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium"><ExtLink href={a.url}>{a.name}</ExtLink></span>
                        <span className="block text-xs text-foreground-secondary">added by {a.uploader.name}, {day.format(a.createdAt)}</span>
                      </span>
                      {(a.uploaderId === userId || canAssign) && <RemoveAttachmentButton requestId={req.id} attachmentId={a.id} name={a.name} />}
                    </li>
                  ))}
                </ul>
              )}
              <AttachmentForm requestId={req.id} />
            </section>
          </Card>

          <Card>
            <section aria-labelledby="comments-h">
              <CardHeader className="mb-2"><CardTitle id="comments-h" className="flex items-center gap-2">Comments <CountPill value={req.comments.length} /></CardTitle></CardHeader>
              {req.comments.length === 0 ? (
                <p className="mb-4 text-sm text-foreground-secondary">No comments yet.</p>
              ) : (
                <ol className="mb-4 space-y-4">
                  {req.comments.map((c) => (
                    <li key={c.id} className="flex gap-3">
                      <Avatar name={c.author.name} decorative className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-foreground-secondary"><span className="text-sm font-medium text-foreground">{c.author.name}</span> · <time dateTime={c.createdAt.toISOString()} className="tabular-nums">{stamp.format(c.createdAt)} WIB</time></p>
                        <p className="mt-1 rounded-lg bg-surface-muted px-3 py-2 text-sm break-words whitespace-pre-wrap text-foreground">
                          {splitMentions(c.body).map((s, i) => s.mention ? <strong key={i} className="rounded bg-accent px-0.5 font-semibold text-accent-foreground underline decoration-dotted">{s.text}</strong> : <span key={i}>{s.text}</span>)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
              <CommentForm requestId={req.id} />
            </section>
          </Card>

          <Card>
            <section aria-labelledby="history-h">
              <CardTitle id="history-h">Activity</CardTitle>
              {activity.length === 0 ? (
                <p className="mt-3 text-sm text-foreground-secondary">No activity yet.</p>
              ) : (
                <ol className="relative mt-3 space-y-4 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border" data-timeline="">
                  {activity.map((a) => (
                    <li key={`${a.kind}-${a.e.id}`} className="relative pl-6 text-sm">
                      {a.kind === "status" ? (
                        <>
                          <span aria-hidden="true" data-tone={REQUEST_STATUS_TONE[a.e.to]} className="absolute top-1.5 left-0 size-[11px] rounded-full bg-tone-accent ring-[3px] ring-surface" />
                          <p className="text-foreground">{a.e.from ? <>{STATUS_LABEL[a.e.from]} → <strong className="font-semibold">{STATUS_LABEL[a.e.to]}</strong></> : <>Created as <strong className="font-semibold">{STATUS_LABEL[a.e.to]}</strong></>}</p>
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true" data-tone="due-soon" className="absolute top-1.5 left-0 size-[11px] rounded-full bg-tone-accent ring-[3px] ring-surface" />
                          <p className="text-foreground">{a.e.from ? <>Deadline moved from {shortLabel(a.e.from)} to <strong className="font-semibold">{shortLabel(a.e.to)}</strong></> : <>Deadline set to <strong className="font-semibold">{shortLabel(a.e.to)}</strong></>}</p>
                        </>
                      )}
                      <p className="text-xs text-foreground-secondary">{a.e.actor.name} · <time dateTime={a.e.at.toISOString()} className="tabular-nums">{stamp.format(a.e.at)} WIB</time></p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5 @3xl:sticky @3xl:top-6 in-[dialog]:@3xl:top-16" aria-label="Details and actions">
          <Card>
            <section aria-labelledby="details-h">
              <CardTitle id="details-h">Details</CardTitle>
              <dl className="mt-2 divide-y divide-border">
                <Row label="Requester"><Person name={req.requester.name} /></Row>
                <Row label="Assignee">
                  {req.assignee ? <Person name={req.assignee.name} /> : <span className="flex items-center gap-2 text-foreground-secondary"><UnassignedAvatar size="sm" decorative />Unassigned</span>}
                </Row>
                <Row label="Brand"><BrandTag name={req.brand.name} /></Row>
                <Row label="Division">{req.division.name}</Row>
                <Row label="Type">{req.type.name}</Row>
                <Row label="Requested"><span className="tabular-nums">{day.format(req.requestedAt)}</span></Row>
                <Row label="Deadline">
                  {req.deadline
                    ? <span className="flex flex-wrap items-center gap-2"><span className="tabular-nums">{day.format(req.deadline)}</span>{open && daysLeft !== null && <DeadlineChip daysLeft={daysLeft} />}</span>
                    : <span className="text-foreground-secondary">No deadline</span>}
                </Row>
                {req.status === "DONE" && <Row label="Outputs"><span className="tabular-nums">{req.outputCount}</span></Row>}
                {req.designFolderUrl && (
                  <Row label="Design folder">
                    <ExtLink href={req.designFolderUrl} className={cn("inline-flex items-center gap-1.5 font-medium", LINK)}><FolderOpen aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" />Open folder</ExtLink>
                  </Row>
                )}
              </dl>
            </section>
          </Card>

          {(canAssign || canMove) && (
            <Card>
              <section aria-labelledby="actions-h" className="space-y-4">
                <CardTitle id="actions-h">Manage</CardTitle>
                {canAssign && req.status !== "CANCELLED" && <AssigneePicker key={req.assigneeId ?? "none"} requestId={req.id} current={req.assigneeId} options={assignees} />}
                {canMove && <MoveControl key={req.status} requestId={req.id} title={req.title} status={req.status} />}
                {canMove && isOpenStatus(req.status) && (
                  <DeadlineControl key={req.deadline?.toISOString() ?? "none"} requestId={req.id} current={req.deadline ? jakartaDate(req.deadline) : null} minDay={jakartaDate(req.requestedAt)} />
                )}
                {canAssign && (
                  <div className="space-y-3 border-t border-border pt-4">
                    <IncludeKpiToggle key={String(req.includeKpi)} requestId={req.id} initial={req.includeKpi} />
                    <NeedsMotionToggle key={`m${req.needsMotion}`} requestId={req.id} initial={req.needsMotion} canEdit={canAssign} />
                  </div>
                )}
              </section>
            </Card>
          )}
        </aside>
      </div>
    </article>
  );
}
