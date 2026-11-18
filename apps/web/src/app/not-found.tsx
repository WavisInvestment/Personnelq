import { SiteHeader } from '@/components/site-header';
import { TraitRadar } from '@/components/trait-radar';
import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <>
      <SiteHeader showNav={false} />
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="max-w-md text-center animate-fade-up">
          <div className="mx-auto w-48">
            <TraitRadar muted />
          </div>
          <p className="mt-6 text-sm font-medium text-brand-700">Error 404</p>
          <h1 className="mt-2 font-display text-4xl font-medium">We couldn’t find that page</h1>
          <p className="mt-3 text-ink-muted">
            The link may be out of date, or the page may have moved.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/" size="lg">
              Back to home
            </ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary" size="lg">
              Go to dashboard
            </ButtonLink>
          </div>
        </div>
      </main>
    </>
  );
}
