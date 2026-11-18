import type { Metadata } from 'next';

// A badge link is a private-by-obscurity address: keep it out of search engines and don't leak it as a referrer.
export const metadata: Metadata = {
  title: 'Personality badge',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function BadgeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
