-- Safety net: copy any assignee that is not yet in the join table (a no-op when the earlier backfill and the
-- dual writes kept everything in step), then drop the legacy single-assignee column.
INSERT INTO "RequestAssignee" ("requestId", "userId", "addedAt", "workspaceId")
SELECT "id", "assigneeId", "requestedAt", "workspaceId" FROM "Request" WHERE "assigneeId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- DropForeignKey
ALTER TABLE "Request" DROP CONSTRAINT "Request_assigneeId_fkey";

-- DropIndex
DROP INDEX "Request_assigneeId_idx";

-- AlterTable
ALTER TABLE "Request" DROP COLUMN "assigneeId";
