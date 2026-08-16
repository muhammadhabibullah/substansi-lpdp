'use client';

/**
 * hooks/use-voice-input.ts — interview voice input lifecycle (P1-1).
 *
 * Wraps the browser SpeechRecognition API behind a small React hook: start /
 * stop listening, accumulate a confirmed transcript plus live interim words,
 * auto-restart when the engine ends a listening segment (it stops after a
 * pause), insert sentence breaks where the speaker pauses (the speech engine
 * emits no punctuation), and surface user-facing errors. The transcript
 * itself is exposed read-only — the interview screen never offers an edit
 * affordance.
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
  listening: boolean;
  /** Confirmed transcript accumulated so far. */
  transcript: string;
  /** Not-yet-final words, shown live and folded in on submit. */
  interim: string;
  error: VoiceErrorCode | null;
  start: () => void;
  /** Gracefully stop so pending words are finalized. */
  stop: () => void;
  /** Discard the transcript (start the answer over). */
  clear: () => void;
  /** Stop listening and return the full answer text, resetting state. */
  finish: () => string;
}

/** Delay before restarting a listening segment that the engine ended. */
const RESTART_DELAY_MS = 250;

export function useVoiceInput(options: UseVoiceInputOptions): UseVoiceInput {
  const [supported, setSupported] = React.useState(false);
  const [listening, setListening] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [interim, setInterim] = React.useState('');
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

  // Feature detection must run client-side only (SSR-safe).
  React.useEffect(() => {
    setSupported(isSpeechRecognitionSupported());
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
  }, [attach, teardown]);

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
    lastFinalAtRef.current = 0;
    boundaryPendingRef.current = false;
  }, []);

  const finish = React.useCallback(() => {
    stop();
    const text = finalizePunctuation(
      combineTranscript(textRef.current.transcript, textRef.current.interim),
    );
    setTranscript('');
    setInterim('');
    lastFinalAtRef.current = 0;
    boundaryPendingRef.current = false;
    return text;
  }, [stop]);

  // Never leave the microphone open after unmount.
  React.useEffect(() => teardown, [teardown]);

  return { supported, listening, transcript, interim, error, start, stop, clear, finish };
}
