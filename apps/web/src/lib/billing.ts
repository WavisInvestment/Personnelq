import { apiClient } from '@/lib/api';
import type { Insights } from '@/lib/assessments';

export interface Money {
  amount: number;
  currency: string;
}

export function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === 'NGN' ? 'en-NG' : 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}

export interface CheckoutResponse extends Money {
  authorization_url: string;
  reference: string;
}

export type VerifyStatus = 'success' | 'failed' | 'pending' | 'unknown';

export interface VerifyResponse {
  status: VerifyStatus;
  payment: { reference: string; amount: number; currency: string; type: string; description: string | null; paid_at: string | null } | null;
  next: { href: string };
}

export interface PaymentRow {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: 'pending' | 'success' | 'failed' | string;
  payment_type: 'assessment' | 'subscription' | string;
  payment_method: string | null;
  description: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface PlanOption {
  slug: string;
  name: string;
  description: string | null;
  seats: number;
  amount: number;
  currency: string;
  billing_cycle: 'monthly' | 'annual';
  /** Set when this would replace the current plan: what is charged today after crediting the days left. */
  switch_charge?: number | null;
  switch_credit?: number | null;
  /** Why this plan can't be chosen right now (more people than seats). */
  blocked?: string | null;
}

export interface BillingOverview {
  organization: { id: string; name: string; type: string };
  subscription: {
    plan_name: string;
    status: string;
    billing_cycle: string;
    amount: number;
    currency: string;
    start_date: string;
    end_date: string;
    seats_used: number;
    seats_limit: number;
    auto_renew: boolean;
  } | null;
  payments_enabled: boolean;
  /** Payments were switched off on purpose: the company has full access at no cost. */
  payments_disabled: boolean;
  plans: PlanOption[];
}

export const startCheckout = (assessmentId: string) =>
  apiClient.post('/payments/checkout', { assessment_id: assessmentId }).then((r) => r.data as CheckoutResponse);

export const startSubscriptionCheckout = (organizationId: string, plan: string) =>
  apiClient.post('/payments/subscription-checkout', { organization_id: organizationId, plan }).then((r) => r.data as CheckoutResponse);

export const verifyPayment = (reference: string) =>
  apiClient.get('/payments/verify', { params: { reference } }).then((r) => r.data as VerifyResponse);

export const listPayments = () => apiClient.get('/payments').then((r) => r.data.data as PaymentRow[]);

export const getBilling = (organizationId: string) =>
  apiClient.get(`/payments/billing/${organizationId}`).then((r) => r.data as BillingOverview);

// ---------------------------------------------------------------- insights, report, email

export interface InsightsResponse {
  insights: Insights;
  generated_at: string | null;
  model: string | null;
}

export const generateInsights = (resultId: string) =>
  apiClient.post(`/results/${resultId}/insights`).then((r) => r.data as InsightsResponse);

/** Downloads the PDF through the authenticated client (a plain link couldn't send the login token). */
export async function downloadReport(resultId: string) {
  const res = await apiClient.get(`/results/${resultId}/report`, { responseType: 'blob' });
  const disposition = String(res.headers['content-disposition'] ?? '');
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'personality-report.pdf';
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const emailReport = (resultId: string) =>
  apiClient.post(`/results/${resultId}/email`).then((r) => r.data as { status: 'sent' | 'not_configured' | 'failed'; attached: boolean });

// ---------------------------------------------------------------- badge

export interface BadgeElements {
  scores: boolean;
  descriptions: boolean;
  date: boolean;
  class: boolean;
}

export interface OwnerBadge {
  id: string;
  is_public: boolean;
  share_path: string | null;
  is_live: boolean;
  expired: boolean;
  display_name: string;
  custom_message: string | null;
  shared_elements: BadgeElements;
  expires_at: string | null;
  view_count: number;
  last_viewed_at: string | null;
}

export interface BadgeUpdate {
  is_public: boolean;
  display_name?: string;
  custom_message?: string | null;
  show_scores?: boolean;
  show_descriptions?: boolean;
  show_date?: boolean;
  show_class?: boolean;
  expires_in_days?: 30 | 90 | 365 | null;
}

export const getBadge = (resultId: string) =>
  apiClient.get(`/results/${resultId}/badge`).then((r) => r.data.badge as OwnerBadge | null);

export const saveBadge = (resultId: string, update: BadgeUpdate) =>
  apiClient.put(`/results/${resultId}/badge`, update).then((r) => r.data.badge as OwnerBadge);

export const revokeBadge = (resultId: string) =>
  apiClient.delete(`/results/${resultId}/badge`).then((r) => r.data.badge as OwnerBadge | null);

export interface PublicBadge {
  display_name: string;
  assessment_name: string;
  completed_at: string | null;
  message: string | null;
  profile_class: import('./assessments').ProfileClass | null;
  tier: import('./assessments').Tier | null;
  traits: { trait: string; level: string; level_label: string; score: number | null; description: string | null }[];
}
