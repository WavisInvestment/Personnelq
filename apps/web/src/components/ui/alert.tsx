import * as React from 'react';
import { CheckCircle, Info, WarningCircle } from '@phosphor-icons/react/dist/ssr';
import { cn } from '@/lib/cn';

const tones = {
  error: { box: 'border-red-200 bg-red-50 text-red-900', iconColor: 'text-red-600', Icon: WarningCircle },
  success: { box: 'border-brand-200 bg-brand-50 text-brand-900', iconColor: 'text-brand-600', Icon: CheckCircle },
  info: { box: 'border-line-strong bg-paper-soft text-ink-soft', iconColor: 'text-ink-muted', Icon: Info },
};

export function Alert({
  tone = 'info',
  children,
  className,
}: {
  tone?: keyof typeof tones;
  children: React.ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm leading-relaxed', t.box, className)}
    >
      <t.Icon className={cn('mt-0.5 h-5 w-5 shrink-0', t.iconColor)} weight="regular" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
