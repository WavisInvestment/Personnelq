import type { InvitationDetails } from '@/lib/use-invitation';
import { termsFor, type CompanyRole } from '@/lib/company';

/** What the person is joining and as what. Read-only: it comes from the invitation and can't be changed here. */
export function InvitationSummary({ info }: { info: InvitationDetails }) {
  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 text-sm">
      <p className="text-ink-soft">
        <strong className="font-semibold text-ink">{info.inviter_name}</strong> invited you to join <strong className="font-semibold text-ink">{info.organization_name}</strong>.
      </p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="text-ink-muted">Role</dt>
        <dd className="font-medium text-ink">{termsFor(info.organization_type).roles[info.role.key as CompanyRole] ?? info.role.name}</dd>
        {info.job_title && (
          <>
            <dt className="text-ink-muted">Job title</dt>
            <dd className="font-medium text-ink">{info.job_title}</dd>
          </>
        )}
        {info.department && (
          <>
            <dt className="text-ink-muted">Team</dt>
            <dd className="font-medium text-ink">{info.department}</dd>
          </>
        )}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        The role and email address come from the invitation and can’t be changed. {info.organization_name} will see the results you take through it.
      </p>
    </div>
  );
}
