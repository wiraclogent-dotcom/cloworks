"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProjectStatus } from "@prisma/client";
import { Pencil } from "lucide-react";
import { ProjectForm } from "@/app/(app)/projects/ProjectForm";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { FileLocationLink } from "@/components/ui/FileLocationLink";
import { StatusChip } from "@/components/ui/StatusChip";
import { jakartaDate } from "@/lib/createRequest";
import { formatJakartaDay } from "@/lib/projectTasks";

type Opt = { id: string; name: string };

export type ProjectDetails = {
  id: string; title: string; subTitle: string | null;
  brandName: string | null; brandId: string | null; ownerId: string; ownerName: string;
  status: ProjectStatus; startIso: string | null; dueIso: string | null; fileUrl: string | null;
};

const MISSING = <span className="text-foreground-muted">—</span>;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-foreground-secondary">{label}</dt>
      <dd className="mt-0.5 min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Project facts (brand, owner, status, dates, file). Managers can edit them in place; saving returns to the read view. */
export function ProjectDetailsCard({ project, brands, owners, canManage }: { project: ProjectDetails; brands: Opt[]; owners: Opt[]; canManage: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  if (editing && canManage) {
    return (
      <ProjectForm
        stay projectId={project.id} brands={brands} owners={owners}
        initial={{
          title: project.title, subTitle: project.subTitle ?? "", brandId: project.brandId ?? "", ownerId: project.ownerId, status: project.status,
          startDate: project.startIso ? jakartaDate(new Date(project.startIso)) : "", dueDate: project.dueIso ? jakartaDate(new Date(project.dueIso)) : "",
          fileUrl: project.fileUrl ?? "",
        }}
        onSaved={() => { setEditing(false); router.refresh(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  const day = (iso: string | null) => (iso ? formatJakartaDay(new Date(iso)) : MISSING);
  return (
    <Card>
      <CardHeader actions={canManage ? <Button size="sm" onClick={() => setEditing(true)}><Pencil aria-hidden="true" strokeWidth={1.75} />Edit</Button> : undefined}>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Row label="Brand">{project.brandName ?? MISSING}</Row>
        <Row label="Owner">{project.ownerName}</Row>
        <Row label="Status"><StatusChip status={project.status} kind="project" /></Row>
        <Row label="Start">{day(project.startIso)}</Row>
        <Row label="Due">{day(project.dueIso)}</Row>
        <Row label="File">
          {project.fileUrl
            ? <FileLocationLink href={project.fileUrl} className="break-all text-link hover:underline">{project.fileUrl}</FileLocationLink>
            : MISSING}
        </Row>
      </dl>
    </Card>
  );
}
