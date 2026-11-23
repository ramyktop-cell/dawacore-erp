BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS "User_companyId_username_key"
  ON "User"("companyId", "username");

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_username_key";
DROP INDEX IF EXISTS "User_username_key";

COMMIT;
