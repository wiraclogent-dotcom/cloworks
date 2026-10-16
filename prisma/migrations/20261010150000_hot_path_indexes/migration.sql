-- Indexes for the hot read paths (board columns, chat participation and unread, today counts, notifications).

-- DropIndex: covered by "Comment_requestId_createdAt_idx"
DROP INDEX "Comment_requestId_idx";

-- CreateIndex
CREATE INDEX "Request_requesterId_idx" ON "Request"("requesterId");

-- CreateIndex
CREATE INDEX "Request_status_deadline_idx" ON "Request"("status", "deadline");

-- CreateIndex
CREATE INDEX "StatusEvent_to_at_idx" ON "StatusEvent"("to", "at");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "Comment_createdAt_idx" ON "Comment"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
