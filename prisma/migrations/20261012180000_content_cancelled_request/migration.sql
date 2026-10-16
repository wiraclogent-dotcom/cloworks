-- AlterTable
ALTER TABLE "ContentPost" ADD COLUMN     "cancelledRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContentPost_cancelledRequestId_key" ON "ContentPost"("cancelledRequestId");

-- CreateIndex
CREATE INDEX "Notification_contentPostId_idx" ON "Notification"("contentPostId");
