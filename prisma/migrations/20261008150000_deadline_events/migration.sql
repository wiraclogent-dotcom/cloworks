-- AlterTable
ALTER TABLE "Request" ADD COLUMN     "originalDeadline" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "DeadlineEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "from" TIMESTAMP(3),
    "to" TIMESTAMP(3) NOT NULL,
    "actorId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeadlineEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeadlineEvent_requestId_idx" ON "DeadlineEvent"("requestId");

-- AddForeignKey
ALTER TABLE "DeadlineEvent" ADD CONSTRAINT "DeadlineEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeadlineEvent" ADD CONSTRAINT "DeadlineEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

