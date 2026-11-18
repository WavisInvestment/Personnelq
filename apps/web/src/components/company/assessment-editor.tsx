'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { useConfirm } from '@/components/ui/confirm';
import { Button } from '@/components/ui/button';
import { readApiProblem } from '@/lib/assessments';
import { publishAssessment, saveAssessment, type AssessmentModel, type QuestionDraft, type SectionDraft } from '@/lib/custom-assessments';

type Q = QuestionDraft & { k: string };
type S = Omit<SectionDraft, 'questions'> & { k: string; questions: Q[] };

const uid = () => Math.random().toString(36).slice(2, 10);
const toState = (m: AssessmentModel): S[] => m.sections.map((s) => ({ ...s, k: uid(), questions: s.questions.map((q) => ({ ...q, k: uid() })) }));
const blankSection = (): S => ({ k: uid(), name: '', description: null, weight: 1, interpretation: { low: '', medium: '', high: '' }, questions: [{ k: uid(), text: '', reverse: false, weight: 1 }] });
const blankQuestion = (): Q => ({ k: uid(), text: '', reverse: false, weight: 1 });

const SECTION_WEIGHTS = [
  [1, 'Normal'],
  [2, 'Higher'],
  [3, 'High'],
  [4, 'Very high'],
  [5, 'Highest'],
] as const;
const QUESTION_WEIGHTS = [
  [1, 'Normal'],
  [2, 'Important'],
  [3, 'Very important'],
] as const;

function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[to]] = [copy[to], copy[index]];
  return copy;
}

const inputClass = 'w-full rounded-xl border border-line-strong bg-white px-3 text-[15px] disabled:bg-paper-soft disabled:text-ink-soft';

