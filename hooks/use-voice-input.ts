'use client';

/**
 * hooks/use-voice-input.ts — interview voice input lifecycle (P1-1, P1-6).
 *
 * Wraps the browser SpeechRecognition API behind a small React hook: start /
 * stop listening, accumulate a confirmed transcript plus live interim words,
 * auto-restart when the engine ends a listening segment (it stops after a
 * pause), insert sentence breaks where the speaker pauses (the speech engine
 * emits no punctuation), and surface user-facing errors. While listening the
 * transcript is read-only (live recognition overwrites it); once listening
 * stops, the candidate may edit the text before sending (P1-6).
 */

import * as React from 'react';

import {
  appendFinalChunk,
  combineTranscript,
  createRecognition,
  finalizePunctuation,
  isSpeechRecognitionSupported,
  mapRecognitionError,
  SENTENCE_GAP_MS,
  type SpeechRecognitionEventLike,
  type SpeechRecognitionLike,
  type VoiceErrorCode,
} from '@/lib/voice';

export interface UseVoiceInputOptions {
  /** BCP-47 tag the engine listens in (follows the session language). */
  lang: string;
}

export interface UseVoiceInput {
  /** Whether this browser exposes SpeechRecognition at all. */
  supported: boolean;
  /** True once the browser support check has run (avoids first-paint flash). */
  checked: boolean;
  listening: boolean;
  /** Confirmed transcript accumulated so far. */
  transcript: string;
  /** Not-yet-final words, shown live and folded in on submit. */
  interim: string;
  /**
   * Cumulative listening time for the answer being recorded. Advances only
   * while the mic is live (pauses with it) and resets when the transcript is
   * cleared or submitted — drives the WhatsApp-style recording clock.
   */
  elapsedMs: number;
  error: VoiceErrorCode | null;
  start: () => void;
  /** Gracefully stop so pending words are finalized. */
  stop: () => void;
  /** Discard the transcript (start the answer over). */
  clear: () => void;
  /** Replace the transcript — editing the answer after listening stops. */
  setText: (text: string) => void;
  /** Stop listening and return the full answer text, resetting state. */
  finish: () => string;
}

