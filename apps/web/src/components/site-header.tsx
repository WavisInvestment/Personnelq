import { Logo } from '@/components/logo';
import { ButtonLink } from '@/components/ui/button';

const links = [
  { href: '#classes', label: 'Your class' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#plans', label: 'Free vs full' },
];

export function SiteHeader({ showNav = true }: { showNav?: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />

        {showNav && (
          <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded text-[15px] text-ink-soft transition hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <ButtonLink href="/auth/login" variant="ghost" size="sm" className="hidden min-[400px]:inline-flex">
            Sign in
          </ButtonLink>
          <ButtonLink href="/auth/signup" size="sm">
            <span className="hidden min-[430px]:inline">Start free snapshot</span>
            <span className="min-[430px]:hidden">Start free</span>
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}
