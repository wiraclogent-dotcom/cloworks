import type { CSSProperties } from "react";
import Link from "next/link";
import type { RequestStatus } from "@prisma/client";
import { ChevronLeft, CircleSlash, ExternalLink, FileText, FolderOpen, Link2, Target } from "lucide-react";
import { isOpenStatus, shortLabel } from "@/lib/reschedule";
import { VIDEO_TYPE_NAME, jakartaDate } from "@/lib/createRequest";
import { isHttpUrl } from "@/lib/fieldSchema";
import { FileLocationLink } from "@/components/ui/FileLocationLink";
import { splitMentions } from "@/lib/mentions";
import { REQUEST_STATUS_TONE } from "@/lib/palette";
import { STATUS_LABEL } from "@/components/status";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardHeader, CardTitle } from "@/components/shadcn/card";
import { Badge } from "@/components/shadcn/badge";
import { BrandTag } from "@/components/ui/BrandTag";
import { StatusChip } from "@/components/ui/StatusChip";
import { BrandArt } from "@/components/ui/BrandArt";
import { NeedsMotionChip } from "@/components/ui/NeedsMotionChip";
import { DeadlineChip } from "@/components/ui/DeadlineChip";
import { Avatar, AvatarStack, UnassignedAvatar } from "@/components/ui/Avatar";
import { cn, focusRing } from "@/components/ui/cn";
import { AssigneesPicker, AttachmentForm, CommentForm, DeadlineControl, IncludeKpiToggle, MoveControl, NeedsMotionToggle, RemoveAttachmentButton } from "./DetailForms";
import { Button } from "@/components/shadcn/button";

const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
const stamp = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jakarta" });

