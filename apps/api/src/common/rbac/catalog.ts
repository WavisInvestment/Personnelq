/*
 * Single source of truth for roles and permissions.
 *
 * `npm run db:seed` and API startup both write this catalogue to the Role, Permission and
 * RolePermission tables, so edit it here, never by hand in the database.
 *
 * Permission keys are `action:resource`. Roles have a scope:
 *   account      - the personal role every user holds ('individual'), attached via User.account_role_id
 *   platform     - staff of the product itself, attached via User.platform_role_id
 *   organization - a person's standing inside one company, attached via OrganizationMember.role_id
 *
 * 'account' permissions are the personal baseline; company roles repeat them so that checks made
 * inside a company still work, which is why a role may hold its own scope plus 'account'.
 */

export type RoleScope = 'platform' | 'organization' | 'account';

export const PERMISSION_CATALOG = [
  // ---- platform ----
  { key: 'view:platform_overview', scope: 'platform', description: 'See platform-wide totals and trends' },
  { key: 'view:all_organizations', scope: 'platform', description: 'List and inspect every company' },
  { key: 'view:all_users', scope: 'platform', description: 'List and inspect every individual' },
  { key: 'view:subscriptions', scope: 'platform', description: 'See every company subscription' },
  { key: 'view:payments', scope: 'platform', description: 'See every payment and its status' },
  { key: 'view:audit_logs', scope: 'platform', description: 'Read the audit trail across all companies' },
  { key: 'view:roles', scope: 'platform', description: 'See roles and the permissions they carry' },
  { key: 'manage:all_users', scope: 'platform', description: 'Edit, lock or remove any user' },
  { key: 'manage:all_organizations', scope: 'platform', description: 'Edit or suspend any company' },
  { key: 'manage:payments', scope: 'platform', description: 'Issue refunds and resolve payment issues' },
  { key: 'manage:roles', scope: 'platform', description: 'Assign roles to users' },
  { key: 'manage:all_assessments', scope: 'platform', description: 'Create and edit platform assessments' },
  { key: 'manage:questions', scope: 'platform', description: 'Manage the question bank' },

  // ---- account (every user) ----
  { key: 'take:assessments', scope: 'account', description: 'Take assessments' },
  { key: 'read:own_results', scope: 'account', description: 'See your own assessment results' },
  { key: 'download:own_reports', scope: 'account', description: 'Download your own reports' },
  { key: 'manage:own_account', scope: 'account', description: 'Update your own profile and password' },

  // ---- organization ----
  { key: 'invite:members', scope: 'organization', description: 'Send assessment invitations' },
  { key: 'manage:team', scope: 'organization', description: 'Add and remove people in the company' },
  { key: 'manage:assessments', scope: 'organization', description: 'Create, edit and assign company assessments' },
  { key: 'approve:retakes', scope: 'organization', description: 'Authorise a retake of a locked assessment' },
  { key: 'read:team_results', scope: 'organization', description: 'See results for people in the company' },
  { key: 'export:results', scope: 'organization', description: 'Export company results' },
  { key: 'view:analytics', scope: 'organization', description: 'See company analytics' },
  { key: 'view:org_audit_logs', scope: 'organization', description: 'Read the company audit trail' },
  { key: 'manage:organization', scope: 'organization', description: 'Change company settings' },
  { key: 'manage:billing', scope: 'organization', description: 'Manage the company plan and payments' },
] as const;

export type PermissionKey = (typeof PERMISSION_CATALOG)[number]['key'];

const ofScope = (scope: RoleScope) =>
  PERMISSION_CATALOG.filter((p) => p.scope === scope).map((p) => p.key as PermissionKey);

const ownPermissions = ofScope('account');

export interface RoleDefinition {
  scope: RoleScope;
  key: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export const ROLE_CATALOG: RoleDefinition[] = [
  {
    scope: 'account',
    key: 'individual',
    name: 'Individual',
    description: 'A person using the platform for themselves.',
    permissions: ownPermissions,
  },
  {
    scope: 'platform',
    key: 'super_admin',
    name: 'Super admin',
    description: 'Full access to the platform admin console.',
    permissions: ofScope('platform'),
  },
  {
    scope: 'platform',
    key: 'support',
    name: 'Support',
    description: 'Read-only access to the platform admin console.',
    permissions: ofScope('platform').filter((k) => k.startsWith('view:')),
  },
  {
    scope: 'organization',
    key: 'admin',
    name: 'Admin',
    description: 'Runs the organisation, including billing and settings.',
    permissions: [...ownPermissions, ...ofScope('organization')],
  },
  {
    scope: 'organization',
    key: 'hr',
    name: 'HR',
    description: 'Manages people and assessments for the organisation.',
    permissions: [
      ...ownPermissions,
      ...ofScope('organization').filter((k) => k !== 'manage:organization' && k !== 'manage:billing'),
    ],
  },
  {
    scope: 'organization',
    key: 'employee',
    name: 'Employee',
    description: 'Takes assessments and sees their own results.',
    permissions: ownPermissions,
  },
  {
    scope: 'organization',
    key: 'member',
    name: 'Member',
    description: 'Takes assessments and sees their own results.',
    permissions: ownPermissions,
  },
];
