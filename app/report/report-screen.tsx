'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Download,
  Loader2,
  MinusCircle,
  Printer,
  RotateCcw,
  Trash2,
} from 'lucide-react';

import { Disclaimer } from '@/components/disclaimer';
import { useI18n } from '@/components/i18n-provider';
import { PanelistAvatar } from '@/components/panelist-avatar';
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
import { Progress } from '@/components/ui/progress';
import { useSettings } from '@/hooks/use-app-state';
import { downloadMarkdown } from '@/lib/export-markdown';
import { describeLlmError } from '@/lib/i18n';
import { toLlmError, type LlmError } from '@/lib/llm';
import { generateReport, type ReportStep } from '@/lib/report';
import { bandTone, getDimension } from '@/lib/rubric';
import {
  deleteReport,
  loadDocuments,
  loadReports,
  loadSession,
  saveSession,
  upsertReport,
} from '@/lib/storage';
import type {
  InterviewSession,
  PanelistId,
  Report,
  SignalCheck,
  SignalVerdict,
} from '@/lib/types';
import { cn, formatClock, formatDateTime, formatDuration } from '@/lib/utils';

type State =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'generating'; step: ReportStep; index: number; total: number }
  | { status: 'ready'; report: Report }
  | { status: 'failed'; error: LlmError };