/** What the page loads for one request (a structural subset of the Prisma result). */
export type RequestDetail = {
  id: string; title: string; status: RequestStatus; needsMotion: boolean; includeKpi: boolean;
  briefUrl: string | null; notes: string | null; designFolderUrl: string | null; outputCount: number;
  requestedAt: Date; deadline: Date | null;
  brand: { name: string }; division: { name: string }; type: { name: string };
  requester: { name: string }; assignees: { user: { id: string; name: string; active: boolean } }[];
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
      <dt className="text-compact text-muted-foreground">{label}</dt>
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
export function RequestDetailView({ req, extra, daysLeft, userId, canAssign, canPickAssignee = canAssign, canMove, assignees, fullPage = false }: {
  req: RequestDetail; extra: ExtraField[]; daysLeft: number | null; userId: string;
  /** Lead/admin powers (KPI, motion flag, removing anyone's link). `canPickAssignee` also covers the request's requester. */
  canAssign: boolean; canPickAssignee?: boolean; canMove: boolean; assignees: { id: string; name: string }[];
  /** Full page: the Work › Requests › code top bar (where the profile menu sits). The side panel keeps a back link. */
  fullPage?: boolean;
}) {
  const people = req.assignees.map((a) => a.user);
  const open = req.status !== "DONE" && req.status !== "CANCELLED";
  const activity = [
    ...req.statusEvents.map((e) => ({ kind: "status" as const, at: e.at, e })),
    ...req.deadlineEvents.map((e) => ({ kind: "deadline" as const, at: e.at, e })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
  return (
    <article className="@container">
      {fullPage ? null : (
        <nav aria-label="Breadcrumb" className="mb-2">
          <Link href="/requests" className={cn("inline-flex items-center gap-1 rounded-md text-compact font-medium text-muted-foreground hover:text-foreground", focusRing)}>
            <ChevronLeft aria-hidden="true" strokeWidth={1.75} className="size-4" />Requests
          </Link>
        </nav>
      )}
      <PageHeader title={<span className="break-words">{req.title}</span>} className="mb-2"
        breadcrumb={fullPage ? [{ label: "Work" }, { label: "Requests", href: "/requests" }, { label: `REQ-${req.id.slice(-4).toUpperCase()}` }] : undefined} />
      <div className="mb-5 flex flex-wrap items-center gap-2" data-detail-chips="">
        {req.status === "DONE" ? <BrandArt name="celebrate" width={36} className="animate-pop size-9 object-contain" /> : null}
        <StatusChip status={req.status} kind="request" />
        {people.length > 0 && <AvatarStack names={people.map((p) => p.name)} size="sm" label="Assignees" />}
        {(req.needsMotion || req.type.name === VIDEO_TYPE_NAME) && <NeedsMotionChip video={req.type.name === VIDEO_TYPE_NAME} />}
        {req.includeKpi
          ? <Badge tone="done"><Target aria-hidden="true" strokeWidth={1.75} />Counts toward KPI</Badge>
          : <Badge tone="tag-neutral"><CircleSlash aria-hidden="true" strokeWidth={1.75} />Not counted toward KPI</Badge>}
      </div>

      <div className="grid items-start gap-5 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5">
          <Card className="animate-rise" style={{ "--i": 0 } as CSSProperties}>
            <section aria-labelledby="brief-h">
              <CardTitle id="brief-h">Brief</CardTitle>
              <div className="mt-3 space-y-4">
                {req.briefUrl ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <Button asChild variant="outline" size="sm"><ExtLink href={req.briefUrl}><FileText aria-hidden="true" strokeWidth={1.75} />Open brief<ExternalLink aria-hidden="true" strokeWidth={1.75} /></ExtLink></Button>
                    <span className="min-w-0 truncate text-xs text-muted-foreground" title={req.briefUrl}>{req.briefUrl}</span>
                  </div>
                ) : null}
                {req.notes ? (
                  <div>
                    <h3 className="mb-1 text-compact font-medium text-muted-foreground">Notes</h3>
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
                {!req.briefUrl && !req.notes && extra.length === 0 && <p className="text-sm text-muted-foreground">No brief link or notes were added.</p>}
              </div>
            </section>
          </Card>

          <Card className="animate-rise" style={{ "--i": 1 } as CSSProperties}>
            <section aria-labelledby="files-h">
              <CardHeader className="mb-2"><CardTitle id="files-h">Attachments</CardTitle></CardHeader>
              {req.attachments.length === 0 ? (
                <p className="mb-4 text-sm text-muted-foreground">No links yet.</p>
              ) : (
                <ul className="mb-4 divide-y divide-border">
                  {req.attachments.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Link2 strokeWidth={1.75} className="size-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium"><FileLocationLink href={a.url} name={a.name} className={LINK}>{a.name}</FileLocationLink></span>
                        <span className="block text-xs text-muted-foreground">added by {a.uploader.name}, {day.format(a.createdAt)}</span>
                      </span>
                      {(a.uploaderId === userId || canAssign) && <RemoveAttachmentButton requestId={req.id} attachmentId={a.id} name={a.name} />}
                    </li>
                  ))}
                </ul>
              )}
              <AttachmentForm requestId={req.id} />
            </section>
          </Card>

          <Card className="animate-rise" style={{ "--i": 2 } as CSSProperties}>
            <section aria-labelledby="comments-h">
              <CardHeader className="mb-2"><CardTitle id="comments-h" className="flex items-center gap-2">Comments <Badge variant="count">{req.comments.length}</Badge></CardTitle></CardHeader>
              {req.comments.length === 0 ? (
                <p className="mb-4 text-sm text-muted-foreground">No comments yet.</p>
              ) : (
                <ol className="mb-4 space-y-4">
                  {req.comments.map((c) => (
                    <li key={c.id} className="animate-rise flex gap-3">
                      <Avatar name={c.author.name} decorative className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground"><span className="text-sm font-medium text-foreground">{c.author.name}</span> · <time dateTime={c.createdAt.toISOString()} className="tabular-nums">{stamp.format(c.createdAt)} WIB</time></p>
                        <p className="mt-1 rounded-lg bg-muted px-3 py-2 text-sm break-words whitespace-pre-wrap text-foreground">
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

          <Card className="animate-rise" style={{ "--i": 3 } as CSSProperties}>
            <section aria-labelledby="history-h">
              <CardTitle id="history-h">Activity</CardTitle>
              {activity.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                <ol className="relative mt-3 space-y-4 before:absolute before:top-1.5 before:bottom-1.5 before:left-[5px] before:w-px before:bg-border" data-timeline="">
                  {activity.map((a) => (
                    <li key={`${a.kind}-${a.e.id}`} className="relative pl-6 text-sm">
                      {a.kind === "status" ? (
                        <>
                          <span aria-hidden="true" data-tone={REQUEST_STATUS_TONE[a.e.to]} className="absolute top-1.5 left-0 size-[11px] rounded-full bg-tone-accent ring-[3px] ring-card" />
                          <p className="text-foreground">{a.e.from ? <>{STATUS_LABEL[a.e.from]} → <strong className="font-semibold">{STATUS_LABEL[a.e.to]}</strong></> : <>Created as <strong className="font-semibold">{STATUS_LABEL[a.e.to]}</strong></>}</p>
                        </>
                      ) : (
                        <>
                          <span aria-hidden="true" data-tone="due-soon" className="absolute top-1.5 left-0 size-[11px] rounded-full bg-tone-accent ring-[3px] ring-card" />
                          <p className="text-foreground">{a.e.from ? <>Deadline moved from {shortLabel(a.e.from)} to <strong className="font-semibold">{shortLabel(a.e.to)}</strong></> : <>Deadline set to <strong className="font-semibold">{shortLabel(a.e.to)}</strong></>}</p>
                        </>
                      )}
                      <p className="text-xs text-muted-foreground">{a.e.actor.name} · <time dateTime={a.e.at.toISOString()} className="tabular-nums">{stamp.format(a.e.at)} WIB</time></p>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </Card>
        </div>

        <aside className="min-w-0 space-y-5 @3xl:sticky @3xl:top-6 in-[dialog]:@3xl:top-16" aria-label="Details and actions">
          <Card className="animate-rise" style={{ "--i": 4 } as CSSProperties}>
            <section aria-labelledby="details-h">
              <CardTitle id="details-h">Details</CardTitle>
              <dl className="mt-2 divide-y divide-border">
                <Row label="Requester"><Person name={req.requester.name} /></Row>
                <Row label={people.length > 1 ? "Assignees" : "Assignee"}>
                  {people.length > 0 ? <span className="flex flex-col gap-1.5">{people.map((p) => <Person key={p.id} name={p.name} />)}</span> : <span className="flex items-center gap-2 text-muted-foreground"><UnassignedAvatar size="sm" decorative />Unassigned</span>}
                </Row>
                <Row label="Brand"><BrandTag name={req.brand.name} /></Row>
                <Row label="Division">{req.division.name}</Row>
                <Row label="Type">{req.type.name}</Row>
                <Row label="Requested"><span className="tabular-nums">{day.format(req.requestedAt)}</span></Row>
                <Row label="Deadline">
                  {req.deadline
                    ? <span className="flex flex-wrap items-center gap-2"><span className="tabular-nums">{day.format(req.deadline)}</span>{open && daysLeft !== null && <DeadlineChip daysLeft={daysLeft} />}</span>
                    : <span className="text-muted-foreground">No deadline</span>}
                </Row>
                {req.status === "DONE" && <Row label="Outputs"><span className="tabular-nums">{req.outputCount}</span></Row>}
                {req.designFolderUrl && (
                  <Row label="Design folder">
                    <FileLocationLink href={req.designFolderUrl} className={cn("inline-flex items-center gap-1.5 font-medium", LINK)}><FolderOpen aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0" />Open folder</FileLocationLink>
                  </Row>
                )}
              </dl>
            </section>
          </Card>

          {(canPickAssignee || canMove) && (
            <Card className="animate-rise" style={{ "--i": 5 } as CSSProperties}>
              <section aria-labelledby="actions-h" className="space-y-4">
                <CardTitle id="actions-h">Manage</CardTitle>
                {canPickAssignee && req.status !== "CANCELLED" && <AssigneesPicker requestId={req.id} current={people.map((p) => ({ id: p.id, name: p.name }))} options={assignees} />}
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
