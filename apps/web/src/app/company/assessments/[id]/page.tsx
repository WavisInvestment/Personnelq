'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppShell, useSessionUser } from '@/components/app-shell';
import { AssessmentEditor } from '@/components/company/assessment-editor';
import { Alert } from '@/components/ui/alert';
import { useConfirm } from '@/components/ui/confirm';
import { Button, ButtonLink } from '@/components/ui/button';
import { formatDate, readApiProblem } from '@/lib/assessments';
import { archiveAssessment, getAssessment, newVersion, type AssessmentModel } from '@/lib/custom-assessments';

function EditorFlow({ id }: { id: string }) {
  const user = useSessionUser();
  const router = useRouter();
  const confirm = useConfirm();
  const org = user.organizations?.find((o) => o.role === 'admin' || o.role === 'hr');
  const [model, setModel] = useState<AssessmentModel | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<'version' | 'archive' | null>(null);

  useEffect(() => {
    if (!org) return;
    let cancelled = false;
    getAssessment(org.id, id)
      .then((m) => !cancelled && setModel(m))
      .catch((err) => !cancelled && setError(readApiProblem(err).status === 404 ? 'We couldn’t find that assessment.' : readApiProblem(err).message));
    return () => {
      cancelled = true;
    };
  }, [org, id]);

  if (!org || error) {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <Alert tone={error ? 'error' : 'info'}>{error || 'This page is for administrators and HR.'}</Alert>
        <ButtonLink href="/company" variant="secondary">
          Back to the dashboard
        </ButtonLink>
      </div>
    );
  }
  if (!model) return <div className="h-96 animate-pulse border-t border-line" aria-hidden="true" />;

  const makeVersion = async () => {
    setBusy('version');
    try {
      router.push(`/company/assessments/${await newVersion(org.id, model.id)}`);
    } catch (err) {
      setError(readApiProblem(err).message);
      setBusy(null);
    }
  };

  const archive = async () => {
    const published = model.status === 'published';
    const ok = await confirm({
      title: published ? 'Archive this assessment?' : 'Delete this draft?',
      message: published ? 'People can no longer start it, attempts in progress end, and finished results stay with the people who took them.' : 'The draft and everything you wrote in it will be removed.',
      confirmLabel: published ? 'Archive' : 'Delete draft',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy('archive');
    try {
      await archiveAssessment(org.id, model.id);
      router.push('/company');
    } catch (err) {
      setError(readApiProblem(err).message);
      setBusy(null);
    }
  };

  return (
    <div className="animate-fade-up">
      <Link href="/company" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
        Back to the dashboard
      </Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-brand-700">{org.name} · Custom assessment</p>
          <h1 className="mt-1 font-display text-4xl font-medium leading-tight">{model.status === 'draft' ? 'Edit assessment' : model.name}</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Version {model.version} · {model.status === 'published' ? `Published ${formatDate(model.published_at)}` : 'Draft, not visible to your team'}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {model.status === 'published' && (
            <>
              <ButtonLink href={`/company/assessments/${model.id}/results`} variant="secondary">
                View results
              </ButtonLink>
              <Button variant="secondary" onClick={makeVersion} loading={busy === 'version'}>
                Create new version
              </Button>
            </>
          )}
          <Button variant="ghost" onClick={archive} loading={busy === 'archive'}>
            {model.status === 'published' ? 'Archive' : 'Delete draft'}
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <AssessmentEditor key={model.id + model.status} organizationId={org.id} initial={model} onPublished={setModel} />
      </div>
    </div>
  );
}

export default function AssessmentEditorPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <AppShell>
      <EditorFlow id={id} />
    </AppShell>
  );
}
