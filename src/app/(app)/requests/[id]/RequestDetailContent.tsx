import { notFound } from "next/navigation";
import { after } from "next/server";
import { markChatReadWith } from "@/lib/chat";
import { requireScope } from "@/lib/session";
import { can } from "@/lib/permissions";
import { daysLeft } from "@/lib/daysLeft";
import { parseFieldSchema } from "@/lib/fieldSchema";
import { assigneeOptions, listCreativeTeam } from "@/lib/team";
import { RequestDetailView } from "./RequestDetailView";

/** Loads one request and renders its detail view; shared by the full page (`fullPage`) and the intercepted side panel. */
export async function DetailContent({ params, fullPage = false }: { params: PageProps<"/requests/[id]">["params"]; fullPage?: boolean }) {
  const { user, db } = await requireScope();
  const { id } = await params;
  const req = await db.request.findUnique({
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
  // Viewing a request counts as reading its chat. Runs after the response; a failure must never affect the page.
  after(() => markChatReadWith(db, user.id, id).catch(() => {}));

  const canAssign = can(user.appRole, "request.assign");
  const assignees = canAssign
    ? assigneeOptions(await listCreativeTeam(db), req.assigneeId && req.assignee ? { id: req.assigneeId, ...req.assignee } : null)
    : [];
  const canMove = can(user.appRole, "request.transition");
  const left = daysLeft(req.deadline);
  const schema = parseFieldSchema(req.type.fieldSchema);
  const fields = (req.fields ?? {}) as Record<string, unknown>;
  const shown = schema.filter((f) => fields[f.key] !== undefined && fields[f.key] !== "");

  return (
    <RequestDetailView req={req} daysLeft={left} userId={user.id} canAssign={canAssign} canMove={canMove} assignees={assignees} fullPage={fullPage}
      extra={shown.map((f) => ({ key: f.key, label: f.label, value: fields[f.key], url: f.type === "url" }))} />
  );
}
