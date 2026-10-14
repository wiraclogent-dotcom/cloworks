import type { ProjectStatus, RequestStatus } from "@prisma/client";
import { PROJECT_STATUS_TONE, REQUEST_STATUS_TONE } from "@/lib/palette";
import { PROJECT_STATUS_LABEL, STATUS_LABEL } from "@/lib/statusLabels";
import { Badge } from "@/components/shadcn/badge";
import { StatusIcon } from "./StatusIcon";

/**
 * `kind` says which vocabulary the status is from. DONE and CANCELLED exist in both, with different spelling for the
 * second ("Cancelled" for a request, "Canceled" for a project), so project callers should always pass `kind="project"`.
 * Without it a shared value reads as a request status.
 */
export type StatusKind = "request" | "project";

function isRequestStatus(status: string, kind?: StatusKind): boolean {
  return kind ? kind === "request" : status in STATUS_LABEL;
}

export function statusLabel(status: RequestStatus | ProjectStatus, kind?: StatusKind): string {
  return isRequestStatus(status, kind) ? STATUS_LABEL[status as RequestStatus] : PROJECT_STATUS_LABEL[status as ProjectStatus];
}

/** Request or project status as a chip: palette tint + shape icon + label. */
export function StatusChip({ status, kind, className }: { status: RequestStatus | ProjectStatus; kind?: StatusKind; className?: string }) {
  const tone = isRequestStatus(status, kind) ? REQUEST_STATUS_TONE[status as RequestStatus] : PROJECT_STATUS_TONE[status as ProjectStatus];
  return <Badge tone={tone} className={className}><StatusIcon status={status} />{statusLabel(status, kind)}</Badge>;
}
