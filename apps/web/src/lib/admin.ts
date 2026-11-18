import { apiClient } from '@/lib/api';

export interface Meta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface Overview {
  users: { total: number; new_7d: number; new_30d: number };
  organizations: {
    total: number;
    by_status: Record<string, number>;
    by_type: Record<string, number>;
  };
  subscriptions: {
    active: number;
    by_status: Record<string, number>;
    mrr: { currency: string; amount: number }[];
  };
  payments: {
    revenue: { currency: string; total: number; count: number }[];
    by_status: Record<string, number>;
  };
  assessments: { completed: number; in_progress: number };
  signups_30d: { date: string; count: number }[];
  recent_signups: { id: string; email: string; first_name: string; last_name: string; created_at: string }[];
}

export interface OrgSubscription {
  plan_name: string;
  status: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  end_date: string;
  seats_used: number;
  seats_limit: number;
}

export interface AdminOrganization {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  admin_name: string;
  admin_email: string;
  subscription_plan: string;
  subscription_status: string;
  max_employees: number;
  created_at: string;
  member_count: number;
  subscription: OrgSubscription | null;
}

export interface AdminUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  platform_role: string | null;
  platform_role_name: string | null;
  account_role: string | null;
  account_role_name: string | null;
  locked_until: string | null;
  created_at: string;
  organization_count: number;
  assessment_count: number;
  organizations: { id: string; name: string; role: string; role_name: string }[];
}

export type RoleScope = 'platform' | 'organization' | 'account';

export interface RoleRow {
  id: string;
  scope: RoleScope;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  permissions: string[];
  user_count: number;
}

export interface PermissionRow {
  key: string;
  scope: RoleScope;
  description: string | null;
}

export interface RolesResponse {
  roles: RoleRow[];
  permissions: PermissionRow[];
}

export interface AdminSubscription {
  id: string;
  plan_name: string;
  status: string;
  billing_cycle: string;
  amount: number;
  currency: string;
  start_date: string;
  end_date: string;
  auto_renew: boolean;
  seats_used: number;
  seats_limit: number;
  organization: { id: string; name: string; slug: string };
}

export interface AdminPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  provider_reference: string;
  payment_type: string;
  subscription_plan: string | null;
  description: string | null;
  created_at: string;
  /** Null when a person paid for themselves rather than a company. */
  organization: { id: string; name: string } | null;
  user: { id: string; first_name: string; last_name: string; email: string } | null;
}

export interface AdminAuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  status: string;
  error_message: string | null;
  ip_address: string | null;
  created_at: string;
  organization: { id: string; name: string };
  actor: { id: string; email: string; first_name: string; last_name: string };
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

export function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ACRONYMS = new Set(['ussd', 'qr', 'api', 'ip']);

export function humanize(value: string) {
  if (ACRONYMS.has(value.toLowerCase())) return value.toUpperCase();
  const text = value.replace(/[_.]/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One person, as support sees them. Never includes scores, answers, written insights or a badge link. */
export interface AdminUserDetail {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  email_verified: boolean;
  email_verified_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  deleted: boolean;
  platform_role: string | null;
  platform_role_name: string | null;
  account_role: string | null;
  companies: { id: string; name: string; type: string; role: string; role_name: string; status: string; department: string | null; job_title: string | null; joined_at: string; shares_results: boolean }[];
  assessments: { id: string; name: string; type: string; version: string; status: string; attempt: number; progress_percent: number; started_at: string; completed_at: string | null; company: { id: string; name: string } | null }[];
  badges: { is_public: boolean; published_at: string | null; expires_at: string | null; view_count: number; last_viewed_at: string | null }[];
  payments: { id: string; amount: number; currency: string; status: string; payment_type: string; description: string | null; provider_reference: string; created_at: string; processed_at: string | null; organization: { id: string; name: string } | null }[];
  sign_in: { active_sessions: number; last_signed_in: string | null };
  suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
  staff_actions: StaffActionRow[];
}

/** One thing platform staff did to a person, company or payment. */
export interface StaffActionRow {
  id: string;
  action: string;
  reason: string | null;
  by: string;
  at: string;
}

/** One company, as support sees it. People appear with whether they finished, never with scores. */
export interface AdminOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  admin_name: string;
  admin_email: string;
  admin_phone: string | null;
  suspended_reason: string | null;
  suspended_at: string | null;
  created_at: string;
  updated_at: string;
  staff_actions: StaffActionRow[];
  subscription: { plan_name: string; status: string; billing_cycle: string; amount: number; currency: string; start_date: string; end_date: string; auto_renew: boolean; seats_used: number; seats_limit: number; last_expiry_notice: string | null } | null;
  counts: { active_members: number; inactive_members: number; retakes_waiting: number; retakes_approved: number };
  members: { user_id: string; name: string; email: string; role: string; role_name: string; status: string; department: string | null; job_title: string | null; joined_at: string; shares_results: boolean; progress: 'completed' | 'in_progress' | 'not_started' }[];
  invitations: { pending: number; accepted: number; expired: number; revoked: number; recent: { id: string; email: string; role: string; status: string; sent_at: string; expires_at: string }[] };
  assessments: { id: string; name: string; version: string; status: 'published' | 'draft'; created_at: string; published_at: string | null; attempts: number }[];
  payments: { id: string; amount: number; currency: string; status: string; payment_type: string; description: string | null; provider_reference: string; created_at: string; paid_by: string | null }[];
  activity: { id: string; action: string; at: string; by: string }[];
}

const post = (path: string, body?: unknown, key?: string) => apiClient.post(path, body, key ? { headers: { 'Idempotency-Key': key } } : undefined).then((r) => r.data);
/** One key per click, so a repeated click or a retry after a timeout cannot do it twice. */
const once = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const unlockPerson = (id: string) => post(`/admin/users/${id}/unlock`);
export const sendPersonReset = (id: string) => post(`/admin/users/${id}/password-reset`, undefined, once());
export const suspendPerson = (id: string, reason: string) => post(`/admin/users/${id}/suspend`, { reason });
export const reactivatePerson = (id: string) => post(`/admin/users/${id}/reactivate`);
export const suspendCompany = (id: string, reason: string) => post(`/admin/organizations/${id}/suspend`, { reason });
export const reactivateCompany = (id: string) => post(`/admin/organizations/${id}/reactivate`);
export const refundPayment = (id: string, reason: string) => post(`/admin/payments/${id}/refund`, { reason }, once());
