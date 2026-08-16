'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  FileText,
  Github,
  KeyRound,
  ListChecks,
  MessagesSquare,
  ShieldCheck,
} from 'lucide-react';

import { Disclaimer } from '@/components/disclaimer';
import { useI18n } from '@/components/i18n-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useSettings } from '@/hooks/use-app-state';
import { PANELISTS } from '@/lib/panel/personas';
import { PHASES } from '@/lib/panel/phases';
import { RUBRIC } from '@/lib/rubric';
import { isResumable, loadReport, loadSession } from '@/lib/storage';
import { SITE } from '@/lib/site';
import { cn } from '@/lib/utils';

const STEP_ICONS = [FileText, MessagesSquare, ListChecks] as const;

const PANEL_COLOR: Record<string, string> = {
  akademisi: 'text-akademisi border-akademisi/30 bg-akademisi/5',
  psikolog: 'text-psikolog border-psikolog/30 bg-psikolog/5',
  lpdp: 'text-lpdp border-lpdp/30 bg-lpdp/5',
};

export function LandingPage() {
  const { c } = useI18n();
  const { configured, hydrated } = useSettings();

  // Offer resume/report shortcuts only when that data actually exists.
  const [hasSession, setHasSession] = React.useState(false);
  const [hasReport, setHasReport] = React.useState(false);

  React.useEffect(() => {
    setHasSession(isResumable(loadSession()));
    setHasReport(loadReport() !== null);
  }, []);

  return (
    <div className="container py-12 md:py-16">
      {/* Hero */}
      <section className="mx-auto max-w-3xl text-center">
        <Badge variant="outline" className="mb-6">
          {c.landing.heroBadge}
        </Badge>
        <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
          {c.landing.heroTitle}
        </h1>
        <p className="mt-5 text-pretty text-lg text-muted-foreground">
          {c.landing.heroSubtitle}
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="min-w-48">
            <Link href="/setup" className="inline-flex items-center gap-2">
              {c.landing.ctaPrimary}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
          {hasSession ? (
            <Button asChild variant="secondary" size="lg">
              <Link href="/interview">{c.landing.ctaResume}</Link>
            </Button>
          ) : null}
          {hasReport ? (
            <Button asChild variant="outline" size="lg">
              <Link href="/report">{c.landing.ctaReport}</Link>
            </Button>
          ) : null}
          {!hasSession && !hasReport ? (
            <Button asChild variant="outline" size="lg">
              <Link href="/settings" className="inline-flex items-center gap-2">
                <KeyRound aria-hidden className="size-4" />
                {c.landing.ctaSecondary}
              </Link>
            </Button>
          ) : null}
        </div>

        {hydrated && !configured ? (
          <Alert variant="warning" className="mt-8 text-left">
            <KeyRound aria-hidden />
            <AlertTitle>{c.landing.byokTitle}</AlertTitle>
            <AlertDescription>
              <p>{c.landing.needSettingsWarning}</p>
              <Link
                href="/settings"
                className="mt-2 inline-flex items-center gap-1 font-medium underline"
              >
                {c.landing.byokCta}
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      {/* Disclaimer — hard constraint #6 */}
      <section className="mx-auto mt-12 max-w-3xl">
        <Disclaimer />
      </section>

      {/* How it works */}
      <section className="mt-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          {c.landing.howTitle}
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {c.landing.howSteps.map((step, index) => {
            const Icon = STEP_ICONS[index] ?? FileText;
            return (
              <Card key={step.title}>
                <CardHeader>
                  <Icon aria-hidden className="size-6 text-primary" />
                  <CardTitle className="text-base">{step.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{step.body}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Panelists */}
      <section className="mt-16">
        <h2 className="text-center text-2xl font-semibold tracking-tight">
          {c.landing.panelTitle}
        </h2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {PANELISTS.map((panelist) => {
            const info = c.panelists[panelist.copyKey];
            return (
              <Card
                key={panelist.id}
                className={cn('border', PANEL_COLOR[panelist.id])}
              >
                <CardHeader>
                  <div
                    aria-hidden
                    className="flex size-10 items-center justify-center rounded-full border border-current text-base font-semibold"
                  >
                    {info.initial}
                  </div>
                  <CardTitle className="text-base text-foreground">{info.name}</CardTitle>
                  <CardDescription>{info.role}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{info.focus}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Phases */}
      <section className="mt-16 grid gap-8 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              {c.interview.phaseLabel} · 60 {c.common.minutes}
            </CardTitle>
            <CardDescription>{c.landing.howSteps[1]?.body}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {PHASES.map((phase, index) => (
                <li key={phase.id} className="flex items-start gap-3 text-sm">
                  <span
                    aria-hidden
                    className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold"
                  >
                    {index + 1}
                  </span>
                  <span>
                    <span className="font-medium">{c.phases[phase.id].name}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      · {phase.minutes} {c.common.minutes}
                    </span>
                    <span className="block text-muted-foreground">
                      {c.phases[phase.id].goal}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Rubric */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{c.landing.rubricTitle}</CardTitle>
            <CardDescription>{c.landing.rubricBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {RUBRIC.map((dimension) => (
                <li
                  key={dimension.id}
                  className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 text-sm last:border-0"
                >
                  <span>
                    <span className="font-medium">{c.rubric[dimension.id].name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.panelists[dimension.owner].name}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-sm text-muted-foreground">
                    {dimension.weight}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Privacy + BYOK + OSS */}
      <section className="mt-16 grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <ShieldCheck aria-hidden className="size-6 text-primary" />
            <CardTitle className="text-base">{c.landing.privacyTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{c.landing.privacyBody}</p>
            <Link href="/privacy" className="text-sm font-medium underline">
              {c.nav.privacy}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <KeyRound aria-hidden className="size-6 text-primary" />
            <CardTitle className="text-base">{c.landing.byokTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{c.landing.byokBody}</p>
            <Link href="/settings" className="text-sm font-medium underline">
              {c.landing.byokCta}
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Github aria-hidden className="size-6 text-primary" />
            <CardTitle className="text-base">{c.landing.openSourceTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{c.landing.openSourceBody}</p>
            <a
              href={SITE.repoUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-sm font-medium underline"
            >
              {c.landing.viewSource}
            </a>
          </CardContent>
        </Card>
      </section>

      <section className="mt-16 flex justify-center">
        <Button asChild size="lg" className="min-w-56">
          <Link href="/setup" className="inline-flex items-center gap-2">
            {c.landing.ctaPrimary}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      </section>
    </div>
  );
}
