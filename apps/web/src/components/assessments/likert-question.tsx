'use client';

import { cn } from '@/lib/cn';
import type { QuestionView } from '@/lib/assessments';

const SHORT_LABELS = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

export function LikertQuestion({
  question,
  value,
  onChange,
}: {
  question: QuestionView;
  value: number | undefined;
  onChange: (value: number) => void;
}) {
  const values = question.values.length ? question.values : [1, 2, 3, 4, 5];
  const labels = question.options.length === values.length ? question.options : SHORT_LABELS;

  return (
    <fieldset className="min-w-0 border-t border-line py-6 sm:py-7">
      <legend className="sr-only">{`Question ${question.number}: ${question.text}`}</legend>
      <p className="flex gap-3 text-[17px] font-medium leading-snug text-ink sm:text-lg">
        <span className="-mt-1 w-7 shrink-0 font-display text-[1.5rem] font-bold leading-none tabular-nums text-accent-500" aria-hidden="true">
          {question.number}
        </span>
        <span>{question.text}</span>
      </p>

      <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label={question.text}>
        {values.map((v, i) => {
          const selected = value === v;
          return (
            <label
              key={v}
              className={cn(
                'group flex min-h-[48px] cursor-pointer items-center gap-4 border-b border-dashed border-line-strong px-1 py-2 transition',
                'has-[:focus-visible]:rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-2',
                selected ? 'border-solid border-brand-700' : 'hover:border-ink-muted',
              )}
            >
              <input
                type="radio"
                name={`q-${question.id}`}
                value={v}
                checked={selected}
                onChange={() => onChange(v)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-[48%_52%_46%_54%] border-[1.5px] text-sm font-semibold transition',
                  selected
                    ? 'border-accent-500 bg-accent-500 text-white'
                    : 'border-ink-muted/60 bg-transparent text-ink-muted group-hover:border-accent-500 group-hover:text-accent-600',
                )}
              >
                {v}
              </span>
              <span className={cn('text-[15px] leading-tight', selected ? 'font-semibold text-ink' : 'text-ink-soft')}>
                {labels[i]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
