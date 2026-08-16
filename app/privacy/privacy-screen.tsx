'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

import { Disclaimer } from '@/components/disclaimer';
import { useI18n } from '@/components/i18n-provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SITE } from '@/lib/site';

export function PrivacyScreen() {
  const { c } = useI18n();

  return (
    <div className="container max-w-3xl py-10">
      <header className="mb-8">
        <ShieldCheck aria-hidden className="size-8 text-primary" />
        <h1 className="mt-3 text-3xl font-bold tracking-tight">{c.privacy.title}</h1>
        <p className="mt-2 text-muted-foreground">{c.privacy.subtitle}</p>
      </header>

      <div className="mb-8">
        <Disclaimer />
      </div>

      <div className="space-y-4">
        {c.privacy.sections.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{section.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <Link href="/settings">{c.nav.settings}</Link>
        </Button>
        <Button asChild variant="ghost">
          <a href={SITE.repoUrl} target="_blank" rel="noreferrer noopener">
            {c.footer.sourceCode}
          </a>
        </Button>
      </div>
    </div>
  );
}
