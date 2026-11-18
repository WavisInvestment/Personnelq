'use client';

import { useEffect, useState } from 'react';
import { authApi } from '@/lib/auth';

export interface InvitationDetails {
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  organization_name: string;
  organization_type: string;
  inviter_name: string;
  /** The address the invitation was sent to. Sign-up and sign-in fix it in place. */
  email: string;
  email_hint: string;
  /** Always an employee for now; shown so the person sees what they are joining as. */
  role: { key: string; name: string };
  department: string | null;
  job_title: string | null;
  expires_at: string;
}

export type InvitationState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'ready'; token: string; info: InvitationDetails }
  | { kind: 'invalid'; reason: 'expired' | 'revoked' | 'accepted' | 'missing' };

const TOKEN_FORMAT = /^[A-Za-z0-9_-]{20,64}$/;

/**
 * Reads ?invite=<token> from the address bar and loads what the invitation says (company, role, the invited email).
 * Pages use it to show those details and lock them, so the person can't type a different address or pick a role.
 */
export function useInvitation(): InvitationState {
  // Starts as "loading" because the address bar can't be read on the server. Showing the ordinary form for a moment
  // and then swapping it for the locked one would flash, and throw away anything typed in between.
  const [state, setState] = useState<InvitationState>({ kind: 'loading' });

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('invite');
    if (!token) {
      setState({ kind: 'none' });
      return;
    }
    if (!TOKEN_FORMAT.test(token)) {
      setState({ kind: 'invalid', reason: 'missing' });
      return;
    }

    let cancelled = false;
    authApi
      .get(`/invitations/${encodeURIComponent(token)}`)
      .then(({ data }) => {
        if (cancelled) return;
        const info = data as InvitationDetails;
        setState(info.status === 'pending' ? { kind: 'ready', token, info } : { kind: 'invalid', reason: info.status });
      })
      .catch(() => !cancelled && setState({ kind: 'invalid', reason: 'missing' }));
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export const INVALID_INVITATION_TEXT: Record<'expired' | 'revoked' | 'accepted' | 'missing', string> = {
  expired: 'This invitation has expired. Ask the company to send you a new one.',
  revoked: 'This invitation was cancelled.',
  accepted: 'This invitation has already been used. If that was you, sign in to continue.',
  missing: 'This invitation link isn’t valid. Ask the person who invited you to send it again.',
};