/** Delay before restarting a listening segment that the engine ended. */
const RESTART_DELAY_MS = 250;

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInput {
  const [supported, setSupported] = React.useState(false);
  const [checked, setChecked] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [interim, setInterim] = React.useState('');
  const [elapsedMs, setElapsedMs] = React.useState(0);
  const [error, setError] = React.useState<VoiceErrorCode | null>(null);

  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  /** True while the user intends to keep listening (guards auto-restart). */
  const activeRef = React.useRef(false);
  const restartTimerRef = React.useRef<number | null>(null);
  const langRef = React.useRef(options.lang);
  langRef.current = options.lang;

  // Sentence-boundary detection: the speech engine emits no punctuation, so a
  // pause between utterances (or a session restart after silence) marks the
  // end of a sentence. `lastFinalAt` is when the last finalized chunk
  // arrived; `boundaryPending` means the next final chunk starts a sentence.
  const lastFinalAtRef = React.useRef(0);
  const boundaryPendingRef = React.useRef(false);

  // Latest text for synchronous reads (e.g. `finish` on submit).
  const textRef = React.useRef({ transcript: '', interim: '' });
  textRef.current = { transcript, interim };

  // Recording clock: while listening, an interval re-renders `elapsedMs` from
  // the current segment start; when listening stops the segment is folded into
  // `elapsedAccumRef` so pausing freezes the clock and resuming continues it.
  const elapsedAccumRef = React.useRef(0);
  React.useEffect(() => {
    if (!listening) return;
    const segmentStart = Date.now();
    const base = elapsedAccumRef.current;
    const timer = window.setInterval(() => {
      setElapsedMs(base + Date.now() - segmentStart);
    }, 250);
    return () => {
      window.clearInterval(timer);
      elapsedAccumRef.current = base + Date.now() - segmentStart;
      setElapsedMs(elapsedAccumRef.current);
    };
  }, [listening]);

  const resetElapsed = React.useCallback(() => {
    elapsedAccumRef.current = 0;
    setElapsedMs(0);
  }, []);

  // Feature detection must run client-side only (SSR-safe).
  React.useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
    setChecked(true);
  }, []);

  const clearRestartTimer = React.useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  const teardown = React.useCallback(() => {
    activeRef.current = false;
    clearRestartTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* already stopped — nothing to do */
      }
      recognitionRef.current = null;
    }
    setListening(false);
  }, [clearRestartTimer]);

  const attach = React.useCallback(
    (recognition: SpeechRecognitionLike) => {
      recognition.onresult = (event: SpeechRecognitionEventLike) => {
        let finalChunk = '';
        let interimChunk = '';
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results.item(i);
          if (result.length === 0) continue;
          const text = result.item(0).transcript;
          if (result.isFinal) {
            finalChunk += text;
          } else {
            interimChunk += text;
          }
        }

        const now = Date.now();
        if (finalChunk.length > 0) {
          const newSentence = boundaryPendingRef.current;
          boundaryPendingRef.current = false;
          setTranscript((prev) => appendFinalChunk(prev, finalChunk, newSentence));
          lastFinalAtRef.current = now;
        } else if (
          interimChunk.length > 0 &&
          textRef.current.transcript.length > 0 &&
          !boundaryPendingRef.current &&
          lastFinalAtRef.current > 0 &&
          now - lastFinalAtRef.current >= SENTENCE_GAP_MS
        ) {
          // Speech resumed after a long pause: a new sentence is starting.
          boundaryPendingRef.current = true;
        }
        setInterim(interimChunk);
      };

      recognition.onerror = (event) => {
        const mapped = mapRecognitionError(event.error);
        // Benign codes (silence, our own abort) resolve via the restart
        // loop / teardown; anything else stops listening with a message.
        if (mapped === null) return;
        setError(mapped);
        teardown();
      };

      recognition.onend = () => {
        if (!activeRef.current) return;
        // Engines end a segment after a short pause; restart so the
        // candidate can keep speaking without pressing the mic again.
        clearRestartTimer();
        restartTimerRef.current = window.setTimeout(() => {
          restartTimerRef.current = null;
          if (!activeRef.current) return;
          const next = createRecognition(langRef.current);
          if (!next) {
            teardown();
            return;
          }
          recognitionRef.current = next;
          attach(next);
          if (textRef.current.transcript.length > 0) {
            // The segment ended in silence — what follows is a new sentence.
            boundaryPendingRef.current = true;
          }
          try {
            next.start();
          } catch {
            setError('other');
            teardown();
          }
        }, RESTART_DELAY_MS);
      };
    },
    [clearRestartTimer, teardown],
  );

  const start = React.useCallback(() => {
    if (activeRef.current) return;
    setError(null);
    if (textRef.current.transcript.length === 0) resetElapsed();
    lastFinalAtRef.current = 0;
    boundaryPendingRef.current = false;
    const recognition = createRecognition(langRef.current);
    if (!recognition) {
      setSupported(false);
      return;
    }
    activeRef.current = true;
    recognitionRef.current = recognition;
    attach(recognition);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError('other');
      teardown();
    }
  }, [attach, teardown, resetElapsed]);

  const stop = React.useCallback(() => {
    activeRef.current = false;
    clearRestartTimer();
    const recognition = recognitionRef.current;
    if (recognition) {
      try {
        // stop() (not abort()) lets pending interim words become final.
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }
    setListening(false);
  }, [clearRestartTimer]);

  const clear = React.useCallback(() => {
    setTranscript('');
    setInterim('');
    setError(null);
    resetElapsed();
    lastFinalAtRef.current = 0;
    boundaryPendingRef.current = false;
  }, [resetElapsed]);

  /**
   * Manual edit of the transcript (P1-6). Editing counts as recent activity
   * for the sentence-gap heuristic, so resuming the mic right after an edit
   * appends to the same sentence instead of forcing a boundary.
   */
  const setText = React.useCallback((text: string) => {
    setTranscript(text);
    setInterim('');
    lastFinalAtRef.current = Date.now();
    boundaryPendingRef.current = false;
  }, []);

  const finish = React.useCallback(() => {
    stop();
    const text = finalizePunctuation(
      combineTranscript(textRef.current.transcript, textRef.current.interim),
    );
    setTranscript('');
    setInterim('');
    resetElapsed();
    lastFinalAtRef.current = 0;
    boundaryPendingRef.current = false;
    return text;
  }, [stop, resetElapsed]);

  // Never leave the microphone open after unmount.
  React.useEffect(() => teardown, [teardown]);

  return {
    supported,
    checked,
    listening,
    transcript,
    interim,
    elapsedMs,
    error,
    start,
    stop,
    clear,
    setText,
    finish,
  };
}
