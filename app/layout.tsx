import type { Metadata, Viewport } from 'next';

import './globals.css';
import { I18nProvider } from '@/components/i18n-provider';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { SkipLink } from '@/components/skip-link';
import { getCopy } from '@/lib/i18n';

const copy = getCopy('id');

export const metadata: Metadata = {
  title: {
    default: `${copy.meta.appName} — ${copy.meta.tagline}`,
    template: `%s — ${copy.meta.appName}`,
  },
  description: copy.meta.description,
  applicationName: copy.meta.appName,
  robots: { index: true, follow: true },
  openGraph: {
    title: `${copy.meta.appName} — ${copy.meta.tagline}`,
    description: copy.meta.description,
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col">
        <I18nProvider>
          <SkipLink />
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
