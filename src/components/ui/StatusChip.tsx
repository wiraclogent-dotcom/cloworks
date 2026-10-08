import type { ProjectStatus, RequestStatus } from "@prisma/client";
import { PROJECT_STATUS_TONE, REQUEST_STATUS_TONE } from "@/lib/palette";
import { PROJECT_STATUS_LABEL, STATUS_LABEL } from "@/lib/statusLabels";
import { Chip } from "./Chip";
import { StatusIcon } from "./StatusIcon";

export function statusLabel(status: RequestStatus | ProjectStatus): string {
  return status in STATUS_LABEL ? STATUS_LABEL[status as RequestStatus] : PROJECT_STATUS_LABEL[status as ProjectStatus];
}

/** Request or project status as a chip: palette tint + shape icon + label. */
export function StatusChip({ status, className }: { status: RequestStatus | ProjectStatus; className?: string }) {
  const tone = status in REQUEST_STATUS_TONE ? REQUEST_STATUS_TONE[status as RequestStatus] : PROJECT_STATUS_TONE[status as ProjectStatus];
  return <Chip tone={tone} icon={<StatusIcon status={status} />} className={className}>{statusLabel(status)}</Chip>;
}
