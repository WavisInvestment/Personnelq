'use client';

import { MagnifyingGlass } from '@phosphor-icons/react';
import * as React from 'react';
import { cn } from '@/lib/cn';

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-medium leading-tight sm:text-4xl">{title}</h1>
        <p className="mt-1.5 text-[15px] text-ink-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

const controlClass =
  'h-10 rounded-xl border border-line-strong bg-white text-sm text-ink transition hover:border-ink-muted focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-200 focus-visible:ring-offset-0';

export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
      <label htmlFor="admin-search" className="sr-only">
        {label}
      </label>
      <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
      <input
        id="admin-search"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(controlClass, 'w-full pl-9 pr-3 placeholder:text-ink-muted/70')}
      />
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="sr-only" htmlFor={`filter-${label}`}>
        {label}
      </label>
      <select
        id={`filter-${label}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(controlClass, 'cursor-pointer pl-3 pr-8')}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-center gap-3">{children}</div>;
}
