'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { readApiProblem } from '@/lib/assessments';
import { downloadReport, emailReport } from '@/lib/billing';

type Notice = { tone: 'success' | 'error' | 'info'; text: string } | null;

/** The blob error body can't be read as JSON by axios, so map the common cases by status. */
function reportProblem(err: unknown) {
  const p = readApiProblem(err);
  if (p.status === 503) return 'PDF reports aren’t available right now. Please try again later.';
  if (p.status === 429) return 'You’ve asked for a lot of reports. Please wait a little and try again.';
  if (p.status === 400) return 'Reports are part of the full assessment.';
  return 'We couldn’t create your report. Please try again.';
}

export function ReportActions({ resultId }: { resultId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const download = async () => {
    setDownloading(true);
    setNotice(null);
    try {
      await downloadReport(resultId);
    } catch (err) {
      setNotice({ tone: 'error', text: reportProblem(err) });
    } finally {
      setDownloading(false);
    }
  };

  const email = async () => {
    setEmailing(true);
    setNotice(null);
    try {
      const res = await emailReport(resultId);
      if (res.status === 'sent') setNotice({ tone: 'success', text: 'Sent. Check your inbox for your report.' });
      else if (res.status === 'not_configured') setNotice({ tone: 'info', text: 'Email isn’t set up on this site yet. You can still download the PDF.' });
      else setNotice({ tone: 'error', text: 'We couldn’t send the email just now. You can still download the PDF.' });
    } catch (err) {
      const p = readApiProblem(err);
      setNotice({ tone: 'error', text: p.status === 429 ? 'You’ve emailed a lot of reports. Please try again later.' : 'We couldn’t send the email. Please try again.' });
    } finally {
      setEmailing(false);
    }
  };

  return (
    <section aria-labelledby="report-heading" className="py-6 sm:py-8 border-t border-line">
      <h2 id="report-heading" className="font-display text-2xl font-medium">
        Your report
      </h2>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        A PDF with your chart, a reading of every trait and, if you’ve written them, your insights.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button onClick={download} loading={downloading}>
          {downloading ? 'Preparing PDF…' : 'Download PDF'}
        </Button>
        <Button variant="secondary" onClick={email} loading={emailing}>
          Email it to me
        </Button>
      </div>
      {notice && <Alert tone={notice.tone} className="mt-5">{notice.text}</Alert>}
    </section>
  );
}
