/*
  Departments and one-person-one-email.

  1. Department: a company now keeps a list of its departments (classes, groups or teams for schools and
     communities). Invitations and members must use one from the list, so "Sales", "sales" and "Sale " can no longer
     become three departments. name_key is the lower-cased, trimmed name and is unique per company.
     Departments already typed into members and invitations are carried over, with case variants merged.

  2. User.email: addresses are stored lower-case. Until now "Eve@x.com" and "eve@x.com" were two different people to
     the database. The migration stops if such pairs already exist rather than guessing which one to keep.
*/

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Department_organization_id_name_key_key" ON "Department"("organization_id", "name_key");
CREATE INDEX "Department_organization_id_idx" ON "Department"("organization_id");

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over what people typed before: one department per company and spelling-ignoring-case
INSERT INTO "Department" ("id", "organization_id", "name", "name_key", "created_at", "updated_at")
SELECT 'dep_' || md5(organization_id || lower(trim(department))), organization_id, min(trim(department)), lower(trim(department)), now(), now()
FROM (
  SELECT organization_id, department FROM "OrganizationMember"
  UNION ALL
  SELECT organization_id, department FROM "EmployeeInvitation"
) AS typed
WHERE department IS NOT NULL AND trim(department) <> ''
GROUP BY organization_id, lower(trim(department));

-- Make the stored names match the list exactly
UPDATE "OrganizationMember" m SET department = d.name
FROM "Department" d
WHERE d.organization_id = m.organization_id AND m.department IS NOT NULL AND d.name_key = lower(trim(m.department)) AND m.department <> d.name;

UPDATE "EmployeeInvitation" i SET department = d.name
FROM "Department" d
WHERE d.organization_id = i.organization_id AND i.department IS NOT NULL AND d.name_key = lower(trim(i.department)) AND i.department <> d.name;

-- Blank departments mean "none"
UPDATE "OrganizationMember" SET department = NULL WHERE department IS NOT NULL AND trim(department) = '';
UPDATE "EmployeeInvitation" SET department = NULL WHERE department IS NOT NULL AND trim(department) = '';

-- Emails: refuse to continue if two accounts differ only by capitals
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" GROUP BY lower(email) HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Cannot lower-case emails: some accounts have the same address in different capitals. Merge or remove the duplicates first.';
  END IF;
END $$;

UPDATE "User" SET email = lower(trim(email)) WHERE email <> lower(trim(email));
