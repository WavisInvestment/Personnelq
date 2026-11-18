/*
  Moves roles and permissions out of free-text columns into tables.

  - Adds Role, Permission and RolePermission.
  - User.platform_role (text)            -> User.platform_role_id (FK to Role)
  - OrganizationMember.role (text)       -> OrganizationMember.role_id (FK to Role)
  - OrganizationMember.permissions[]     -> dropped; permissions now come only from the role.

  Existing data is preserved: the six system roles are inserted first and current role strings are
  mapped onto them. Unknown member roles fall back to 'member'; unknown platform roles become NULL.
  The permission catalogue and role-permission links are synced from code when the API starts.
*/

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateIndex
CREATE INDEX "Role_scope_idx" ON "Role"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "Role_scope_key_key" ON "Role"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "Permission_scope_idx" ON "Permission"("scope");

-- CreateIndex
CREATE INDEX "RolePermission_permission_id_idx" ON "RolePermission"("permission_id");

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the system roles so existing rows have something to point at
INSERT INTO "Role" ("id", "scope", "key", "name", "description", "is_system", "updated_at") VALUES
  (gen_random_uuid()::text, 'platform',     'super_admin', 'Super admin', 'Full access to the platform admin console.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'platform',     'support',     'Support',     'Read-only access to the platform admin console.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'organization', 'admin',       'Admin',       'Runs the organisation, including billing and settings.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'organization', 'hr',          'HR',          'Manages people and assessments for the organisation.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'organization', 'employee',    'Employee',    'Takes assessments and sees their own results.', true, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'organization', 'member',      'Member',      'Takes assessments and sees their own results.', true, CURRENT_TIMESTAMP);

-- User.platform_role -> platform_role_id
ALTER TABLE "User" ADD COLUMN "platform_role_id" TEXT;

UPDATE "User" u
SET "platform_role_id" = r."id"
FROM "Role" r
WHERE r."scope" = 'platform' AND r."key" = u."platform_role";

DROP INDEX "User_platform_role_idx";
ALTER TABLE "User" DROP COLUMN "platform_role";

CREATE INDEX "User_platform_role_id_idx" ON "User"("platform_role_id");
ALTER TABLE "User" ADD CONSTRAINT "User_platform_role_id_fkey" FOREIGN KEY ("platform_role_id") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OrganizationMember.role -> role_id
ALTER TABLE "OrganizationMember" ADD COLUMN "role_id" TEXT;

UPDATE "OrganizationMember" m
SET "role_id" = COALESCE(
  (SELECT r."id" FROM "Role" r WHERE r."scope" = 'organization' AND r."key" = m."role"),
  (SELECT r."id" FROM "Role" r WHERE r."scope" = 'organization' AND r."key" = 'member')
);

ALTER TABLE "OrganizationMember" ALTER COLUMN "role_id" SET NOT NULL;

DROP INDEX "OrganizationMember_role_idx";
ALTER TABLE "OrganizationMember" DROP COLUMN "role", DROP COLUMN "permissions";

CREATE INDEX "OrganizationMember_role_id_idx" ON "OrganizationMember"("role_id");
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
