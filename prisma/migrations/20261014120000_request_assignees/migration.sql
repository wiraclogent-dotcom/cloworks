-- CreateTable
CREATE TABLE "RequestAssignee" (
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "RequestAssignee_pkey" PRIMARY KEY ("requestId","userId")
);

-- CreateIndex
CREATE INDEX "RequestAssignee_userId_idx" ON "RequestAssignee"("userId");

-- CreateIndex
CREATE INDEX "RequestAssignee_workspaceId_idx" ON "RequestAssignee"("workspaceId");

-- AddForeignKey
ALTER TABLE "RequestAssignee" ADD CONSTRAINT "RequestAssignee_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignee" ADD CONSTRAINT "RequestAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAssignee" ADD CONSTRAINT "RequestAssignee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: every request's single assignee becomes one row.
INSERT INTO "RequestAssignee" ("requestId", "userId", "addedAt", "workspaceId")
SELECT "id", "assigneeId", "requestedAt", "workspaceId" FROM "Request" WHERE "assigneeId" IS NOT NULL;
