import type { RequestStatus } from "@prisma/client";

const EDGES: Partial<Record<RequestStatus, readonly RequestStatus[]>> = {
  REQUESTED: ["ON_PROGRESS", "CANCELLED"],
  ON_PROGRESS: ["REQUESTED", "FIRST_LOOK", "CANCELLED"],
  FIRST_LOOK: ["DONE", "ON_PROGRESS", "CANCELLED"],
  DONE: ["ON_PROGRESS", "CANCELLED"],
  CANCELLED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return EDGES[from]?.includes(to) ?? false;
}
