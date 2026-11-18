import * as React from 'react';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL;

/** Shared frame for the Privacy and Terms pages: readable measure, clear headings, same header and footer as the site. */
export function LegalPage({ title, updated, intro, children }: { title: string; updated: string; intro: string; children: React.ReactNode }) {
  return (
    <>
      <SiteHeader showNav={false} />
      <main id="main" className="flex-1">
        <article className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-sm text-ink-muted">Last updated {updated}</p>
          <h1 className="mt-2 font-display text-4xl font-medium leading-tight sm:text-5xl">{title}</h1>
          <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-ink-soft">{intro}</p>
          <div className="mt-6 [&_a]:font-medium [&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-4 [&_h2]:mt-12 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-medium [&_li]:leading-relaxed [&_li]:text-ink-soft [&_p]:mt-3 [&_p]:max-w-[65ch] [&_p]:text-[15px] [&_p]:leading-relaxed [&_p]:text-ink-soft [&_ul]:mt-3 [&_ul]:max-w-[65ch] [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_ul]:text-[15px] [&_ul]:marker:text-brand-500">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}

export function ContactLine() {
  return CONTACT_EMAIL ? (
    <p>
      Questions, or want something changed or deleted? Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
    </p>
  ) : (
    <p>Questions, or want something changed or deleted? Reply to any email we have sent you, or ask the company that invited you to contact us.</p>
  );
}
