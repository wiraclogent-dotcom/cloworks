import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUserOrRedirect } from "@/lib/session";
import { can } from "@/lib/permissions";
import { daysLeft } from "@/lib/daysLeft";
import { parseFieldSchema } from "@/lib/fieldSchema";
import { DetailSkeleton } from "@/components/RequestSkeletons";
import { RequestDetailView } from "./RequestDetailView";

/** Generic on purpose: the request title would need a DB read in generateMetadata, outside the page's Suspense/permission flow (cacheComponents). */
export const metadata: Metadata = { title: "Request" };

async function DetailContent({ params }: { params: PageProps<"/requests/[id]">["params"] }) {
  const user = await requireUserOrRedirect();
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
  const left = daysLeft(req.deadline);
  const schema = parseFieldSchema(req.type.fieldSchema);
  const fields = (req.fields ?? {}) as Record<string, unknown>;
  const shown = schema.filter((f) => fields[f.key] !== undefined && fields[f.key] !== "");

  return (
    <RequestDetailView req={req} daysLeft={left} userId={user.id} canAssign={canAssign} canMove={canMove} assignees={assignees}
      extra={shown.map((f) => ({ key: f.key, label: f.label, value: fields[f.key], url: f.type === "url" }))} />
  );
}

export default function RequestDetailPage({ params }: PageProps<"/requests/[id]">) {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <Suspense fallback={<DetailSkeleton />}>
        <DetailContent params={params} />
      </Suspense>
    </div>
  );
}
