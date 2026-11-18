'use client';

import { ACCOUNT_TYPE_OPTIONS, type AccountType } from '@/lib/account-types';
import { Buildings, GraduationCap, User, UsersThree } from '@phosphor-icons/react';
import { cn } from '@/lib/cn';

const ICONS = { individual: User, corporate: Buildings, school: GraduationCap, church: UsersThree } as const;

export function AccountTypePicker({
  value,
  onChange,
}: {
  value: AccountType;
  onChange: (value: AccountType) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-ink">I’m signing up as</legend>
      <div className="grid grid-cols-2 gap-3">
        {ACCOUNT_TYPE_OPTIONS.map((option) => {
          const selected = value === option.value;
          const Icon = ICONS[option.value];
          return (
            <label
              key={option.value}
              className={cn(
                'relative flex min-h-[92px] cursor-pointer flex-col rounded-xl border p-3.5 transition',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500 has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-white',
                selected
                  ? 'border-brand-600 bg-brand-50 shadow-sm'
                  : 'border-line-strong bg-white hover:border-ink-muted hover:bg-paper',
              )}
            >
              <input
                type="radio"
                name="account_type"
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span className="flex items-start justify-between">
                <Icon className={cn('h-6 w-6', selected ? 'text-brand-700' : 'text-ink-muted')} aria-hidden="true" />
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex h-5 w-5 items-center justify-center rounded-full border transition',
                    selected ? 'border-brand-700 bg-brand-700 text-white' : 'border-line-strong bg-white',
                  )}
                >
                  {selected && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m2.5 6.2 2.3 2.3 4.7-5" />
                    </svg>
                  )}
                </span>
              </span>
              <span className="mt-2.5 text-[15px] font-medium leading-tight text-ink">{option.label}</span>
              <span className="mt-0.5 text-[13px] leading-snug text-ink-muted">{option.hint}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
