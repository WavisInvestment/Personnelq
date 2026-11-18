/*
  Accounts created from a company invitation stay with that company.

  User.joined_via_organization_id: set at sign-up when the account was created from an invitation link. That person cannot
  leave that company (they can still delete their account); an existing account that accepts an invitation can leave as before.
*/

-- AlterTable
ALTER TABLE "User" ADD COLUMN "joined_via_organization_id" TEXT;
