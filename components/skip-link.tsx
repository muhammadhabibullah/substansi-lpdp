'use client';

import { useI18n } from '@/components/i18n-provider';

export function SkipLink() {
  const { c } = useI18n();
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
    >
      {c.nav.skipToContent}
    </a>
  );
}