export function AssessmentEditor({ organizationId, initial, onPublished }: { organizationId: string; initial: AssessmentModel; onPublished: (m: AssessmentModel) => void }) {
  const readOnly = initial.status === 'published';
  const confirm = useConfirm();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description ?? '');
  const [allowRetake, setAllowRetake] = useState(initial.allow_retake);
  const [retakeDays, setRetakeDays] = useState(initial.retake_interval_days);
  const [sections, setSections] = useState<S[]>(() => toState(initial));
  const [saving, setSaving] = useState<'save' | 'publish' | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const payload = useMemo(
    () => ({
      name: name.trim(),
      description: description.trim() || null,
      allow_retake: allowRetake,
      retake_interval_days: retakeDays,
      sections: sections.map(({ k: _k, questions, ...s }) => ({
        ...s,
        name: s.name.trim(),
        description: s.description?.trim() || null,
        questions: questions.map(({ k: _q, ...q }) => ({ ...q, text: q.text.trim() })),
      })),
    }),
    [name, description, allowRetake, retakeDays, sections],
  );
  const lastSaved = useRef(JSON.stringify(payload));
  const dirty = JSON.stringify(payload) !== lastSaved.current;
  const totalQuestions = sections.reduce((n, s) => n + s.questions.length, 0);

  const patchSection = (k: string, patch: Partial<S>) => setSections((all) => all.map((s) => (s.k === k ? { ...s, ...patch } : s)));
  const patchQuestion = (sk: string, qk: string, patch: Partial<Q>) =>
    setSections((all) => all.map((s) => (s.k === sk ? { ...s, questions: s.questions.map((q) => (q.k === qk ? { ...q, ...patch } : q)) } : s)));

  const run = async (kind: 'save' | 'publish') => {
    setSaving(kind);
    setError('');
    setSaved('');
    try {
      const model = await saveAssessment(organizationId, initial.id, payload);
      lastSaved.current = JSON.stringify(payload);
      if (kind === 'publish') {
        const published = await publishAssessment(organizationId, initial.id);
        onPublished(published);
        return;
      }
      setSaved(`Saved at ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`);
      void model;
    } catch (err) {
      setError(readApiProblem(err).message);
    } finally {
      setSaving(null);
    }
  };

  const publish = async () => {
    const ok = await confirm({
      title: 'Publish this assessment?',
      message: 'Everyone in your company can then take it, and you won’t be able to change its questions or scoring afterwards. To change it later you create a new version.',
      confirmLabel: 'Publish',
    });
    if (ok) void run('publish');
  };

  const deleteSection = async (section: S) => {
    const n = section.questions.length;
    const ok = await confirm({
      title: 'Delete this section?',
      message: `It has ${n} statement${n === 1 ? '' : 's'}, which will be deleted with it. Nothing is saved until you save the draft.`,
      confirmLabel: 'Delete section',
      tone: 'danger',
    });
    if (ok) setSections((a) => a.filter((x) => x.k !== section.k));
  };

  return (
    <div className="space-y-8">
      {readOnly && <Alert tone="info">This assessment is published, so it can’t be changed. Create a new version to edit it.</Alert>}

      <section className="py-6 sm:py-8 border-t border-line">
        <label className="block text-sm font-medium">
          Assessment name
          <input value={name} maxLength={80} disabled={readOnly} onChange={(e) => setName(e.target.value)} placeholder="Customer service fit" className={`${inputClass} mt-1.5 h-12 font-display text-xl font-normal`} />
        </label>
        <label className="mt-5 block text-sm font-medium">
          What is it for? (shown to people before they start)
          <textarea value={description} maxLength={500} rows={2} disabled={readOnly} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} mt-1.5 py-2 font-normal`} />
        </label>
        <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
          <label className="flex items-center gap-2.5">
            <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={allowRetake} disabled={readOnly} onChange={(e) => setAllowRetake(e.target.checked)} />
            People can take it again
          </label>
          {allowRetake && (
            <label className="flex items-center gap-2.5">
              after
              <input type="number" min={1} max={730} value={retakeDays} disabled={readOnly} onChange={(e) => setRetakeDays(Math.max(1, Math.min(730, Number(e.target.value) || 1)))} className="h-10 w-20 rounded-xl border border-line-strong bg-white px-3 text-[15px] disabled:bg-paper-soft" />
              days
            </label>
          )}
        </div>
        <p className="mt-5 rounded-2xl bg-paper-soft p-4 text-sm leading-relaxed text-ink-soft">
          <strong className="font-semibold text-ink">How it works.</strong> People answer each statement on a 5-point scale from “Strongly disagree” to “Strongly agree”, so write
          <em> statements</em>, not questions (“I stay calm when a customer is upset”). Each section gets a score from 0 to 100. Mark a statement <em>reverse scored</em> when agreeing should lower the score
          (“I find it hard to stay patient”).
        </p>
      </section>

      {sections.map((s, si) => (
        <section key={s.k} aria-label={`Section ${si + 1}`} className="py-6 sm:py-8 border-t border-line">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="font-display text-xl font-medium">Section {si + 1}</h2>
            {!readOnly && (
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Move section up" disabled={si === 0} onClick={() => setSections((a) => move(a, si, -1))} className="rounded-lg p-2 text-ink-muted hover:bg-paper-soft disabled:opacity-30">
                  <ArrowUp className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Move section down" disabled={si === sections.length - 1} onClick={() => setSections((a) => move(a, si, 1))} className="rounded-lg p-2 text-ink-muted hover:bg-paper-soft disabled:opacity-30">
                  <ArrowDown className="h-4 w-4" aria-hidden="true" />
                </button>
                <button type="button" aria-label="Delete section" onClick={() => void deleteSection(s)} className="rounded-lg p-2 text-ink-muted hover:bg-paper-soft hover:text-accent-600">
                  <Trash className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_12rem]">
            <label className="block text-sm font-medium">
              Section name
              <input value={s.name} maxLength={60} disabled={readOnly} onChange={(e) => patchSection(s.k, { name: e.target.value })} placeholder="Empathy" className={`${inputClass} mt-1.5 h-11 font-normal`} />
            </label>
            <label className="block text-sm font-medium">
              Counts towards the total
              <select value={s.weight} disabled={readOnly} onChange={(e) => patchSection(s.k, { weight: Number(e.target.value) })} className={`${inputClass} mt-1.5 h-11 font-normal`}>
                {SECTION_WEIGHTS.map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 block text-sm font-medium">
            About this section (optional)
            <input value={s.description ?? ''} maxLength={300} disabled={readOnly} onChange={(e) => patchSection(s.k, { description: e.target.value })} className={`${inputClass} mt-1.5 h-11 font-normal`} />
          </label>

          <h3 className="mt-6 text-sm font-semibold">Statements</h3>
          <ol className="mt-3 space-y-3">
            {s.questions.map((q, qi) => (
              <li key={q.k} className="rounded-2xl border border-line p-4">
                <div className="flex gap-3">
                  <span className="mt-2.5 w-6 shrink-0 text-sm tabular-nums text-ink-muted">{qi + 1}.</span>
                  <textarea
                    aria-label={`Statement ${qi + 1} in section ${si + 1}`}
                    value={q.text}
                    maxLength={300}
                    rows={2}
                    disabled={readOnly}
                    onChange={(e) => patchQuestion(s.k, q.k, { text: e.target.value })}
                    placeholder="I listen carefully before I answer."
                    className={`${inputClass} py-2`}
                  />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 pl-9 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 accent-brand-700" checked={q.reverse} disabled={readOnly} onChange={(e) => patchQuestion(s.k, q.k, { reverse: e.target.checked })} />
                    Reverse scored
                  </label>
                  <label className="flex items-center gap-2">
                    Weight
                    <select value={q.weight} disabled={readOnly} onChange={(e) => patchQuestion(s.k, q.k, { weight: Number(e.target.value) })} className="h-9 rounded-lg border border-line-strong bg-white px-2 text-sm disabled:bg-paper-soft">
                      {QUESTION_WEIGHTS.map(([v, label]) => (
                        <option key={v} value={v}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!readOnly && (
                    <span className="ml-auto flex items-center gap-1">
                      <button type="button" aria-label="Move statement up" disabled={qi === 0} onClick={() => patchSection(s.k, { questions: move(s.questions, qi, -1) })} className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-soft disabled:opacity-30">
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" aria-label="Move statement down" disabled={qi === s.questions.length - 1} onClick={() => patchSection(s.k, { questions: move(s.questions, qi, 1) })} className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-soft disabled:opacity-30">
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button type="button" aria-label="Delete statement" onClick={() => patchSection(s.k, { questions: s.questions.filter((x) => x.k !== q.k) })} className="rounded-lg p-1.5 text-ink-muted hover:bg-paper-soft hover:text-accent-600">
                        <Trash className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {!readOnly && (
            <Button type="button" variant="secondary" size="sm" className="mt-3" onClick={() => patchSection(s.k, { questions: [...s.questions, blankQuestion()] })}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add a statement
            </Button>
          )}

          <h3 className="mt-8 text-sm font-semibold">What the score means</h3>
          <p className="mt-1 text-sm text-ink-muted">Shown to the person after they finish. Leave one blank to use a plain default sentence.</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            {(['low', 'medium', 'high'] as const).map((band) => (
              <label key={band} className="block text-sm font-medium">
                {band === 'low' ? 'Low score (0 to 40)' : band === 'medium' ? 'Medium score (41 to 60)' : 'High score (61 to 100)'}
                <textarea value={s.interpretation[band]} maxLength={500} rows={4} disabled={readOnly} onChange={(e) => patchSection(s.k, { interpretation: { ...s.interpretation, [band]: e.target.value } })} className={`${inputClass} mt-1.5 py-2 font-normal`} />
              </label>
            ))}
          </div>
        </section>
      ))}

      {!readOnly && (
        <Button type="button" variant="secondary" onClick={() => setSections((a) => [...a, blankSection()])} disabled={sections.length >= 10}>
          <Plus className="h-4 w-4" aria-hidden="true" /> Add a section
        </Button>
      )}

      {!readOnly && (
        <div className="sticky bottom-0 z-30 border-t border-line bg-paper/95 p-4 backdrop-blur">
          {error && <Alert tone="error" className="mb-3">{error}</Alert>}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => run('save')} loading={saving === 'save'} disabled={saving !== null || !dirty}>
              Save draft
            </Button>
            <Button onClick={publish} loading={saving === 'publish'} disabled={saving !== null}>
              Publish
            </Button>
            <p className="text-sm text-ink-muted" role="status">
              {sections.length} {sections.length === 1 ? 'section' : 'sections'}, {totalQuestions} {totalQuestions === 1 ? 'statement' : 'statements'}
              {dirty ? ' · unsaved changes' : saved ? ` · ${saved}` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
