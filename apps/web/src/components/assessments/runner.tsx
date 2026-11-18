'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { LikertQuestion } from '@/components/assessments/likert-question';
import { cn } from '@/lib/cn';
import { completeSubmission, readApiProblem, saveAnswers, type SubmissionView } from '@/lib/assessments';

const PAGE_SIZE = 5;
const SAVE_DELAY_MS = 350;
const RETRY_DELAY_MS = 3000;

type SaveState = 'saved' | 'saving' | 'error';

export function AssessmentRunner({
  submission,
  onFinished,
}: {
  submission: SubmissionView;
  onFinished: (resultId: string) => void;
}) {
  const { questions, total } = submission;
  const pageCount = Math.ceil(questions.length / PAGE_SIZE);

  const [answers, setAnswers] = useState<Record<string, number>>(submission.answers);
  const [page, setPage] = useState(() => {
    const firstUnanswered = questions.findIndex((q) => submission.answers[q.id] === undefined);
    return firstUnanswered === -1 ? pageCount - 1 : Math.floor(firstUnanswered / PAGE_SIZE);
  });
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);

  // Answers chosen but not yet confirmed saved. A ref, because saving must not wait for a re-render.
  const pending = useRef(new Map<string, number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    // Wait for a save already under way so two requests never race each other.
    if (inFlight.current) await inFlight.current;
    if (pending.current.size === 0) return true;

    const batch = [...pending.current].map(([question_id, value]) => ({ question_id, value }));
    setSaveState('saving');

    const run = saveAnswers(submission.id, batch).then(
      () => {
        for (const { question_id, value } of batch) {
          // Keep an entry the person changed again while this request was in flight.
          if (pending.current.get(question_id) === value) pending.current.delete(question_id);
        }
        setError('');
        setSaveState(pending.current.size ? 'saving' : 'saved');
        return true;
      },
      (err) => {
        setSaveState('error');
        setError(readApiProblem(err, 'Your last answers couldn’t be saved.').message);
        // Keep trying in the background so a dropped connection heals itself.
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), RETRY_DELAY_MS);
        return false;
      },
    );
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;

    if (ok && pending.current.size > 0) return flush();
    return ok;
  }, [submission.id]);

  const choose = (questionId: string, value: number) => {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    pending.current.set(questionId, value);
    setSaveState('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  };

  // Warn before leaving with answers that haven't reached the server.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (pending.current.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    heading.current?.focus({ preventScroll: true });
  }, [page]);

  const pageQuestions = useMemo(() => questions.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE), [questions, page]);
  const answeredCount = Object.keys(answers).length;
  const pageComplete = pageQuestions.every((q) => answers[q.id] !== undefined);
  const isLast = page === pageCount - 1;
  const percent = Math.round((answeredCount / total) * 100);
  const firstNumber = page * PAGE_SIZE + 1;
  const lastNumber = Math.min(total, (page + 1) * PAGE_SIZE);

  const go = async (delta: 1 | -1) => {
    if (delta === 1 && !(await flush())) return;
    setPage((p) => p + delta);
  };

  const finish = async () => {
    setFinishing(true);
    setError('');
    if (!(await flush())) {
      setFinishing(false);
      return;
    }
    try {
      const result = await completeSubmission(submission.id);
      onFinished(result.id);
    } catch (err) {
      const problem = readApiProblem(err, 'We couldn’t finish your assessment. Please try again.');
      setError(problem.message);
      setFinishing(false);
    }
  };

  return (
    <div>
      <div className="sticky top-16 z-30 -mx-5 border-b border-line/70 bg-paper/90 px-5 py-3 backdrop-blur-md sm:-mx-8 sm:px-8 max-sm:top-[105px]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 text-sm">
          <p className="font-medium text-ink" aria-live="polite">
            Questions {firstNumber}–{lastNumber} <span className="text-ink-muted">of {total}</span>
          </p>
          <p className="text-ink-muted">{percent}% answered</p>
        </div>
        <div
          className="mx-auto mt-2 h-1.5 max-w-3xl overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Assessment progress"
        >
          <div className="h-full rounded-full bg-brand-600 transition-[width] duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-3xl">
        <h1 ref={heading} tabIndex={-1} className="font-display text-3xl font-medium leading-tight outline-none">
          {submission.assessment.name}
        </h1>
        <p className="mt-2 text-[15px] text-ink-muted">
          How much do you agree with each statement? There are no right or wrong answers; go with your first instinct.
        </p>

        <div className="mt-8 space-y-4">
          {pageQuestions.map((q) => (
            <LikertQuestion key={q.id} question={q} value={answers[q.id]} onChange={(v) => choose(q.id, v)} />
          ))}
        </div>

        {error && (
          <Alert tone="error" className="mt-6">
            {error}
          </Alert>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
          <Button variant="secondary" size="lg" onClick={() => go(-1)} disabled={page === 0 || finishing}>
            Back
          </Button>

          <p
            className={cn('order-last w-full text-center text-sm sm:order-none sm:w-auto', saveState === 'error' ? 'text-red-700' : 'text-ink-muted')}
            aria-live="polite"
          >
            {saveState === 'saving' && 'Saving…'}
            {saveState === 'saved' && 'Progress saved'}
            {saveState === 'error' && 'Not saved yet — we’ll retry'}
          </p>

          {isLast ? (
            <Button size="lg" onClick={finish} loading={finishing} disabled={answeredCount < total}>
              {finishing ? 'Scoring' : 'Finish and see results'}
            </Button>
          ) : (
            <Button size="lg" onClick={() => go(1)} disabled={!pageComplete}>
              Next
            </Button>
          )}
        </div>

        {!pageComplete && !isLast && (
          <p className="mt-3 text-right text-sm text-ink-muted">Answer all five to continue.</p>
        )}
        {isLast && answeredCount < total && (
          <p className="mt-3 text-right text-sm text-ink-muted">
            {total - answeredCount} {total - answeredCount === 1 ? 'question is' : 'questions are'} still unanswered.
          </p>
        )}

        <p className="mt-10 text-center text-sm text-ink-muted">
          Your answers save automatically. You can leave and{' '}
          <Link href="/dashboard" className="font-medium text-brand-700 underline-offset-4 hover:underline">
            pick this up later
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
