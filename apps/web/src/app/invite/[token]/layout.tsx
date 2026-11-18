import type { Metadata } from 'next';

// The link is personal: keep it out of search engines and don't leak it as a referrer.
export const metadata: Metadata = {
  title: 'Invitation',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
