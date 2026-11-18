'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppShell, useSessionUser } from '@/components/app-shell';
import { AssessmentsTab } from '@/components/company/assessments-tab';
import { InvitationsTab } from '@/components/company/invitations-tab';
import { OverviewTab } from '@/components/company/overview-tab';
import { PeopleTab } from '@/components/company/people-tab';
import { ClassesTab } from '@/components/company/classes-tab';
import { ProfileTab } from '@/components/company/profile-tab';
import { Alert } from '@/components/ui/alert';
import { Button, ButtonLink } from '@/components/ui/button';
import { readApiProblem } from '@/lib/assessments';
import { cn } from '@/lib/cn';
import { getDashboard, getMembers, getStaff, listInvitations, termsFor, type DashboardData, type InvitationRow, type PausedMember, type StaffRow, type TeamMember } from '@/lib/company';
import { listRetakes, type RetakeRow } from '@/lib/retakes';

type Tab = 'overview' | 'people' | 'classes' | 'assessments' | 'invitations' | 'company';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'people', label: 'People' },
  { key: 'classes', label: 'Classes' },
  { key: 'assessments', label: 'Assessments' },
  { key: 'invitations', label: 'Invitations' },
  { key: 'company', label: 'Company' },
];

function CompanyFlow() {
  const user = useSessionUser();
  const org = user.organizations?.find((o) => o.role === 'admin' || o.role === 'hr');
  const terms = termsFor(org?.type);
  const [tab, setTab] = useState<Tab>('overview');
  useEffect(() => {
    // a link from an email can open a tab directly (?tab=people)
    const wanted = new URLSearchParams(window.location.search).get('tab');
    if (TABS.some((t) => t.key === wanted)) setTab(wanted as Tab);
  }, []);
  const [data, setData] = useState<DashboardData | null>(null);
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [paused, setPaused] = useState<PausedMember[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[] | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [retakes, setRetakes] = useState<RetakeRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!org) return;
    try {
      const [d, m, i] = await Promise.all([getDashboard(org.id), getMembers(org.id), listInvitations(org.id)]);
      setData(d);
      setMembers(m.team);
      setPaused(m.paused);
      setInvitations(i);
      setError('');
      // Secondary lists: the dashboard still works if either is unavailable.
      listRetakes(org.id).then(setRetakes).catch(() => setRetakes([]));
      if (org.role === 'admin') getStaff(org.id).then(setStaff).catch(() => setStaff([]));
    } catch (err) {
      const p = readApiProblem(err);
      setError(p.status === 403 ? 'You don’t have access to this company’s dashboard.' : p.message);
    }
  }, [org]);

  useEffect(() => {
    load();
  }, [load]);

  if (!org) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone="info">This dashboard is for administrators and HR.</Alert>
        <ButtonLink href="/dashboard" variant="secondary">
          Back to dashboard
        </ButtonLink>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <p className="text-sm font-medium text-brand-700">{org.name}</p>
      <h1 className="mt-1 font-display text-4xl font-medium leading-tight">{terms.title}</h1>

      {data?.organization.status === 'suspended' && (
        <Alert tone="error" className="mt-6">
          <span className="font-medium">This {terms.org} is suspended</span>
          {data.organization.suspended_reason ? `: ${data.organization.suspended_reason}.` : '.'} You can still look around, but you can’t invite people, send reminders or approve retakes, and people can’t take assessments through it. Contact support to have it restored.
        </Alert>
      )}

      <div role="tablist" aria-label="Company sections" className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px rounded-t-lg border-b-2 px-4 py-2.5 text-[15px] font-medium transition-colors',
              tab === t.key ? 'border-brand-700 text-brand-800' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.key === 'people' && retakes.some((r) => r.status === 'requested') && (
              <span className="ml-2 rounded-full bg-accent-100 px-1.5 py-0.5 text-xs text-accent-600">{retakes.filter((r) => r.status === 'requested').length}</span>
            )}
            {t.key === 'invitations' && data && data.team.pending_invitations > 0 && (
              <span className="ml-2 rounded-full bg-accent-100 px-1.5 py-0.5 text-xs text-accent-600">{data.team.pending_invitations}</span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-8" role="tabpanel">
        {error && (
          <div className="space-y-4">
            <Alert tone="error">{error}</Alert>
            <Button variant="secondary" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        )}

        {!error && (!data || !members || !invitations) && <div className="h-64 animate-pulse border-t border-line" aria-hidden="true" />}

        {!error && data && members && invitations && (
          <>
            {tab === 'overview' && <OverviewTab data={data} isAdmin={org.role === 'admin'} onInvite={() => setTab('invitations')} />}
            {tab === 'people' && <PeopleTab organizationId={org.id} orgType={org.type} members={members} paused={paused} staff={staff} retakes={retakes} isAdmin={org.role === 'admin'} meId={user.id} canRemove onChanged={load} onInvite={() => setTab('invitations')} />}
            {tab === 'assessments' && <AssessmentsTab organizationId={org.id} />}
            {tab === 'classes' && <ClassesTab organizationId={org.id} orgType={org.type} />}
            {tab === 'company' && <ProfileTab organizationId={org.id} orgType={org.type} onChanged={load} />}
            {tab === 'invitations' && <InvitationsTab organizationId={org.id} orgType={org.type} invitations={invitations} isAdmin={org.role === 'admin'} onChanged={load} />}
          </>
        )}
      </div>
    </div>
  );
}

export default function CompanyPage() {
  return (
    <AppShell>
      <CompanyFlow />
    </AppShell>
  );
}
