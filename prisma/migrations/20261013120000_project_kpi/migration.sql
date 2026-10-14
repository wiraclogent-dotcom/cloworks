-- CreateEnum
CREATE TYPE "ProjectTaskEventKind" AS ENUM ('STAGE', 'STATUS', 'DUE');

-- CreateTable
CREATE TABLE "ProjectTaskEvent" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "ProjectTaskEventKind" NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT,
    "actorId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "ProjectTaskEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectKpiTarget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "ProjectKpiTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTaskEvent_taskId_at_idx" ON "ProjectTaskEvent"("taskId", "at");

-- CreateIndex
CREATE INDEX "ProjectTaskEvent_workspaceId_idx" ON "ProjectTaskEvent"("workspaceId");

-- CreateIndex
CREATE INDEX "ProjectKpiTarget_workspaceId_year_idx" ON "ProjectKpiTarget"("workspaceId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectKpiTarget_userId_year_projectId_itemTitle_key" ON "ProjectKpiTarget"("userId", "year", "projectId", "itemTitle");

-- AddForeignKey
ALTER TABLE "ProjectTaskEvent" ADD CONSTRAINT "ProjectTaskEvent_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskEvent" ADD CONSTRAINT "ProjectTaskEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskEvent" ADD CONSTRAINT "ProjectTaskEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKpiTarget" ADD CONSTRAINT "ProjectKpiTarget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKpiTarget" ADD CONSTRAINT "ProjectKpiTarget_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKpiTarget" ADD CONSTRAINT "ProjectKpiTarget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectKpiTarget" ADD CONSTRAINT "ProjectKpiTarget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

