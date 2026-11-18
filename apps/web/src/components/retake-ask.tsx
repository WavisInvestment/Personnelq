'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { requestRetake, type CompanyRetake } from '@/lib/retakes';

/**
 * Shown where a finished assessment would normally offer "take it again", when the attempt belongs to a company: the
 * company has to approve first. Either ask (and wait), or, once approved, the normal start button is offered by the page.
 */
export function RetakeAsk({
  assessmentId,
  company,
  state,
  onChanged,
}: {
  assessmentId: string;
  company: string;
  state: CompanyRetake;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(state.state === 'requested');

  if (state.state === 'approved') {
    return <Alert tone="success">{company} approved a retake{state.expires_at ? `. You can start it until ${formatDate(state.expires_at)}` : ''}.</Alert>;
  }

  if (sent) {
    return <Alert tone="info">Your request is with {company}. You’ll get an email when they decide, and the button here changes once it is approved.</Alert>;
  }

  const ask = async () => {
    setBusy(true);
    setError('');
    try {
      await requestRetake(assessmentId, state.organization_id);
      setSent(true);
      onChanged();
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Alert tone="info">You already finished this for {company}. Repeating it needs their approval, so your earlier result stays comparable.</Alert>
      {error && <Alert tone="error">{error}</Alert>}
      <Button variant="secondary" onClick={ask} loading={busy}>
        Ask {company} for a retake
      </Button>
    </div>
  );
}
