'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { getCompanyProfile, termsFor, updateCompanyProfile, type CompanyProfile } from '@/lib/company';

const label = 'text-xs font-medium uppercase tracking-wide text-ink-muted';

function Fact({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className={label}>{name}</dt>
      <dd className="mt-1 break-words text-[15px]">{children ?? '—'}</dd>
    </div>
  );
}

/** The company's own details: who runs it, its plan and seats, and (for an administrator) a way to correct the name and contact. */
export function ProfileTab({ organizationId, orgType, onChanged }: { organizationId: string; orgType: string; onChanged: () => void }) {
  const terms = termsFor(orgType);
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [form, setForm] = useState({ name: '', admin_name: '', admin_phone: '' });

  const load = () =>
    getCompanyProfile(organizationId)
      .then((p) => {
        setProfile(p);
        setForm({ name: p.name, admin_name: p.admin_name, admin_phone: p.admin_phone ?? '' });
      })
      .catch((err) => setError(readApiProblem(err).message));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!profile) return <div className="h-64 animate-pulse border-t border-line" aria-hidden="true" />;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const r = await updateCompanyProfile(organizationId, { name: form.name, admin_name: form.admin_name, admin_phone: form.admin_phone });
      setSaved(r.changed ? 'Saved.' : 'Nothing was changed.');
      setEditing(false);
      await load();
      onChanged();
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {profile.status === 'suspended' && (
        <Alert tone="error">
          <span className="font-medium">This {terms.org} is suspended</span>
          {profile.suspended_reason ? `: ${profile.suspended_reason}.` : '.'} You can still look around, but you can’t invite people, send reminders or approve retakes, and people can’t take assessments through it. Contact support to have it restored.
        </Alert>
      )}
      {saved && <Alert tone="success">{saved}</Alert>}

      <section aria-labelledby="co-details" className="py-6 sm:py-8 border-t border-line">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 id="co-details" className="font-display text-2xl font-medium">
            Details
          </h2>
          {profile.can_edit && !editing && (
            <Button variant="secondary" size="sm" onClick={() => { setSaved(''); setEditing(true); }}>
              Edit
            </Button>
          )}
        </div>

        {editing ? (
          <form onSubmit={save} className="mt-5 grid max-w-xl gap-4">
            <label className="block text-sm font-medium">
              Name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={100} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal" />
            </label>
            <label className="block text-sm font-medium">
              Contact name
              <input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} required maxLength={100} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal" />
            </label>
            <label className="block text-sm font-medium">
              Contact phone (optional)
              <input value={form.admin_phone} onChange={(e) => setForm({ ...form, admin_phone: e.target.value })} maxLength={40} className="mt-1.5 h-11 w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] font-normal" />
            </label>
            <p className="text-xs text-ink-muted">The contact email is the sign-in address of the account that created the {terms.org}; change it from that account’s page.</p>
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                Save
              </Button>
              <Button type="button" variant="ghost" onClick={() => { setEditing(false); load(); }}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <dl className="mt-5 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <Fact name="Name">{profile.name}</Fact>
            <Fact name="Kind">{terms.org.charAt(0).toUpperCase() + terms.org.slice(1)}</Fact>
            <Fact name="Created">{formatDate(profile.created_at)}</Fact>
            <Fact name="Contact name">{profile.admin_name}</Fact>
            <Fact name="Contact email">{profile.admin_email}</Fact>
            <Fact name="Contact phone">{profile.admin_phone}</Fact>
            <Fact name="Plan">
              {profile.plan ? `${profile.plan.name}${profile.plan.end_date ? `, ${profile.plan.active ? 'until' : 'ended'} ${formatDate(profile.plan.end_date)}` : ''}` : 'No plan'}
            </Fact>
            <Fact name="Seats">{profile.plan ? `${profile.people} of ${profile.plan.seats_limit} used` : `${profile.people} people`}</Fact>
          </dl>
        )}
      </section>

      <section aria-labelledby="co-leaders" className="py-6 sm:py-8 border-t border-line">
        <h2 id="co-leaders" className="font-display text-2xl font-medium">
          Administrators and HR
        </h2>
        <ul className="mt-4 divide-y divide-line">
          {profile.leaders.map((p) => (
            <li key={p.email} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-ink-muted">{p.email}</p>
              </div>
              <span className="rounded-full bg-paper-soft px-2.5 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-inset ring-line-strong">{p.role_name}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-muted">
          Change who holds these roles from the{' '}
          <Link href="/company?tab=people" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            People tab
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
