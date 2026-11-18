import { apiClient } from '@/lib/api';

/** Where a person stands on repeating an assessment through their company. */
export interface CompanyRetake {
  organization_id: string;
  state: 'needs_approval' | 'requested' | 'approved';
  expires_at: string | null;
}

export interface RetakeRow {
  id: string;
  status: 'requested' | 'approved';
  requested_by: 'member' | 'hr';
  requested_at: string;
  expires_at: string | null;
  person: { user_id: string; name: string; email: string };
  assessment: { id: string; name: string };
}

export const requestRetake = (assessmentId: string, organizationId: string) =>
  apiClient.post('/retake-requests', { assessment_id: assessmentId, organization_id: organizationId }).then((r) => r.data as { id: string; status: string });

const base = (org: string) => `/organizations/${org}/retakes`;
export const listRetakes = (org: string) => apiClient.get(base(org)).then((r) => r.data.data as RetakeRow[]);
export const allowRetake = (org: string, userId: string, assessmentId?: string) => apiClient.post(base(org), { user_id: userId, assessment_id: assessmentId }).then((r) => r.data);
export const approveRetake = (org: string, id: string) => apiClient.post(`${base(org)}/${id}/approve`).then((r) => r.data);
export const declineRetake = (org: string, id: string) => apiClient.post(`${base(org)}/${id}/decline`).then((r) => r.data);
export const cancelRetake = (org: string, id: string) => apiClient.post(`${base(org)}/${id}/cancel`).then((r) => r.data);
