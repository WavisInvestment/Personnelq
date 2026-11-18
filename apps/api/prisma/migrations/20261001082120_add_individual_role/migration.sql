/*
  Adds a personal role that every account holds.

  - Adds User.account_role_id (FK to Role).
  - Inserts the 'individual' role (scope 'account') and attaches it to every existing user.
  Its permissions (take assessments, see own results, ...) are synced from code by the seed / API startup.
*/

-- AlterTable
ALTER TABLE "User" ADD COLUMN "account_role_id" TEXT;

-- Seed the role so existing users can be backfilled
INSERT INTO "Role" ("id", "scope", "key", "name", "description", "is_system", "updated_at")
VALUES (gen_random_uuid()::text, 'account', 'individual', 'Individual', 'A person using the platform for themselves.', true, CURRENT_TIMESTAMP);

UPDATE "User"
SET "account_role_id" = (SELECT "id" FROM "Role" WHERE "scope" = 'account' AND "key" = 'individual');

-- CreateIndex
CREATE INDEX "User_account_role_id_idx" ON "User"("account_role_id");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_account_role_id_fkey" FOREIGN KEY ("account_role_id") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
