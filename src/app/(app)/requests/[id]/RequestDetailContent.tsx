import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { daysLeft } from "@/lib/daysLeft";
import { parseFieldSchema } from "@/lib/fieldSchema";
import { assigneeOptions, listCreativeTeam } from "@/lib/team";
import { RequestDetailView } from "./RequestDetailView";

/** Loads one request and renders its detail view; shared by the full page and the intercepted side panel. */
export async function DetailContent({ params }: { params: PageProps<"/requests/[id]">["params"] }) {
  const user = await requireUserOrRedirect();
  const { id } = await params;
  const req = await prisma.request.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } }, division: { select: { name: true } },
      type: { select: { name: true, fieldSchema: true } },
      requester: { select: { name: true } }, assignee: { select: { name: true, active: true } },
      statusEvents: { orderBy: { at: "asc" }, include: { actor: { select: { name: true } } } },
      deadlineEvents: { orderBy: { at: "asc" }, include: { actor: { select: { name: true } } } },
      comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true } } } },
      attachments: { orderBy: { createdAt: "asc" }, include: { uploader: { select: { name: true } } } },
    },
  });
  if (!req) notFound();

  const canAssign = can(user.appRole, "request.assign");
  const assignees = canAssign
    ? assigneeOptions(await listCreativeTeam(prisma), req.assigneeId && req.assignee ? { id: req.assigneeId, ...req.assignee } : null)
    : [];
  const canMove = can(user.appRole, "request.transition");
  const left = daysLeft(req.deadline);
  const schema = parseFieldSchema(req.type.fieldSchema);
  const fields = (req.fields ?? {}) as Record<string, unknown>;
  const shown = schema.filter((f) => fields[f.key] !== undefined && fields[f.key] !== "");

  return (
    <RequestDetailView req={req} daysLeft={left} userId={user.id} canAssign={canAssign} canMove={canMove} assignees={assignees}
      extra={shown.map((f) => ({ key: f.key, label: f.label, value: fields[f.key], url: f.type === "url" }))} />
  );
}
