/*
  The list of departments to choose from now lives in the website, not the database.

  The Department table (a per-company list managed through the API) is removed. People and invitations keep the
  chosen department as plain text on OrganizationMember.department / EmployeeInvitation.department, exactly as
  before, so nothing already stored is lost. (The earlier clean-up that merged different spellings of the same
  department, and the lower-case email rule, stay.)
*/
DROP TABLE "Department";
