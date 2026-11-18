import Link from 'next/link';
import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('h-8 w-8', className)} aria-hidden="true">
      <path d="M8 14C8 9 12 6 17 6h31c6 0 10 4 10 10v33c0 6-4 10-10 10H16C10 59 6 55 6 49Z" fill="#172f23" />
      <path d="M32 14l17 12-6 21H21l-6-21Z" fill="none" stroke="#b9d0bf" strokeWidth="1.8" strokeLinejoin="round" strokeDasharray="1 4.5" strokeLinecap="round" />
      <ellipse cx="32" cy="14" rx="4.6" ry="4.2" fill="#8b7cf6" />
      <ellipse cx="49" cy="26" rx="4.2" ry="4.6" fill="#3b8fd9" />
      <ellipse cx="43" cy="47" rx="4.6" ry="4.1" fill="#f5a623" />
      <ellipse cx="21" cy="47" rx="4.2" ry="4.5" fill="#ec5f87" />
      <ellipse cx="15" cy="26" rx="4.5" ry="4.2" fill="#2fb59a" />
    </svg>
  );
}

export function Logo({
  href = '/',
  tone = 'dark',
  className,
}: {
  href?: string;
  tone?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <Link href={href} className={cn('inline-flex items-center gap-2.5 rounded-lg', className)}>
      <LogoMark />
      <span
        className={cn(
          'whitespace-nowrap font-display text-[19px] font-bold tracking-[-0.03em]',
          tone === 'light' ? 'text-white' : 'text-ink',
        )}
      >
        Personnelq
      </span>
    </Link>
  );
}
