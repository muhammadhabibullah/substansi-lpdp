'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Clock,
  Loader2,
  Mic,
  Pause,
  Play,
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
import { describeLlmError, type LlmErrorDescription } from '@/lib/i18n';
import { PHASES, phaseIndex, progressPercent } from '@/lib/panel/phases';
import type { PanelistId, TranscriptTurn } from '@/lib/types';
import { cn, formatClock } from '@/lib/utils';
import { combineTranscript, recognitionLang } from '@/lib/voice';

export function InterviewScreen() {
  const { c, f } = useI18n();
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
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const { session, busy, streaming, error, warning } = interview;
  const errorDescription = error ? describeInterviewError(error, c) : null;

  // Voice input follows the session language (PLAN §1 language behavior).
  const voice = useVoiceInput({ lang: recognitionLang(session?.lang ?? 'id') });

  const composerBusy = busy || interview.preparingDocs;
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

  // Start a fresh session from the finished-session screen: reset() clears the
  // stored session, then start() begins a new interview immediately.
  const startNew = () => {
    interview.reset();
    interview.start();
  };

  // Never keep the microphone open while the panel is speaking/working, or
  // while the interview is paused (PLAN-V2 §10: mic force-stopped on pause).
  const voiceListening = voice.listening;
  const voiceStop = voice.stop;
  const paused = session?.status === 'paused';
  React.useEffect(() => {
    if ((busy || interview.preparingDocs || paused) && voiceListening) {
      voiceStop();
    }
  }, [busy, interview.preparingDocs, paused, voiceListening, voiceStop]);

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

  /* ── Guard: previous session finished ─────────────────────────────────── */

  if (session.status === 'finished') {
    const answerCount = session.turns.filter((turn) => turn.speaker === 'user').length;
    return (
      <div className="container max-w-2xl py-16">
        <Card>
          <CardHeader>
            <CardTitle>{c.interview.finished}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{c.interview.finishedSessionBody}</p>
            <p className="text-sm text-muted-foreground">
              {f(c.interview.finishedSessionDuration, {
                duration: formatClock(session.elapsedMs),
                answers: f(c.interview.answersCount, { count: answerCount }),
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={startNew}>
                <RotateCcw aria-hidden />
                {c.interview.startNewSession}
              </Button>
              <Button asChild variant="outline">
                <Link href="/report">{c.interview.viewReport}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
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
              onClick={interview.pause}
              disabled={paused}
            >
              <Pause aria-hidden />
              {c.interview.pause}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmEnd(true)}
              disabled={paused}
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

      {paused ? (
        /* Paused panel (PLAN-V2 §10): timer frozen, transcript not rendered. */
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>{c.interview.pausedTitle}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">{c.interview.pausedBody}</p>
            <p className="text-sm text-muted-foreground">
              {f(c.interview.pausedTimerNote, {
                time: formatClock(interview.remainingMs),
              })}
            </p>
            <Button onClick={interview.resume}>
              <Play aria-hidden />
              {c.interview.resume}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
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
          {errorDescription ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle aria-hidden />
              <AlertTitle>{c.interview.errorTitle}</AlertTitle>
              <AlertDescription>
                <p>{errorDescription.summary}</p>
                {errorDescription.detail ? (
                  <p className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/50 px-2 py-1.5 font-mono text-xs">
                    {errorDescription.detail}
                  </p>
                ) : null}
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

          {/* Answer composer — WhatsApp-style unified text & voice input (P1-11) */}
          <div className="mt-4">
            <AnswerComposer
              voice={voice}
              disabled={composerBusy}
              draft={draft}
              setDraft={setDraft}
              onSubmitText={(text) => {
                setDraft('');
                interview.submitAnswer(text);
              }}
              onSubmitVoice={() => {
                const text = voice.finish();
                if (text) interview.submitAnswer(text);
              }}
              metaText={f(c.interview.answersCount, {
                count: session.turns.filter((turn) => turn.speaker === 'user').length,
              })}
            />
          </div>
        </>
      )}

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

/* ── WhatsApp-style answer composer (P1-11) ─────────────────────────────── */

interface AnswerComposerProps {
  voice: UseVoiceInput;
  /** True while the panel is busy or the session has ended. */
  disabled: boolean;
  draft: string;
  setDraft: (text: string) => void;
  onSubmitText: (text: string) => void;
  onSubmitVoice: () => void;
  /** Right-side footer meta (answer count). */
  metaText: string;
}

/**
 * Unified WhatsApp-style composer with three states:
 * - idle: rounded text field whose right icon swaps mic → send while typing;
 * - recording/paused: discard · red dot + timer + waveform pill · pause/resume ·
 *   finish — no live text is shown while the mic is open;
 * - review: the transcript becomes an editable field once recording finishes,
 *   so the candidate can correct it before sending (P1-6).
 */
function AnswerComposer({
  voice,
  disabled,
  draft,
  setDraft,
  onSubmitText,
  onSubmitVoice,
  metaText,
}: AnswerComposerProps) {
  const { c } = useI18n();
  /** True between tapping the mic and finishing the recording for review. */
  const [voiceSession, setVoiceSession] = React.useState(false);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  // A recognition error ends the recording flow so the alert is visible and
  // any captured words stay editable in the review state.
  const voiceError = voice.error;
  React.useEffect(() => {
    if (voiceError) setVoiceSession(false);
  }, [voiceError]);

  const recording = voiceSession && voice.listening;
  const paused = voiceSession && !voice.listening;
  const reviewing = !voiceSession && voice.transcript.trim().length > 0;
  const spokenLength = combineTranscript(voice.transcript, voice.interim).length;

  const startRecording = () => {
    setVoiceSession(true);
    voice.start();
  };
  const discardRecording = () => {
    voice.stop();
    voice.clear();
    setVoiceSession(false);
  };
  /** Finish speaking: the transcript opens editable for review before send. */
  const finishToReview = () => {
    voice.stop();
    setVoiceSession(false);
  };
  const submitTyped = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    onSubmitText(text);
    inputRef.current?.focus();
  };

  const errorText =
    voice.error === 'denied'
      ? c.interview.voiceDenied
      : voice.error === 'network'
        ? c.interview.voiceNetwork
        : voice.error
          ? c.interview.voiceOtherError
          : null;

  const hint = recording
    ? c.interview.voiceListening
    : paused
      ? c.interview.voicePaused
      : reviewing
        ? c.interview.voiceEditableNote
        : !voice.checked
          ? ''
          : voice.supported
            ? c.interview.voiceIdleHint
            : `${c.interview.voiceUnsupported} ${c.interview.sendHint}`;

  return (
    <div className="space-y-2">
      {errorText ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden />
          <AlertDescription>{errorText}</AlertDescription>
        </Alert>
      ) : null}

      {recording || paused ? (
        <div className="flex items-center gap-2">
          <ComposerIconButton
            label={c.interview.voiceDiscard}
            onClick={discardRecording}
          >
            <Trash2 aria-hidden />
          </ComposerIconButton>

          <div className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-full border border-border bg-card px-4">
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full bg-destructive',
                recording && 'animate-pulse',
              )}
              aria-hidden
            />
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
              {formatRecClock(voice.elapsedMs)}
            </span>
            <Waveform active={recording} />
            <span className="sr-only" role="status">
              {recording ? c.interview.voiceListening : c.interview.voicePaused}
            </span>
          </div>

          <ComposerIconButton
            label={recording ? c.interview.voicePause : c.interview.voiceResume}
            onClick={() => (recording ? voice.stop() : voice.start())}
            disabled={disabled}
          >
            {recording ? <Pause aria-hidden /> : <Play aria-hidden />}
          </ComposerIconButton>

          <SendButton
            label={c.interview.voiceFinish}
            onClick={finishToReview}
            disabled={spokenLength === 0}
          />
        </div>
      ) : reviewing ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            value={voice.transcript}
            rows={3}
            onChange={(event) => voice.setText(event.target.value)}
            aria-label={c.interview.voiceTranscriptLabel}
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <ComposerIconButton
                label={c.interview.voiceDiscard}
                onClick={() => voice.clear()}
              >
                <Trash2 aria-hidden />
              </ComposerIconButton>
              <ComposerIconButton
                label={c.interview.voiceStart}
                onClick={startRecording}
                disabled={disabled}
              >
                <Mic aria-hidden />
              </ComposerIconButton>
            </div>
            <SendButton
              label={c.interview.send}
              onClick={onSubmitVoice}
              disabled={disabled || voice.transcript.trim().length === 0}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 rounded-3xl border border-border bg-card px-4 py-2.5">
            <textarea
              ref={(node) => {
                inputRef.current = node;
                if (node) autoGrow(node);
              }}
              value={draft}
              rows={1}
              disabled={disabled}
              placeholder={
                disabled ? c.interview.inputPlaceholderWaiting : c.interview.inputPlaceholder
              }
              onChange={(event) => {
                setDraft(event.target.value);
                autoGrow(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submitTyped();
                }
              }}
              aria-label={c.interview.inputPlaceholder}
              className="max-h-40 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {voice.supported && draft.trim().length === 0 ? (
            <ComposerIconButton
              label={c.interview.voiceStart}
              onClick={startRecording}
              disabled={disabled}
              className="size-12"
            >
              <Mic aria-hidden className="size-6" />
            </ComposerIconButton>
          ) : (
            <SendButton
              label={c.interview.send}
              onClick={submitTyped}
              disabled={disabled || draft.trim().length === 0}
            />
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">{hint}</p>
        <span className="shrink-0 text-xs text-muted-foreground">{metaText}</span>
      </div>

      {voice.supported ? (
        <p className="text-xs text-muted-foreground">{c.interview.voicePrivacyNote}</p>
      ) : null}
    </div>
  );
}

/* ── Composer primitives ─────────────────────────────────────────────────── */

/** WhatsApp-style `m:ss` recording clock. */
function formatRecClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Grow the idle composer textarea with its content (capped). */
function autoGrow(node: HTMLTextAreaElement) {
  node.style.height = 'auto';
  node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
}

/** Decorative waveform bar heights (px) for the recording pill. */
const WAVEFORM_BARS = [
  10, 16, 8, 20, 12, 22, 14, 9, 18, 12, 21, 10, 15, 23, 11, 17, 9, 19, 13, 21,
  10, 16, 12, 18, 9, 14,
];

function Waveform({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className="flex h-6 min-w-0 flex-1 items-center justify-center gap-[3px] overflow-hidden"
    >
      {WAVEFORM_BARS.map((height, index) => (
        <span
          key={index}
          className={cn(
            'w-[3px] shrink-0 rounded-full bg-foreground/60',
            active && 'animate-waveform',
          )}
          style={{ height: `${height}px`, animationDelay: `${index * 80}ms` }}
        />
      ))}
    </div>
  );
}

interface ComposerButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}

function ComposerIconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: ComposerButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

function SendButton({ label, onClick, disabled }: Omit<ComposerButtonProps, 'className' | 'children'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
    >
      <Send aria-hidden className="size-5" />
    </button>
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

function describeInterviewError(
  error: InterviewError,
  c: Copy,
): LlmErrorDescription {
  if (error.kind !== 'llm') return { summary: c.common.unknownError };
  return describeLlmError(error.error, c);
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
