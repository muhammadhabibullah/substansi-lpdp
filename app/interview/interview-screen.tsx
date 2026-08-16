'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Clock,
  Keyboard,
  Loader2,
  Mic,
  MicOff,
  RotateCcw,
  Send,
  SkipForward,
  Square,
  Trash2,
  X,
} from 'lucide-react';

import { useI18n } from '@/components/i18n-provider';
import { PanelistAvatar } from '@/components/panelist-avatar';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { useDocuments, useProfile, useSettings } from '@/hooks/use-app-state';
import { useInterview, type InterviewError } from '@/hooks/use-interview';
import { useVoiceInput, type UseVoiceInput } from '@/hooks/use-voice-input';
import { missingRequiredDocs } from '@/lib/documents';
import type { LlmError } from '@/lib/llm';
import { PHASES, phaseIndex, progressPercent } from '@/lib/panel/phases';
import type { PanelistId, TranscriptTurn } from '@/lib/types';
import { cn, formatClock } from '@/lib/utils';
import { combineTranscript, recognitionLang } from '@/lib/voice';

export function InterviewScreen() {
  const { c, f } = useI18n();
  const router = useRouter();
  const { settings, configured, hydrated: settingsReady } = useSettings();
  const { profile, hydrated: profileReady } = useProfile();
  const { documents, hydrated: docsReady } = useDocuments();

  const interview = useInterview({
    settings,
    documents,
    profile,
    ready: settingsReady && profileReady && docsReady,
  });

  const [draft, setDraft] = React.useState('');
  const [confirmEnd, setConfirmEnd] = React.useState(false);
  const [inputMode, setInputMode] = React.useState<'text' | 'voice'>('text');
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const { session, busy, streaming, error, warning } = interview;

  // Voice input follows the session language (PLAN §1 language behavior).
  const voice = useVoiceInput({ lang: recognitionLang(session?.lang ?? 'id') });

  const composerBusy =
    busy || interview.preparingDocs || session?.status === 'finished';
  const hydrated = settingsReady && profileReady && docsReady;

  const setupIncomplete =
    hydrated &&
    (!configured ||
      profile.name.trim().length === 0 ||
      missingRequiredDocs(documents, profile.jenjang).length > 0);

  // Auto-start a session once setup is complete and none exists yet.
  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (!hydrated || setupIncomplete || startedRef.current) return;
    if (session === null) {
      startedRef.current = true;
      interview.start();
    }
  }, [hydrated, setupIncomplete, session, interview]);

  // Keep the newest turn in view.
  React.useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [session?.turns.length, streaming?.text]);

  // Navigate to the report once the panel has finished.
  React.useEffect(() => {
    if (session?.status === 'finished') {
      router.push('/report');
    }
  }, [session?.status, router]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    interview.submitAnswer(text);
    inputRef.current?.focus();
  };

  /** Submit the spoken answer verbatim — the transcript is non-editable. */
  const submitVoice = () => {
    if (busy) return;
    const text = voice.finish();
    if (!text) return;
    interview.submitAnswer(text);
  };

  // Never keep the microphone open while the panel is speaking/working.
  const voiceListening = voice.listening;
  const voiceStop = voice.stop;
  React.useEffect(() => {
    if ((busy || interview.preparingDocs) && voiceListening) {
      voiceStop();
    }
  }, [busy, interview.preparingDocs, voiceListening, voiceStop]);

  /* ── Guard: setup incomplete ───────────────────────────────────────────── */

  if (hydrated && setupIncomplete) {
    return (
      <div className="container max-w-2xl py-16">
        <Card>
          <CardHeader>
            <CardTitle>{c.interview.noSessionTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{c.interview.noSessionBody}</p>
            <Button asChild>
              <Link href="/setup">{c.interview.noSessionCta}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!hydrated || !session) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <Loader2 aria-hidden className="mx-auto size-6 animate-spin text-primary" />
        <p className="mt-3 text-sm text-muted-foreground">{c.interview.connecting}</p>
      </div>
    );
  }

  const currentPhaseIndex = phaseIndex(session.phase);
  const overtime = interview.remainingMs <= 0;
  const finishing = session.status === 'wrapping';

  return (
    <div className="container max-w-4xl py-6">
      {/* Sticky status bar: phase + countdown (M3-4) */}
      <div className="sticky top-16 z-30 -mx-4 mb-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {f(c.interview.phaseProgress, {
                current: currentPhaseIndex + 1,
                total: PHASES.length,
              })}
            </p>
            <p className="truncate text-sm font-semibold">
              {c.phases[session.phase].name}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex items-center gap-1.5 font-mono text-lg font-semibold tabular-nums',
                overtime ? 'text-destructive' : 'text-foreground',
              )}
              aria-live="off"
            >
              <Clock aria-hidden className="size-4" />
              <span
                aria-label={overtime ? c.interview.overtime : c.interview.timeRemaining}
              >
                {formatClock(interview.remainingMs)}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmEnd(true)}
              disabled={session.status === 'finished'}
            >
              <Square aria-hidden />
              {c.interview.endEarly}
            </Button>
          </div>
        </div>

        <Progress
          value={progressPercent(session.elapsedMs)}
          className="mt-2"
          indicatorClassName={overtime ? 'bg-destructive' : undefined}
        />
      </div>

      {interview.recovered ? (
        <Alert variant="info" className="mb-4">
          <AlertTitle>{c.interview.recoveredTitle}</AlertTitle>
          <AlertDescription>{c.interview.recoveredBody}</AlertDescription>
        </Alert>
      ) : null}

      {warning ? (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle aria-hidden />
          <AlertDescription>
            <div className="flex items-start justify-between gap-4">
              <span>{describeWarning(warning, c)}</span>
              <button
                type="button"
                onClick={interview.dismissWarning}
                aria-label={c.common.close}
                className="shrink-0"
              >
                <X aria-hidden className="size-4" />
              </button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Transcript */}
      <div
        ref={scrollRef}
        className="max-h-[60vh] space-y-4 overflow-y-auto rounded-lg border border-border bg-muted/20 p-4"
        role="log"
        aria-live="polite"
        aria-label={c.interview.transcriptTitle}
      >
        {session.turns.length === 0 && !streaming ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {c.interview.panelPreparing}
          </p>
        ) : null}

        {session.turns.map((turn) => (
          <TurnBubble key={turn.id} turn={turn} />
        ))}

        {streaming ? (
          <StreamingBubble panelist={streaming.panelist} text={streaming.text} />
        ) : null}

        {interview.preparingDocs ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {c.interview.panelPreparing}
          </div>
        ) : null}

        {busy && !streaming && !interview.preparingDocs ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            {finishing ? c.interview.wrappingUp : c.interview.connecting}
          </div>
        ) : null}
      </div>

      {/* Error recovery (M5-3) */}
      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTriangle aria-hidden />
          <AlertTitle>{c.interview.errorTitle}</AlertTitle>
          <AlertDescription>
            <p>{describeLlmError(error, c)}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={interview.retry}>
                <RotateCcw aria-hidden />
                {c.interview.errorRetry}
              </Button>
              <Button size="sm" variant="outline" onClick={interview.skipTurn}>
                <SkipForward aria-hidden />
                {c.interview.errorSkipTurn}
              </Button>
              <Button size="sm" variant="outline" onClick={interview.endEarly}>
                <Square aria-hidden />
                {c.interview.errorEndSession}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Answer composer — typing and voice input modes (P1-1) */}
      <div className="mt-4 space-y-2">
        {voice.supported ? (
          <div role="group" aria-label={c.interview.title} className="flex items-center gap-1">
            <Button
              variant={inputMode === 'text' ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={inputMode === 'text'}
              onClick={() => {
                voice.stop();
                setInputMode('text');
                inputRef.current?.focus();
              }}
            >
              <Keyboard aria-hidden />
              {c.interview.inputModeText}
            </Button>
            <Button
              variant={inputMode === 'voice' ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={inputMode === 'voice'}
              onClick={() => setInputMode('voice')}
            >
              <Mic aria-hidden />
              {c.interview.inputModeVoice}
            </Button>
          </div>
        ) : null}

        {inputMode === 'voice' && voice.supported ? (
          <VoiceComposer voice={voice} disabled={composerBusy} />
        ) : (
          <Textarea
            ref={inputRef}
            value={draft}
            rows={3}
            disabled={composerBusy}
            placeholder={
              busy || interview.preparingDocs
                ? c.interview.inputPlaceholderWaiting
                : c.interview.inputPlaceholder
            }
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            aria-label={c.interview.inputPlaceholder}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            {inputMode === 'voice'
              ? voice.supported
                ? c.interview.voiceNonEditableNote
                : c.interview.voiceUnsupported
              : c.interview.sendHint}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {f(c.interview.answersCount, {
                count: session.turns.filter((turn) => turn.speaker === 'user').length,
              })}
            </span>
            <Button
              onClick={inputMode === 'voice' && voice.supported ? submitVoice : submit}
              disabled={
                composerBusy ||
                (inputMode === 'voice' && voice.supported
                  ? combineTranscript(voice.transcript, voice.interim).length === 0
                  : draft.trim().length === 0)
              }
            >
              <Send aria-hidden />
              {c.interview.send}
            </Button>
          </div>
        </div>
      </div>

      {/* End-early confirmation */}
      {confirmEnd ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle id="end-title">{c.interview.endEarlyConfirmTitle}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {c.interview.endEarlyConfirmBody}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => setConfirmEnd(false)}>
                  {c.common.cancel}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setConfirmEnd(false);
                    interview.endEarly();
                  }}
                >
                  {c.interview.endEarlyConfirm}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

/* ── Voice composer (P1-1) ──────────────────────────────────────────────── */

interface VoiceComposerProps {
  voice: UseVoiceInput;
  /** True while the panel is busy or the session has ended. */
  disabled: boolean;
}

/**
 * Voice answer panel. The transcript area is deliberately read-only: spoken
 * answers go to the panel verbatim, mirroring a real interview (P1-1).
 */
function VoiceComposer({ voice, disabled }: VoiceComposerProps) {
  const { c } = useI18n();
  const visibleText = combineTranscript(voice.transcript, voice.interim);

  const errorText =
    voice.error === 'denied'
      ? c.interview.voiceDenied
      : voice.error === 'network'
        ? c.interview.voiceNetwork
        : voice.error
          ? c.interview.voiceOtherError
          : null;

  return (
    <div className="space-y-2">
      {errorText ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertDescription>{errorText}</AlertDescription>
        </Alert>
      ) : null}

      <Textarea
        readOnly
        value={visibleText}
        rows={3}
        placeholder={c.interview.voicePlaceholder}
        aria-label={c.interview.voiceTranscriptLabel}
        className="bg-muted/40"
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs',
            voice.listening ? 'text-foreground' : 'text-muted-foreground',
          )}
          aria-live="polite"
        >
          {voice.listening ? (
            <>
              <Mic aria-hidden className="size-3.5 animate-pulse text-destructive" />
              {c.interview.voiceListening}
            </>
          ) : (
            c.interview.voiceIdleHint
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={voice.clear}
            disabled={disabled || visibleText.length === 0}
          >
            <Trash2 aria-hidden />
            {c.interview.voiceDiscard}
          </Button>
          <Button
            variant={voice.listening ? 'destructive' : 'secondary'}
            size="sm"
            onClick={() => (voice.listening ? voice.stop() : voice.start())}
            disabled={disabled}
          >
            {voice.listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
            {voice.listening ? c.interview.voiceStop : c.interview.voiceStart}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{c.interview.voicePrivacyNote}</p>
    </div>
  );
}

/* ── Bubbles ─────────────────────────────────────────────────────────────── */

function TurnBubble({ turn }: { turn: TranscriptTurn }) {
  const { c } = useI18n();

  if (turn.speaker === 'system') {
    return (
      <p className="text-center text-xs italic text-muted-foreground">{turn.text}</p>
    );
  }

  const isUser = turn.speaker === 'user';
  const speaker = isUser ? 'user' : (turn.speaker as PanelistId);
  const info = isUser ? c.panelists.you : c.panelists[speaker as PanelistId];

  return (
    <div
      className={cn(
        'flex animate-fade-in gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
      )}
    >
      <PanelistAvatar speaker={speaker} />
      <div className={cn('min-w-0 max-w-[85%]', isUser ? 'text-right' : 'text-left')}>
        <div
          className={cn(
            'mb-1 flex items-center gap-2 text-xs text-muted-foreground',
            isUser ? 'justify-end' : 'justify-start',
          )}
        >
          <span className="font-medium text-foreground">{info.name}</span>
          {turn.lang === 'en' ? (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              EN
            </Badge>
          ) : null}
          <span className="font-mono tabular-nums">{formatClock(turn.atMs)}</span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm prose-plain',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'border border-border bg-card',
          )}
        >
          {turn.text}
        </div>
      </div>
    </div>
  );
}

