-- Multi-assignee requests: ROLLBACK, MANUAL USE ONLY.
--
-- Run this by hand (psql or the Neon SQL editor) only when rolling production back to the code from before the
-- multi-assignee release, which reads and writes "Request"."assigneeId". It is not a Prisma migration and must
-- never be placed in prisma/migrations.
--
-- It re-adds "assigneeId" and fills it from each request's first assignee (earliest "addedAt", then lowest
-- "userId": the app's ASSIGNEE_ORDER). Shared requests keep only that person. The "RequestAssignee" table is
-- left in place, untouched, so rolling forward again loses nothing; the old code simply ignores it.
--
-- The column, index and foreign key match the originals in prisma/migrations/20261008035735_init.
-- Prisma's _prisma_migrations table still records both multi-assignee migrations as applied. The old code does not
-- care. Rolling forward again later therefore does not re-run them: re-run the body of
-- 20261014130000_drop_request_assignee_id (safety-net copy, then drop) by hand before deploying the new code.

BEGIN;

ALTER TABLE "Request" ADD COLUMN "assigneeId" TEXT;

UPDATE "Request" r
SET "assigneeId" = first."userId"
FROM (
  SELECT DISTINCT ON ("requestId") "requestId", "userId"
  FROM "RequestAssignee"
  ORDER BY "requestId", "addedAt" ASC, "userId" ASC
) AS first
WHERE first."requestId" = r."id";

CREATE INDEX "Request_assigneeId_idx" ON "Request"("assigneeId");

ALTER TABLE "Request" ADD CONSTRAINT "Request_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

COMMIT;
