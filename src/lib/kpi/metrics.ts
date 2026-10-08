import { JobRole, RequestStatus } from "@prisma/client";
import { workingDaysBetween } from "./workingDays";

export type KpiRequest = {
  id: string;
  requesterId: string;
  assigneeId: string | null;
  requestedAt: Date;
  deadline: Date | null;
  status: RequestStatus;
  includeKpi: boolean;
  outputCount: number;
  events: { from: RequestStatus | null; to: RequestStatus; at: Date }[];
};

export type KpiResult = {
  tasksDone: number;
  target: number | null;
  progress: number | null;
  onTimeRate: number | null;
  avgTurnaroundDays: number | null;
  revisionRounds: number;
  totalOutputs: number;
  activeWorkload: number;
};

// Timezone rule: the month of `requestedAt` is computed in UTC.
function monthOf(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function latestDoneAt(r: KpiRequest): Date | null {
  let latest: Date | null = null;
  for (const e of r.events) {
    if (e.to === RequestStatus.DONE && (!latest || e.at > latest)) latest = e.at;
  }
  return latest;
}

export function computeKpi(
  requests: KpiRequest[],
  user: { id: string; jobRole: JobRole },
  month: string,
  target: { role: JobRole; targetTasks: number } | null,
): KpiResult {
  const basisRole = target ? target.role : user.jobRole;

  // DESIGNER -> user is the assignee; SOCIAL_MEDIA -> user is the requester;
  // OTHER -> nothing counts (no KPI basis). Unassigned never matches a designer.
  const isUsers = (r: KpiRequest): boolean =>
    basisRole === JobRole.DESIGNER
      ? r.assigneeId === user.id
      : basisRole === JobRole.SOCIAL_MEDIA
        ? r.requesterId === user.id
        : false;

  // Counted = in the month (by requestedAt), KPI-included, not cancelled, belongs to user.
  const inMonth = requests.filter(
    (r) =>
      monthOf(r.requestedAt) === month &&
      r.includeKpi &&
      r.status !== RequestStatus.CANCELLED &&
      isUsers(r),
  );
  // Done = current status DONE (a reopened, still-open request is not done).
  const done = inMonth.filter((r) => r.status === RequestStatus.DONE);

  let withDeadline = 0;
  let onTime = 0;
  let turnaroundSum = 0;
  let turnaroundN = 0;
  let totalOutputs = 0;
  for (const r of done) {
    totalOutputs += r.outputCount;
    const at = latestDoneAt(r);
    if (!at) continue;
    turnaroundSum += workingDaysBetween(r.requestedAt, at);
    turnaroundN++;
    if (r.deadline) {
      withDeadline++;
      if (at <= r.deadline) onTime++;
    }
  }

  const revisionRounds = inMonth.reduce(
    (sum, r) =>
      sum +
      r.events.filter((e) => e.from === RequestStatus.FIRST_LOOK && e.to === RequestStatus.ON_PROGRESS).length,
    0,
  );

  // Active workload: open requests assigned to the user in ANY month; designers only.
  const activeWorkload =
    basisRole === JobRole.DESIGNER
      ? requests.filter(
          (r) =>
            r.assigneeId === user.id &&
            r.status !== RequestStatus.DONE &&
            r.status !== RequestStatus.CANCELLED,
        ).length
      : 0;

  return {
    tasksDone: done.length,
    target: target ? target.targetTasks : null,
    progress: target && target.targetTasks > 0 ? done.length / target.targetTasks : null,
    onTimeRate: withDeadline > 0 ? onTime / withDeadline : null,
    avgTurnaroundDays: turnaroundN > 0 ? turnaroundSum / turnaroundN : null,
    revisionRounds,
    totalOutputs,
    activeWorkload,
  };
}
