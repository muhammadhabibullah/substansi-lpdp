'use client';

import Link from 'next/link';

import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const { c } = useI18n();

  return (
    <div className="container max-w-xl py-24 text-center">
      <p className="font-mono text-5xl font-bold text-muted-foreground">404</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {c.errors.notFoundTitle}
      </h1>
      <p className="mt-2 text-muted-foreground">{c.errors.notFoundBody}</p>
      <Button asChild className="mt-6">
        <Link href="/">{c.errors.notFoundCta}</Link>
      </Button>
    </div>
  );
}
