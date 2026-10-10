-- AlterTable
ALTER TABLE "LibraryItem" ADD COLUMN     "files" JSONB NOT NULL DEFAULT '[]';
