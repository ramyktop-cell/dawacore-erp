-- AlterTable: Add companyId to Medicine and backfill from existing company
DO $$ BEGIN
  ALTER TABLE "Medicine" ADD COLUMN "companyId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Backfill ownership from each medicine's existing stock branches when they
-- all belong to one company. This avoids assigning every tenant's catalogue
-- to whichever company happened to be created first.
WITH medicine_owners AS (
  SELECT b."medicineId", MIN(br."companyId") AS "companyId"
  FROM "Batch" b
  JOIN "Branch" br ON br."id" = b."branchId"
  GROUP BY b."medicineId"
  HAVING COUNT(DISTINCT br."companyId") = 1
)
UPDATE "Medicine" m
SET "companyId" = owners."companyId"
FROM medicine_owners owners
WHERE m."id" = owners."medicineId"
  AND m."companyId" IS NULL;

-- A database with one company has an unambiguous owner for catalogue rows
-- that do not yet have batches.
UPDATE "Medicine"
SET "companyId" = (SELECT "id" FROM "Company" LIMIT 1)
WHERE "companyId" IS NULL
  AND (SELECT COUNT(*) FROM "Company") = 1;

-- Never silently move ambiguous legacy rows into another tenant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Medicine" WHERE "companyId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot infer company ownership for all Medicine rows; resolve ambiguous legacy catalogue ownership before upgrade';
  END IF;
END $$;

-- Enforce NOT NULL on companyId
ALTER TABLE "Medicine" ALTER COLUMN "companyId" SET NOT NULL;

-- Add Foreign Key constraint to Company
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Medicine_companyId_fkey'
    ) THEN
        ALTER TABLE "Medicine"
        ADD CONSTRAINT "Medicine_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Drop single-column unique indexes
DROP INDEX IF EXISTS "Medicine_barcode_key";
DROP INDEX IF EXISTS "Medicine_code_key";
DROP INDEX IF EXISTS "Medicine_scalePlu_key";
DROP INDEX IF EXISTS "MedicineUnit_barcode_key";

-- Create multi-tenant compound unique indexes
CREATE UNIQUE INDEX IF NOT EXISTS "Medicine_companyId_barcode_key" ON "Medicine"("companyId", "barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "Medicine_companyId_code_key" ON "Medicine"("companyId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "Medicine_companyId_scalePlu_key" ON "Medicine"("companyId", "scalePlu");

-- Create performance indexes for company isolation and searching
CREATE INDEX IF NOT EXISTS "Medicine_companyId_idx" ON "Medicine"("companyId");
DROP INDEX IF EXISTS "Medicine_barcode_tradeName_scientificName_idx";
CREATE INDEX IF NOT EXISTS "Medicine_companyId_barcode_tradeName_scientificName_idx" ON "Medicine"("companyId", "barcode", "tradeName", "scientificName");
CREATE INDEX IF NOT EXISTS "MedicineUnit_barcode_idx" ON "MedicineUnit"("barcode");
