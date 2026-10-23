-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "color" TEXT NOT NULL DEFAULT 'tag-neutral';

-- AlterTable
ALTER TABLE "Division" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- Keep today's badge colours (brandTone: case- and whitespace-insensitive Clogent / Bubble Wash; others grey).
UPDATE "Brand" SET "color" = 'tag-clogent' WHERE lower(regexp_replace("name", '\s+', '', 'g')) = 'clogent';
UPDATE "Brand" SET "color" = 'tag-bubble-wash' WHERE lower(regexp_replace("name", '\s+', '', 'g')) = 'bubblewash';
