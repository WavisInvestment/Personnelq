import type { Metadata, Viewport } from 'next';
import { Bricolage_Grotesque, Geist, Newsreader } from 'next/font/google';
import '../styles/globals.css';
import { ConfirmProvider } from '@/components/ui/confirm';

const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });

// The editorial voice: italic asides, pull quotes and the one emphasised word in a headline.
const serif = Newsreader({ subsets: ['latin'], style: ['normal', 'italic'], variable: '--font-serif', display: 'swap' });

export const metadata: Metadata = {
  // The address links are resolved against when someone shares the site. Set NEXT_PUBLIC_SITE_URL in production.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'),
  title: {
    default: 'Personnelq: Understand yourself, share it your way',
    template: '%s · Personnelq',
  },
  description:
    'Take a science-based personality assessment, get clear insights about how you think and work, and share a personality badge on your own terms.',
  openGraph: {
    type: 'website',
    siteName: 'Personnelq',
    title: 'Personnelq: understand yourself, share it your way',
    description: 'A science-based personality assessment, with a badge that shows only what you choose.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Personnelq: understand your personality, share it your way' }],
  },
  twitter: { card: 'summary_large_image', images: ['/og.png'] },
};

export const viewport: Viewport = {
  themeColor: '#f3f0e8',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${serif.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lift"
        >
          Skip to content
        </a>
        <ConfirmProvider>
          <div className="flex min-h-[100dvh] flex-col">{children}</div>
        </ConfirmProvider>
      </body>
    </html>
  );
}
