import axios from 'axios';
import { getApiUrl } from '@/lib/api-url';

// Plain client for the public auth endpoints. The shared apiClient redirects to /login on 401,
// which would swallow "wrong password" errors, so these calls bypass its interceptors.
export const authApi = axios.create();
authApi.interceptors.request.use((config) => {
  config.baseURL = getApiUrl();
  return config;
});

export interface SessionOrganization {
  id: string;
  name: string;
  slug: string;
  type: string;
  role: string;
  shares_results?: boolean;
  /** False for an account that was created from this company's invitation: it stays with the company. */
  can_leave?: boolean;
}

export interface SessionUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  platform_role?: 'super_admin' | 'support' | null;
  email_verified?: boolean;
  organizations?: SessionOrganization[];
}

interface SessionPayload {
  access_token: string;
  refresh_token: string;
  user: SessionUser;
}

/** Company administrators and HR run assessments for their people; they do not take them, and have no personal side. */
export const isCompanyStaff = (user: SessionUser | null | undefined) => !!user?.organizations?.some((o) => o.role === 'admin' || o.role === 'hr');

/** Where a person lands after signing in: staff in the admin console, company leaders on their company, everyone else on their journey. */
export const homeFor = (user: SessionUser) => (user.platform_role ? '/admin' : isCompanyStaff(user) ? '/company' : '/dashboard');

/** Pages that belong to the personal side (taking assessments, results). Company leaders are sent to their company instead. */
export const PERSONAL_PATHS = ['/dashboard', '/results', '/assessments', '/company-assessments'];
export const isPersonalPath = (pathname: string) => PERSONAL_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export function saveSession({ access_token, refresh_token, user }: SessionPayload) {
  localStorage.setItem('access_token', access_token);
  localStorage.setItem('refresh_token', refresh_token);
  localStorage.setItem('user', JSON.stringify(user));
}

/**
 * What the page already knows, kept for the life of the browser tab. Every signed-in page has its own header, so without
 * this each click would blank the screen on "Loading…" and ask the server who you are again.
 */
const memo: { user: SessionUser | null; companiesAt: number; verifiedAt: number } = { user: null, companiesAt: 0, verifiedAt: 0 };
/** The signed-in person as of the last page, or null on the very first render (so server and browser agree while hydrating). */
export const peekSessionUser = () => memo.user;
export const rememberSessionUser = (user: SessionUser) => { memo.user = user; };
/** True if the email was confirmed within the last few minutes, so the "confirm your email" check can be skipped. */
export const emailRecentlyConfirmed = (maxAgeMs = 5 * 60_000) => Date.now() - memo.verifiedAt < maxAgeMs;
export const noteEmailConfirmed = () => { memo.verifiedAt = Date.now(); };

export function clearSession() {
  memo.user = null;
  memo.companiesAt = 0;
  memo.verifiedAt = 0;
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
}

export function getStoredUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem('user');
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) {
      return "We couldn't reach the server. Check your connection and try again.";
    }
    const message = err.response.data?.message;
    if (Array.isArray(message)) return message[0] ?? fallback;
    if (typeof message === 'string') return message;
  }
  return fallback;
}

/** Only follow a "next" address that stays on this site. */
export function safeNext(next: string | null | undefined, fallback: string): string {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') ? next : fallback;
}

/** The sign-in copy of a person's companies goes stale (joining, leaving). Re-read it and save it. */
export async function refreshOrganizations(maxAgeMs = 0): Promise<SessionUser | null> {
  const user = getStoredUser();
  if (!user) return null;
  // Navigating between pages should not repeat this request each time; joining or leaving a company asks again explicitly.
  if (maxAgeMs > 0 && Date.now() - memo.companiesAt < maxAgeMs) return user;
  memo.companiesAt = Date.now();
  const { apiClient } = await import('@/lib/api');
  const { data } = await apiClient.get('/me/organizations');
  const updated = { ...user, organizations: data.data as SessionOrganization[] };
  localStorage.setItem('user', JSON.stringify(updated));
  memo.user = updated;
  return updated;
}
