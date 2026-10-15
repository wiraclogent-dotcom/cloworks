-- AlterTable
ALTER TABLE "User" ADD COLUMN     "boardBackground" TEXT NOT NULL DEFAULT 'gradient',
ADD COLUMN     "boardBackgroundMediaId" TEXT,
ADD COLUMN     "boardVeil" INTEGER;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_boardBackgroundMediaId_fkey" FOREIGN KEY ("boardBackgroundMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
