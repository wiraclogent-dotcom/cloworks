-- CreateEnum
CREATE TYPE "ProjectStage" AS ENUM ('FIRST_PREVIEW', 'TECHNICAL_ARTWORK', 'FINAL_ARTWORK');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "subTitle" TEXT,
    "ownerId" TEXT,
    "stage" "ProjectStage",
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "dueTbc" BOOLEAN NOT NULL DEFAULT false,
    "fileName" TEXT,
    "notes" TEXT,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMilestone" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,

    CONSTRAINT "ProjectMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_position_idx" ON "ProjectTask"("projectId", "position");

-- CreateIndex
CREATE INDEX "ProjectMilestone_projectId_date_idx" ON "ProjectMilestone"("projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Project_code_key" ON "Project"("code");

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMilestone" ADD CONSTRAINT "ProjectMilestone_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

