-- AlterTable
ALTER TABLE "Invite" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "Invite_userId_idx" ON "Invite"("userId");

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
