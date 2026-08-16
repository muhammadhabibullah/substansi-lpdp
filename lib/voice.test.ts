import { describe, expect, it } from 'vitest';

import {
  appendFinalChunk,
  capitalizeFirst,
  combineTranscript,
  endsWithPunctuation,
  finalizePunctuation,
  mapRecognitionError,
  recognitionLang,
  SENTENCE_GAP_MS,
} from './voice';

describe('mapRecognitionError', () => {
  it('maps permission problems to denied', () => {
    expect(mapRecognitionError('not-allowed')).toBe('denied');
    expect(mapRecognitionError('service-not-allowed')).toBe('denied');
  });

  it('maps transport failures to network', () => {
    expect(mapRecognitionError('network')).toBe('network');
  });

  it('treats silence and our own aborts as benign', () => {
    expect(mapRecognitionError('no-speech')).toBeNull();
    expect(mapRecognitionError('aborted')).toBeNull();
  });

  it('falls back to other for unknown codes', () => {
    expect(mapRecognitionError('audio-capture')).toBe('other');
    expect(mapRecognitionError('')).toBe('other');
  });
});

describe('recognitionLang', () => {
  it('follows the session language', () => {
    expect(recognitionLang('id')).toBe('id-ID');
    expect(recognitionLang('en')).toBe('en-US');
  });
});

describe('combineTranscript', () => {
  it('joins final and interim text with a single space', () => {
    expect(combineTranscript('Selamat pagi.', 'Nama saya')).toBe(
      'Selamat pagi. Nama saya',
    );
  });

  it('collapses stray whitespace and trims', () => {
    expect(combineTranscript('  a  ', '  b ')).toBe('a b');
  });

  it('handles empty parts', () => {
    expect(combineTranscript('', '')).toBe('');
    expect(combineTranscript('', 'hanya interim')).toBe('hanya interim');
    expect(combineTranscript('hanya final', '')).toBe('hanya final');
  });
});

describe('appendFinalChunk', () => {
  it('accumulates chunks with tidy spacing', () => {
    let text = '';
    text = appendFinalChunk(text, 'Terima kasih.');
    text = appendFinalChunk(text, 'Perkenalkan,  saya Andi.');
    expect(text).toBe('Terima kasih. Perkenalkan, saya Andi.');
  });

  it('closes the previous sentence and capitalizes after a pause', () => {
    const text = appendFinalChunk(
      'Saya ingin belajar kebijakan publik',
      'beasiswa ini penting bagi karier saya',
      true,
    );
    expect(text).toBe(
      'Saya ingin belajar kebijakan publik. Beasiswa ini penting bagi karier saya',
    );
  });

  it('does not double sentence-final punctuation', () => {
    const text = appendFinalChunk('Benar!', 'lanjut ke kalimat kedua', true);
    expect(text).toBe('Benar! Lanjut ke kalimat kedua');
  });

  it('ignores the new-sentence flag on an empty transcript', () => {
    expect(appendFinalChunk('', 'kalimat pertama', true)).toBe('kalimat pertama');
  });
});

describe('sentence punctuation helpers', () => {
  it('SENTENCE_GAP_MS is a sensible pause threshold', () => {
    expect(SENTENCE_GAP_MS).toBeGreaterThanOrEqual(1000);
  });

  it('endsWithPunctuation recognises final marks incl. closing quotes', () => {
    expect(endsWithPunctuation('sudah.')).toBe(true);
    expect(endsWithPunctuation('sudah?')).toBe(true);
    expect(endsWithPunctuation('sudah!')).toBe(true);
    expect(endsWithPunctuation('sudah…”')).toBe(true);
    expect(endsWithPunctuation('belum')).toBe(false);
  });

  it('capitalizeFirst only touches the first letter', () => {
    expect(capitalizeFirst('  rencana studi')).toBe('Rencana studi');
    expect(capitalizeFirst('')).toBe('');
  });

  it('finalizePunctuation adds a trailing period only when missing', () => {
    expect(finalizePunctuation('jawaban saya begini')).toBe('jawaban saya begini.');
    expect(finalizePunctuation('sudah selesai.')).toBe('sudah selesai.');
    expect(finalizePunctuation('')).toBe('');
  });
});