export function ReportScreen() {
  const { c, f, locale } = useI18n();
  const { settings, hydrated } = useSettings();
  const [state, setState] = React.useState<State>({ status: 'loading' });
  /** Saved attempts, newest first — the report history list. */
  const [history, setHistory] = React.useState<Report[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  /** The session still in storage, if any (enables "rebuild report"). */
  const [activeSession, setActiveSession] = React.useState<InterviewSession | null>(null);
  const startedRef = React.useRef(false);
  const abortRef = React.useRef<AbortController | null>(null);

  const build = React.useCallback(async () => {
    const session = loadSession();
    if (!session || session.turns.length === 0) {
      setState({ status: 'empty' });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ status: 'generating', step: 'scoring', index: 1, total: 3 });
    try {
      const report = await generateReport({
        session,
        settings,
        locale,
        // Dimensions the interview never reached (early exit) are still
        // graded from the uploaded documents.
        documents: loadDocuments(),
        signal: controller.signal,
        onStep: (step, index, total) =>
          setState({ status: 'generating', step, index, total }),
      });
      // One history entry per attempt: re-grading the same session replaces
      // that session's report instead of adding a duplicate.
      upsertReport(report);
      // Mark the session finished so we do not re-grade it on every visit.
      saveSession({
        ...session,
        status: 'finished',
        finishedAt: session.finishedAt ?? Date.now(),
      });
      setHistory(loadReports());
      setActiveSession(loadSession());
      setSelectedId(report.id);
      setState({ status: 'ready', report });
    } catch (error) {
      const llmError = toLlmError(error);
      if (llmError.kind === 'aborted') return;
      setState({ status: 'failed', error: llmError });
    }
  }, [locale, settings]);

  // On mount: grade a just-finished session that has no report yet, otherwise
  // show the newest saved report alongside the history list.
  React.useEffect(() => {
    if (!hydrated || startedRef.current) return;
    startedRef.current = true;

    const reports = loadReports();
    const session = loadSession();
    setHistory(reports);
    setActiveSession(session);

    if (session && session.status === 'finished' && session.turns.length > 0) {
      const existing = reports.find((entry) => entry.sessionId === session.id);
      // A report built mid-interview is older than the session's end; rebuild
      // it so the final transcript is what gets graded.
      const stale =
        existing && session.finishedAt
          ? existing.createdAt < session.finishedAt
          : false;
      if (!existing || stale) {
        void build();
        return;
      }
      setSelectedId(existing.id);
      setState({ status: 'ready', report: existing });
      return;
    }

    if (reports.length > 0) {
      const newest = reports[0]!;
      setSelectedId(newest.id);
      setState({ status: 'ready', report: newest });
      return;
    }
    setState({ status: 'empty' });
  }, [build, hydrated]);

  React.useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const selectReport = (entry: Report) => {
    setSelectedId(entry.id);
    setState({ status: 'ready', report: entry });
  };

  const removeReport = (id: string) => {
    if (!window.confirm(c.report.historyDeleteConfirm)) return;
    deleteReport(id);
    const remaining = loadReports();
    setHistory(remaining);
    if (selectedId === id) {
      if (remaining.length > 0) {
        selectReport(remaining[0]!);
      } else {
        setSelectedId(null);
        setState({ status: 'empty' });
      }
    }
  };

  const stepLabels: Record<ReportStep, string> = {
    scoring: c.report.stepScoring,
    narrative: c.report.stepNarrative,
    signals: c.report.stepSignals,
  };

  if (state.status === 'loading') {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <Loader2 aria-hidden className="mx-auto size-6 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">{c.common.loading}</p>
      </div>
    );
  }

  if (state.status === 'empty') {
    return (
      <div className="container max-w-2xl py-16">
        <Card>
          <CardHeader>
            <CardTitle>{c.report.noReportTitle}</CardTitle>
            <CardDescription>{c.report.noReportBody}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/setup">{c.report.noReportCta}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (state.status === 'generating') {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <Loader2 aria-hidden className="mx-auto size-8 animate-spin text-primary" />
        <h1 className="mt-4 text-xl font-semibold">{c.report.generating}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {f(c.report.generatingStep, {
            step: state.index,
            total: state.total,
            label: stepLabels[state.step],
          })}
        </p>
        <Progress
          value={(state.index / state.total) * 100}
          className="mx-auto mt-6 max-w-sm"
        />
      </div>
    );
  }

  if (state.status === 'failed') {
    const described = describeLlmError(state.error, c);
    return (
      <div className="container max-w-2xl py-16">
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertTitle>{c.report.generateFailed}</AlertTitle>
          <AlertDescription>
            <p>{described.summary}</p>
            {described.detail ? (
              <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-xs">
                {described.detail}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => void build()}>
                <RotateCcw aria-hidden />
                {c.report.regenerate}
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/settings">{c.errors.missingSettingsCta}</Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { report } = state;

  // Rebuilding is only possible while the session this report came from is
  // still in storage (a new attempt replaces the session).
  const canRegenerate = Boolean(
    activeSession &&
      activeSession.turns.length > 0 &&
      activeSession.id === report.sessionId,
  );

  return (
    <div className="container max-w-4xl py-10">
      {/* Actions — hidden when printing */}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{c.report.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{c.report.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => downloadMarkdown(report, locale)}>
            <Download aria-hidden />
            {c.report.downloadMarkdown}
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer aria-hidden />
            {c.report.printPdf}
          </Button>
          <Button
            variant="ghost"
            onClick={() => void build()}
            disabled={!canRegenerate}
            title={
              canRegenerate ? c.report.regenerate : c.report.regenerateUnavailable
            }
            aria-label={c.report.regenerate}
          >
            <RotateCcw aria-hidden />
          </Button>
        </div>
      </div>

      {/* Report history — one entry per interview attempt (hidden in print) */}
      {history.length > 0 ? (
        <Card className="no-print mb-6 print-avoid-break">
          <CardHeader>
            <CardTitle className="text-base">{c.report.historyTitle}</CardTitle>
            <CardDescription>
              {f(c.report.historySubtitle, { count: history.length })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {history.map((entry) => {
              const selected = entry.id === selectedId;
              return (
                <div
                  key={entry.id}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border border-border px-3 py-2',
                    selected && 'border-primary bg-primary/5',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => selectReport(entry)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    aria-label={`${c.report.historyView} — ${formatDateTime(entry.createdAt, locale)}`}
                    aria-current={selected ? 'true' : undefined}
                  >
                    <span className="w-10 shrink-0 text-2xl font-bold tabular-nums">
                      {entry.totalScore}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {formatDateTime(entry.createdAt, locale)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.bands[entry.band].label} ·{' '}
                        {formatDuration(entry.durationMs, locale)} ·{' '}
                        {f(c.report.historyAnswers, { count: entry.answerCount })}
                      </span>
                    </span>
                  </button>
                  {entry.id === history[0]?.id ? (
                    <Badge variant="outline" className="shrink-0">
                      {c.report.historyLatest}
                    </Badge>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeReport(entry.id)}
                    aria-label={c.report.historyDelete}
                    title={c.report.historyDelete}
                  >
                    <Trash2 aria-hidden className="size-4" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      {/* Disclaimer — hard constraint #6 */}
      <div className="mb-6">
        <Disclaimer />
      </div>

      {/* Headline score */}
      <Card className="mb-6 print-avoid-break">
        <CardContent className="flex flex-wrap items-center justify-between gap-6 pt-6">
          <div>
            <p className="text-sm text-muted-foreground">{c.report.totalScore}</p>
            <p className="mt-1 text-5xl font-bold tabular-nums">
              {report.totalScore}
              <span className="ml-2 text-lg font-normal text-muted-foreground">
                / 100
              </span>
            </p>
          </div>
          <div className="max-w-md">
            <p className="text-sm text-muted-foreground">{c.report.band}</p>
            <Badge variant={bandTone(report.band)} className="mt-1 text-sm">
              {c.bands[report.band].label}
            </Badge>
            <p className="mt-2 text-sm text-muted-foreground">
              {c.bands[report.band].description}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Session metadata */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle className="text-base">{c.report.metaTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <MetaItem label={c.setup.fieldName} value={report.profile.name || '—'} />
            <MetaItem
              label={c.setup.fieldJenjang}
              value={
                report.profile.jenjang === 'doktor'
                  ? c.setup.fieldJenjangDoktor
                  : c.setup.fieldJenjangMagister
              }
            />
            <MetaItem
              label={c.setup.fieldUniversitas}
              value={`${report.profile.universitas || '—'} · ${report.profile.prodi || '—'}`}
            />
            <MetaItem label={c.setup.fieldBidang} value={report.profile.bidang || '—'} />
            <MetaItem
              label={c.report.metaDate}
              value={formatDateTime(report.createdAt, locale)}
            />
            <MetaItem
              label={c.report.metaDuration}
              value={formatDuration(report.durationMs, locale)}
            />
            <MetaItem label={c.report.metaModel} value={report.model} />
            <MetaItem label={c.report.metaAnswers} value={String(report.answerCount)} />
            <MetaItem
              label={c.report.metaPhasesCovered}
              value={
                report.phasesCovered.map((phase) => c.phases[phase].name).join(', ') || '—'
              }
            />
          </dl>
        </CardContent>
      </Card>

      {/* Dimension table */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle className="text-base">{c.report.dimensionsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">
                  {c.report.dimensionTable.dimension}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {c.report.dimensionTable.owner}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {c.report.dimensionTable.weight}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {c.report.dimensionTable.score}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {c.report.dimensionTable.weighted}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.dimensions.map((dimension) => {
                const spec = getDimension(dimension.id);
                return (
                  <tr key={dimension.id} className="border-b border-border/60">
                    <td className="py-2 pr-3">{c.rubric[dimension.id].name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {c.panelists[spec.owner].name}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted-foreground">
                      {spec.weight}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <span className="font-semibold tabular-nums">
                        {dimension.score}
                      </span>
                      <span className="text-muted-foreground">/4</span>
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {dimension.weighted.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
              <tr className="font-semibold">
                <td className="py-2 pr-3" colSpan={4}>
                  {c.report.totalScore}
                </td>
                <td className="py-2 text-right tabular-nums">{report.totalScore}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Per-dimension detail */}
      <section className="mb-6 space-y-4">
        {report.dimensions.map((dimension) => {
          const spec = getDimension(dimension.id);
          return (
            <Card key={dimension.id} className="print-avoid-break">
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {c.rubric[dimension.id].name}
                    </CardTitle>
                    <CardDescription>
                      {c.panelists[spec.owner].name} · {c.report.dimensionTable.weight}{' '}
                      {spec.weight}
                    </CardDescription>
                  </div>
                  <Badge variant={dimension.score >= 3 ? 'success' : dimension.score === 2 ? 'warning' : 'destructive'}>
                    {dimension.score}/4 · {c.report.scoreLabels[dimension.score]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p>{dimension.justification}</p>

                {dimension.quotes.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {c.report.evidenceTitle}
                    </p>
                    <ul className="space-y-2">
                      {dimension.quotes.map((quote, quoteIndex) => (
                        <li
                          key={`${dimension.id}-quote-${quoteIndex}`}
                          className="border-l-2 border-primary/40 pl-3 italic text-muted-foreground"
                        >
                          “{quote}”
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {dimension.strengths.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      {c.report.strengthsTitle}
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                      {dimension.strengths.map((item, itemIndex) => (
                        <li key={`${dimension.id}-strength-${itemIndex}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {dimension.improvements.length > 0 ? (
                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                      {c.report.weaknessesTitle}
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-muted-foreground">
                      {dimension.improvements.map((item, itemIndex) => (
                        <li key={`${dimension.id}-improvement-${itemIndex}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* Panelist narratives */}
      {report.panelNotes.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-xl font-semibold tracking-tight">
            {c.report.panelNotesTitle}
          </h2>
          <div className="space-y-4">
            {report.panelNotes.map((note) => (
              <Card key={note.panelist} className="print-avoid-break">
                <CardContent className="flex gap-4 pt-6">
                  <PanelistAvatar speaker={note.panelist as PanelistId} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {c.panelists[note.panelist].name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {c.panelists[note.panelist].role}
                    </p>
                    <p className="mt-2 text-sm prose-plain">{note.narrative}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {/* Signal checklist */}
      <Card className="mb-6 print-avoid-break">
        <CardHeader>
          <CardTitle className="text-base">{c.report.signalsTitle}</CardTitle>
          <CardDescription>{c.report.signalsSubtitle}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-semibold">{c.report.signalStrongTitle}</p>
            <ul className="space-y-2">
              {report.strongSignals.map((check) => {
                const label = c.signals.strong[check.index];
                if (!label) return null;
                return (
                  <SignalRow key={check.index} check={check} label={label} kind="strong" />
                );
              })}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">{c.report.signalWeakTitle}</p>
            <ul className="space-y-2">
              {report.weakSignals.map((check) => {
                const label = c.signals.weak[check.index];
                if (!label) return null;
                return (
                  <SignalRow key={check.index} check={check} label={label} kind="weak" />
                );
              })}
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Next steps */}
      {report.nextSteps.length > 0 ? (
        <Card className="mb-6 print-avoid-break">
          <CardHeader>
            <CardTitle className="text-base">{c.report.nextStepsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              {report.nextSteps.map((step, index) => (
                <li key={`next-step-${index}`} className="flex gap-3 text-sm">
                  <span
                    aria-hidden
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
                  >
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {/* Transcript */}
      <Card className="print-break-before">
        <CardHeader>
          <CardTitle className="text-base">{c.report.transcriptTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <details>
            <summary className="no-print cursor-pointer text-sm font-medium text-primary">
              {c.report.transcriptToggleShow}
            </summary>
            <div className="mt-4 space-y-4">
              {report.turns
                .filter((turn) => turn.speaker !== 'system')
                .map((turn) => (
                  <div key={turn.id} className="text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {turn.speaker === 'user'
                          ? c.panelists.you.name
                          : c.panelists[turn.speaker as PanelistId].name}
                      </span>{' '}
                      · <span className="font-mono">{formatClock(turn.atMs)}</span>
                      {turn.lang === 'en' ? ' · EN' : ''}
                    </p>
                    <p
                      className={cn(
                        'prose-plain rounded-md px-3 py-2',
                        turn.speaker === 'user'
                          ? 'bg-secondary'
                          : 'border border-border',
                      )}
                    >
                      {turn.text}
                    </p>
                  </div>
                ))}
            </div>
          </details>
        </CardContent>
      </Card>

      <div className="no-print mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild variant="outline">
          <Link href="/setup">{c.report.noReportCta}</Link>
        </Button>
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words">{value}</dd>
    </div>
  );
}

const VERDICT_ICON: Record<SignalVerdict, typeof CheckCircle2> = {
  present: CheckCircle2,
  partial: CircleDashed,
  absent: MinusCircle,
};

function SignalRow({
  check,
  label,
  kind,
}: {
  check: SignalCheck;
  label: string;
  kind: 'strong' | 'weak';
}) {
  const { c } = useI18n();
  const Icon = VERDICT_ICON[check.verdict];

  // For weak signals, "present" is bad; for strong signals, "present" is good.
  const good = kind === 'strong' ? check.verdict === 'present' : check.verdict === 'absent';
  const neutral = check.verdict === 'partial';

  const verdictLabel =
    kind === 'weak'
      ? check.verdict === 'present'
        ? c.report.signalWeakPresent
        : c.report.signalWeakAbsent
      : check.verdict === 'present'
        ? c.report.signalStrong
        : check.verdict === 'partial'
          ? c.report.signalPartial
          : c.report.signalMissing;

  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          good
            ? 'text-emerald-600 dark:text-emerald-400'
            : neutral
              ? 'text-amber-600 dark:text-amber-400'
              : 'text-muted-foreground',
        )}
      />
      <span className="min-w-0">
        <span>{label}</span>
        <span className="block text-xs text-muted-foreground">
          {verdictLabel}
          {check.note ? ` · ${check.note}` : ''}
        </span>
      </span>
    </li>
  );
}
