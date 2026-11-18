import { cn } from '@/lib/cn';
import { humanize } from '@/lib/admin';

const good = ['active', 'success', 'completed', 'verified'];
const warn = ['pending', 'inactive', 'in_progress', 'invited', 'trialing'];
const bad = ['failed', 'suspended', 'past_due', 'cancelled', 'expired', 'locked'];

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const tone = good.includes(status)
    ? 'bg-brand-50 text-brand-700 ring-brand-200'
    : warn.includes(status)
      ? 'bg-amber-50 text-amber-800 ring-amber-200'
      : bad.includes(status)
        ? 'bg-red-50 text-red-700 ring-red-200'
        : 'bg-paper-soft text-ink-soft ring-line-strong';

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        tone,
        className,
      )}
    >
      {humanize(status)}
    </span>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full bg-paper-soft px-2.5 py-0.5 text-xs font-medium text-ink-soft ring-1 ring-inset ring-line-strong',
        className,
      )}
    >
      {children}
    </span>
  );
}
