'use client';

import * as React from 'react';
import { Eye, EyeSlash } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';

interface FieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  labelAction?: React.ReactNode;
}

const inputClass =
  'block h-11 w-full rounded-xl border bg-white px-3.5 text-[15px] text-ink placeholder:text-ink-muted/70 transition focus-visible:ring-2 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-paper-soft';

export const Field = React.forwardRef<HTMLInputElement, FieldProps>(
  ({ label, hint, error, labelAction, className, id, ...props }, ref) => {
    const autoId = React.useId();
    const inputId = id ?? autoId;
    const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <label htmlFor={inputId} className="text-sm font-medium text-ink">
            {label}
          </label>
          {labelAction}
        </div>
        <input
          suppressHydrationWarning
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            inputClass,
            error
              ? 'border-red-400 focus-visible:ring-red-300'
              : 'border-line-strong hover:border-ink-muted focus-visible:border-brand-500 focus-visible:ring-brand-200',
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-red-700">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-ink-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Field.displayName = 'Field';

export const PasswordField = React.forwardRef<
  HTMLInputElement,
  Omit<FieldProps, 'type' | 'children'>
>(({ className, ...props }, ref) => {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Field ref={ref} type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
      <button
        suppressHydrationWarning
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="absolute right-1.5 top-[30px] flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-paper-soft hover:text-ink"
      >
        {visible ? <EyeSlash className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
      </button>
    </div>
  );
});
PasswordField.displayName = 'PasswordField';

const rules = [
  { label: '8+ characters', test: (v: string) => v.length >= 8 },
  { label: 'Uppercase letter', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Lowercase letter', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Number', test: (v: string) => /\d/.test(v) },
  { label: 'One of @ $ ! % * ? &', test: (v: string) => /[@$!%*?&]/.test(v), wide: true },
];

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5" aria-label="Password requirements">
      {rules.map((rule) => {
        const met = rule.test(value);
        return (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-2 text-[13px] transition-colors',
              'wide' in rule && rule.wide && 'col-span-2 sm:col-span-1',
              met ? 'text-brand-700' : 'text-ink-muted',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                met ? 'border-brand-600 bg-brand-600 text-white' : 'border-line-strong bg-white',
              )}
            >
              {met && (
                <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2.5 6.2 2.3 2.3 4.7-5" />
                </svg>
              )}
            </span>
            <span>
              {rule.label}
              <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function isPasswordValid(value: string) {
  return rules.every((rule) => rule.test(value));
}
