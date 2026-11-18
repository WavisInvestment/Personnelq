import { apiClient } from '@/lib/api';
import { authApi } from '@/lib/auth';

export interface Account {
  id: string;
  email: string;
  pending_email: string | null;
  email_verified: boolean;
  first_name: string;
  last_name: string;
  created_at: string;
  signed_in_devices: number;
  organizations: { id: string; name: string; type: string; role: string }[];
  /** True while the account, created from a company's invitation, belongs to that company: no deleting, no new email. */
  managed?: boolean;
  managed_by?: string | null;
}

export const getAccount = () => apiClient.get('/account').then((r) => r.data as Account);
export const updateProfile = (body: { first_name: string; last_name: string }) => apiClient.patch('/account', body).then((r) => r.data as { first_name: string; last_name: string });
export const changePassword = (body: { current_password: string; password: string; password_confirm: string }) =>
  apiClient.post('/account/password', { ...body, refresh_token: localStorage.getItem('refresh_token') ?? undefined });
export const changeEmail = (body: { email: string; password: string }) => apiClient.post('/account/email', body).then((r) => r.data as { pending_email: string; email_status: string });
export const signOutEverywhere = () => apiClient.post('/account/sign-out-everywhere');
export const deleteAccount = (password: string) => apiClient.delete('/account', { data: { password } });
export const resendVerification = () => apiClient.post('/auth/resend-verification').then((r) => r.data as { already_verified: boolean; email_status: string | null });
export const verifyEmail = (token: string) => authApi.post('/auth/verify-email', { token }).then((r) => r.data as { verified: true; email: string });

/** Saves everything we hold about the person as a JSON file. */
export async function downloadMyData(accountName: string) {
  const res = await apiClient.get('/account/export', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  // The file is named after the account holder.
  const who = accountName.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'account';
  a.download = `${who}-personnelq-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
