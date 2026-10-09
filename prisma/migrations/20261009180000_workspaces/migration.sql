-- Workspaces: every data row belongs to exactly one workspace. Existing rows are backfilled into Clogent.

-- 1. CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- 2. The Clogent workspace (fixed id)
INSERT INTO "Workspace" ("id", "name", "slug") VALUES ('clogent', 'Clogent', 'clogent');

-- 3. Add workspaceId, backfilling existing rows into Clogent, then drop the temporary default
ALTER TABLE "User" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "User" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "AllowedEmail" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "AllowedEmail" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "Brand" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "Brand" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "Division" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "Division" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "RequestType" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "RequestType" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "Request" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "Request" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "StatusEvent" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "StatusEvent" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "DeadlineEvent" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "DeadlineEvent" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "Comment" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "Comment" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "Attachment" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "Attachment" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "KpiTarget" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "KpiTarget" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "Notification" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "Notification" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "Project" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "Project" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "ProjectTask" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "ProjectTask" ALTER COLUMN "workspaceId" DROP DEFAULT;
ALTER TABLE "ProjectMilestone" ADD COLUMN "workspaceId" TEXT NOT NULL DEFAULT 'clogent';
ALTER TABLE "ProjectMilestone" ALTER COLUMN "workspaceId" DROP DEFAULT;

-- 4. Swap global uniques for per-workspace ones
DROP INDEX "AllowedEmail_email_key";
DROP INDEX "Brand_name_key";
DROP INDEX "Division_name_key";
DROP INDEX "Project_code_key";
DROP INDEX "RequestType_name_key";

CREATE UNIQUE INDEX "AllowedEmail_workspaceId_email_key" ON "AllowedEmail"("workspaceId", "email");
CREATE UNIQUE INDEX "Brand_workspaceId_name_key" ON "Brand"("workspaceId", "name");
CREATE UNIQUE INDEX "Division_workspaceId_name_key" ON "Division"("workspaceId", "name");
CREATE UNIQUE INDEX "Project_workspaceId_code_key" ON "Project"("workspaceId", "code");
CREATE UNIQUE INDEX "RequestType_workspaceId_name_key" ON "RequestType"("workspaceId", "name");

-- 5. Foreign keys and indexes
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AllowedEmail" ADD CONSTRAINT "AllowedEmail_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Division" ADD CONSTRAINT "Division_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RequestType" ADD CONSTRAINT "RequestType_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeadlineEvent" ADD CONSTRAINT "DeadlineEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "KpiTarget" ADD CONSTRAINT "KpiTarget_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "User_workspaceId_idx" ON "User"("workspaceId");
CREATE INDEX "AllowedEmail_workspaceId_idx" ON "AllowedEmail"("workspaceId");
CREATE INDEX "Brand_workspaceId_idx" ON "Brand"("workspaceId");
CREATE INDEX "Division_workspaceId_idx" ON "Division"("workspaceId");
CREATE INDEX "RequestType_workspaceId_idx" ON "RequestType"("workspaceId");
CREATE INDEX "Request_workspaceId_idx" ON "Request"("workspaceId");
CREATE INDEX "StatusEvent_workspaceId_idx" ON "StatusEvent"("workspaceId");
CREATE INDEX "DeadlineEvent_workspaceId_idx" ON "DeadlineEvent"("workspaceId");
CREATE INDEX "Comment_workspaceId_idx" ON "Comment"("workspaceId");
CREATE INDEX "Attachment_workspaceId_idx" ON "Attachment"("workspaceId");
CREATE INDEX "KpiTarget_workspaceId_idx" ON "KpiTarget"("workspaceId");
CREATE INDEX "Notification_workspaceId_idx" ON "Notification"("workspaceId");
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");
CREATE INDEX "ProjectTask_workspaceId_idx" ON "ProjectTask"("workspaceId");
CREATE INDEX "ProjectMilestone_workspaceId_idx" ON "ProjectMilestone"("workspaceId");

-- 6. Forced password change flag
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