function StreamingBubble({ panelist, text }: { panelist: PanelistId; text: string }) {
  const { c } = useI18n();
  const info = c.panelists[panelist];

  return (
    <div className="flex animate-fade-in gap-3">
      <PanelistAvatar speaker={panelist} />
      <div className="min-w-0 max-w-[85%]">
        <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{info.name}</span>
          <span className="italic">
            {text.length === 0 ? c.interview.thinking : c.interview.typing}
          </span>
        </div>
        <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm prose-plain">
          {text}
          <span aria-hidden className="ml-0.5 inline-block animate-pulse">▍</span>
        </div>
      </div>
    </div>
  );
}

/* ── Error copy mapping ──────────────────────────────────────────────────── */

type Copy = ReturnType<typeof useI18n>['c'];

function describeLlmError(error: InterviewError, c: Copy): string {
  if (error.kind !== 'llm') return c.common.unknownError;
  const llmError: LlmError = error.error;
  switch (llmError.kind) {
    case 'auth':
      return c.interview.authFailed;
    case 'rate-limit':
      return c.interview.rateLimited;
    case 'network':
      return c.interview.networkFailed;
    case 'bad-response':
      return c.interview.streamInterrupted;
    case 'not-configured':
      return c.errors.missingSettingsBody;
    default:
      return llmError.message || c.common.unknownError;
  }
}

function describeWarning(warning: InterviewError, c: Copy): string {
  switch (warning.kind) {
    case 'note-taker':
      return c.interview.noteTakerFailed;
    case 'storage':
      return c.errors.storageFullBody;
    default:
      return c.common.unknownError;
  }
}
