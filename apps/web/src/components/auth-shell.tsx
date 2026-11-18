import * as React from 'react';
import { Logo } from '@/components/logo';

const highlights = [
  'A free snapshot in about five minutes',
  'Plain-language insights across work, communication and relationships',
  'You decide exactly what your badge shows',
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[5fr_6fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-brand-950 p-12 text-white lg:flex">

        <Logo tone="light" className="relative" />

        <div className="relative">
          <h2 className="font-display text-[2.7rem] font-extrabold leading-[1.02] tracking-[-0.04em] text-white">
            Understand how you&rsquo;re <em className="text-accent-400">wired</em>.
          </h2>
          <ul className="mt-6 space-y-3">
            {highlights.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] leading-snug text-brand-100">
                <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="10" cy="10" r="8" opacity="0.5" />
                  <path d="m6.8 10.2 2.2 2.2 4.2-4.6" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-brand-300/80">
          Built on decades of research in personality science.
        </p>
      </aside>

      <main id="main" className="flex flex-col px-5 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[440px] animate-fade-up">
            <div>
              <h1 className="font-display text-[1.9rem] font-medium leading-tight">{title}</h1>
              {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-ink-muted">{subtitle}</p>}
              <div className="mt-7">{children}</div>
            </div>
            {footer && <div className="mt-6 text-center text-sm text-ink-muted">{footer}</div>}
          </div>
        </div>
      </main>
    </div>
  );
}
