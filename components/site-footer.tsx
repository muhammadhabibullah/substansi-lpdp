'use client';

import Link from 'next/link';
import { Github } from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { SITE } from '@/lib/site';
import { Disclaimer } from '@/components/disclaimer';

export function SiteFooter() {
  const { c } = useI18n();

  return (
    <footer className="mt-16 border-t border-border bg-muted/30">
      <div className="container flex flex-col gap-6 py-10">
        {/* Hard constraint #6: disclaimer stays visible site-wide. */}
        <Disclaimer variant="compact" />

        <div className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{c.footer.builtWith}</p>
          <nav className="flex flex-wrap items-center gap-4">
            <Link href="/privacy" className="hover:text-foreground hover:underline">
              {c.footer.privacy}
            </Link>
            <a
              href={SITE.licenseUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="hover:text-foreground hover:underline"
            >
              {c.footer.license}
            </a>
            <a
              href={SITE.repoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1.5 hover:text-foreground hover:underline"
            >
              <Github aria-hidden className="size-4" />
              {c.footer.sourceCode}
            </a>
          </nav>
        </div>

        <p className="text-xs text-muted-foreground">
          {c.footer.lpdpSourceNote}{' '}
          <a
            href={SITE.lpdpGuidanceUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="underline hover:text-foreground"
          >
            {c.footer.lpdpSourceLink}
          </a>
        </p>
      </div>
    </footer>
  );
}
