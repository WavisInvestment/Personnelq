'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { useConfirm } from '@/components/ui/confirm';
import { Button } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { getBadge, revokeBadge, saveBadge, type OwnerBadge } from '@/lib/billing';

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: 'keep', label: 'Keep as it is' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never' },
];

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-4 py-3 hover:bg-paper-soft">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-700" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-[15px] font-medium">{label}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
    </label>
  );
}

export function BadgePanel({ resultId, firstName }: { resultId: string; firstName: string }) {
  const confirm = useConfirm();
  const [loaded, setLoaded] = useState(false);
  const [badge, setBadge] = useState<OwnerBadge | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  // The editable form (separate from the saved badge so nothing changes until "Save")
  const [name, setName] = useState(firstName);
  const [message, setMessage] = useState('');
  const [scores, setScores] = useState(true);
  const [descriptions, setDescriptions] = useState(false);
  const [date, setDate] = useState(true);
  const [showClass, setShowClass] = useState(true);
  const [expiry, setExpiry] = useState('keep');

  const fill = (b: OwnerBadge | null) => {
    setBadge(b);
    if (b) {
      setName(b.display_name);
      setMessage(b.custom_message ?? '');
      setScores(b.shared_elements.scores);
      setDescriptions(b.shared_elements.descriptions);
      setDate(b.shared_elements.date);
      setShowClass(b.shared_elements.class ?? true);
    }
    setExpiry('keep');
  };

  useEffect(() => {
    let cancelled = false;
    getBadge(resultId)
      .then((b) => {
        if (!cancelled) {
          fill(b);
          setLoaded(true);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(readApiProblem(err).message);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  const link = badge?.share_path && typeof window !== 'undefined' ? `${window.location.origin}${badge.share_path}` : null;

  const save = async (isPublic: boolean) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const saved = await saveBadge(resultId, {
        is_public: isPublic,
        display_name: name,
        custom_message: message,
        show_scores: scores,
        show_descriptions: descriptions,
        show_date: date,
        show_class: showClass,
        ...(expiry !== 'keep' && { expires_in_days: expiry === 'never' ? null : (Number(expiry) as 30 | 90 | 365) }),
      });
      fill(saved);
      setNotice(isPublic ? 'Saved. Your badge is live.' : 'Sharing is off. The link no longer works.');
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    const ok = await confirm({
      title: 'Retire this link for good?',
      message: 'Anyone holding it will lose access. Turning sharing on again gives you a brand-new link.',
      confirmLabel: 'Retire link',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      fill(await revokeBadge(resultId));
      setNotice('Sharing stopped. The old link is retired.');
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setNotice('Link copied.');
    } catch {
      setNotice('Copy didn’t work here. Select the link and copy it by hand.');
    }
  };

  const live = !!badge?.is_live;

  return (
    <section aria-labelledby="badge-heading" className="py-6 sm:py-8 border-t border-line">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="badge-heading" className="font-display text-2xl font-medium">
          Share your badge
        </h2>
        {loaded && (
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
              live ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-paper-soft text-ink-soft ring-line-strong'
            }`}
          >
            {live ? 'Shared' : badge?.expired ? 'Expired' : 'Private'}
          </span>
        )}
      </div>
      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
        Your results are private until you share them. A badge gives you a link you control: choose what people see, set it to expire,
        and switch it off any time.
      </p>

      {!loaded && <div className="mt-6 h-32 animate-pulse rounded-2xl bg-paper-soft" aria-hidden="true" />}

      {loaded && (
        <div className="mt-6 space-y-6">
          {badge?.expired && <Alert tone="info">This link has expired. Saving with sharing on gives you a fresh link.</Alert>}

          {live && link && (
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4">
              <p className="text-sm font-medium text-brand-800">Your link</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Badge link"
                  className="min-w-0 flex-1 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm"
                />
                <Button size="sm" variant="secondary" onClick={copy}>
                  Copy
                </Button>
                <a href={link} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
                  Preview
                </a>
              </div>
              <p className="mt-2 text-xs text-brand-800/80">
                {badge!.view_count} {badge!.view_count === 1 ? 'view' : 'views'}
                {badge!.expires_at ? ` · expires ${formatDate(badge!.expires_at)}` : ' · never expires'}
              </p>
            </div>
          )}

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block text-sm font-medium">
              Name on the badge
              <input
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal"
              />
            </label>
            <label className="block text-sm font-medium">
              Link lasts
              <select
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal"
              >
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-sm font-medium">
            A short message (optional)
            <textarea
              value={message}
              maxLength={280}
              rows={2}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-line-strong bg-white px-3 py-2 text-[15px] font-normal"
            />
            <span className="mt-1 block text-xs font-normal text-ink-muted">{message.length}/280</span>
          </label>

          <fieldset>
            <legend className="text-sm font-medium">What people can see</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Toggle label="Personality class" hint="Your class and who it pairs with" checked={showClass} onChange={setShowClass} />
              <Toggle label="Scores" hint="The 0–100 number" checked={scores} onChange={setScores} />
              <Toggle label="Dimension readings" hint="The written description" checked={descriptions} onChange={setDescriptions} />
              <Toggle label="Date taken" hint="When you completed it" checked={date} onChange={setDate} />
            </div>
            <p className="mt-2 text-xs text-ink-muted">Your email, account and written insights are never shown.</p>
          </fieldset>

          {error && <Alert tone="error">{error}</Alert>}
          {notice && <Alert tone="success">{notice}</Alert>}

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => save(true)} loading={busy}>
              {live ? 'Save changes' : 'Turn sharing on'}
            </Button>
            {badge?.is_public && (
              <Button variant="secondary" onClick={() => save(false)} disabled={busy}>
                Turn sharing off
              </Button>
            )}
            {badge && (
              <Button variant="ghost" onClick={revoke} disabled={busy}>
                Retire this link
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
