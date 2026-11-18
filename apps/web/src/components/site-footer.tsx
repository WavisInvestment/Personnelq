import Link from 'next/link';
import { Logo } from '@/components/logo';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-paper-soft">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-12 sm:px-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            Understand your personality, and share it on your own terms.
          </p>
        </div>

        <nav aria-label="Footer" className="flex gap-12 text-sm">
          <ul className="space-y-2.5">
            <li className="font-medium text-ink">Product</li>
            <li>
              <a href="#how-it-works" className="text-ink-muted hover:text-ink">
                How it works
              </a>
            </li>
            <li>
              <a href="#plans" className="text-ink-muted hover:text-ink">
                Free vs full
              </a>
            </li>
          </ul>
          <ul className="space-y-2.5">
            <li className="font-medium text-ink">Legal</li>
            <li>
              <Link href="/privacy" className="text-ink-muted hover:text-ink">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-ink-muted hover:text-ink">
                Terms of use
              </Link>
            </li>
          </ul>
          <ul className="space-y-2.5">
            <li className="font-medium text-ink">Account</li>
            <li>
              <Link href="/auth/login" className="text-ink-muted hover:text-ink">
                Sign in
              </Link>
            </li>
            <li>
              <Link href="/auth/signup" className="text-ink-muted hover:text-ink">
                Create account
              </Link>
            </li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-5 py-5 text-[13px] text-ink-muted sm:px-8">
          &copy; <span suppressHydrationWarning>{new Date().getFullYear()}</span> Personnelq. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
