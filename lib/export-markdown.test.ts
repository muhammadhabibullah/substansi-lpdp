import { describe, expect, it } from 'vitest';

import { reportFileName, reportToMarkdown } from './export-markdown';
import { getCopy } from './i18n';
import { RUBRIC, weightedPoints } from './rubric';
import { EMPTY_PROFILE, type Report, type Score } from './types';

function makeReport(over: Partial<Report> = {}): Report {
  return {
    id: 'report_1',
    sessionId: 'session_1',
    createdAt: Date.UTC(2025, 7, 16, 3, 0, 0),
    locale: 'id',
    profile: {
      ...EMPTY_PROFILE,
      name: 'Sri Wahyuni',
      jenjang: 'magister',
      tujuan: 'ln',
      universitas: 'University of Melbourne',
      prodi: 'Master of Public Health',
      bidang: 'kesehatan masyarakat',
    },
    model: 'gpt-5-mini',
    durationMs: 42 * 60_000,
    phasesCovered: ['opening', 'motivation', 'studyPlan'],
    answerCount: 9,
    totalScore: 72,
    band: 'direkomendasikan',
    dimensions: RUBRIC.map((dimension) => ({
      id: dimension.id,
      score: 3 as Score,
      weighted: weightedPoints(3, dimension.weight),
      justification: `Justifikasi untuk ${dimension.id}.`,
      quotes: [`Kutipan ${dimension.id}`],
      strengths: [`Kekuatan ${dimension.id}`],
      improvements: [`Perbaikan ${dimension.id}`],
    })),
    panelNotes: [
      { panelist: 'akademisi', narrative: 'Catatan akademisi.' },
      { panelist: 'psikolog', narrative: 'Catatan psikolog.' },
      { panelist: 'lpdp', narrative: 'Catatan LPDP.' },
    ],
    strongSignals: [{ index: 0, verdict: 'present', note: 'terlihat jelas' }],
    weakSignals: [{ index: 0, verdict: 'absent', note: '' }],
    nextSteps: ['Sebutkan target angka kontribusi.', 'Siapkan contoh kepemimpinan.'],
    turns: [
      {
        id: 't1',
        speaker: 'akademisi',
        text: 'Jelaskan metodologi Anda.',
        atMs: 65_000,
        phase: 'studyPlan',
        lang: 'id',
      },
      {
        id: 't2',
        speaker: 'user',
        text: 'Saya memakai pemodelan deret waktu.',
        atMs: 90_000,
        phase: 'studyPlan',
        lang: 'id',
      },
      {
        id: 't3',
        speaker: 'system',
        text: 'Catatan sistem yang tidak perlu diekspor.',
        atMs: 95_000,
        phase: 'studyPlan',
        lang: 'id',
      },
    ],
    ...over,
  };
}

describe('reportToMarkdown', () => {
  const copy = getCopy('id');

  it('opens with a title and the disclaimer (hard constraint #6)', () => {
    const markdown = reportToMarkdown(makeReport());
    expect(markdown.startsWith('# ')).toBe(true);
    expect(markdown).toContain(copy.disclaimer.short);
    expect(markdown).toContain(copy.disclaimer.body);
  });

  it('includes the headline score and band', () => {
    const markdown = reportToMarkdown(makeReport());
    expect(markdown).toContain('72/100');
    expect(markdown).toContain(copy.bands.direkomendasikan.label);
  });

  it('renders a row for every rubric dimension', () => {
    const markdown = reportToMarkdown(makeReport());
    for (const dimension of RUBRIC) {
      expect(markdown).toContain(copy.rubric[dimension.id].name);
    }
  });

  it('includes evidence quotes as blockquotes', () => {
    const markdown = reportToMarkdown(makeReport());
    expect(markdown).toContain('> “Kutipan studyPlan”');
  });

  it('includes per-panelist narratives', () => {
    const markdown = reportToMarkdown(makeReport());
    expect(markdown).toContain('Catatan akademisi.');
    expect(markdown).toContain('Catatan psikolog.');
    expect(markdown).toContain('Catatan LPDP.');
  });

  it('includes the signal checklist and next steps', () => {
    const markdown = reportToMarkdown(makeReport());
    expect(markdown).toContain(copy.report.signalStrongTitle);
    expect(markdown).toContain(copy.signals.strong[0]!);
    expect(markdown).toContain('1. Sebutkan target angka kontribusi.');
  });

  it('includes the full transcript with timestamps', () => {
    const markdown = reportToMarkdown(makeReport());
    expect(markdown).toContain(copy.report.transcriptTitle);
    expect(markdown).toContain('[01:05]');
    expect(markdown).toContain('Saya memakai pemodelan deret waktu.');
  });

  it('omits system turns from the transcript', () => {
    const markdown = reportToMarkdown(makeReport());
    expect(markdown).not.toContain('Catatan sistem yang tidak perlu diekspor.');
  });

  it('escapes pipes so long quotes cannot break tables', () => {
    const report = makeReport();
    const first = report.dimensions[0]!;
    const markdown = reportToMarkdown({
      ...report,
      dimensions: [{ ...first, quotes: ['a | b'] }, ...report.dimensions.slice(1)],
    });
    // Table cells built from copy must not gain an unescaped pipe.
    const tableLines = markdown
      .split('\n')
      .filter((line) => line.startsWith('| ') && line.includes('/4'));
    for (const line of tableLines) {
      expect(line.split('|').length).toBe(7);
    }
  });

  it('renders in English when asked', () => {
    const english = getCopy('en');
    const markdown = reportToMarkdown(makeReport(), 'en');
    expect(markdown).toContain(english.report.title);
    expect(markdown).toContain(english.bands.direkomendasikan.label);
  });

  it('survives a report with no quotes, notes, or next steps', () => {
    const report = makeReport({
      panelNotes: [],
      nextSteps: [],
      strongSignals: [],
      weakSignals: [],
      dimensions: RUBRIC.map((dimension) => ({
        id: dimension.id,
        score: 2 as Score,
        weighted: weightedPoints(2, dimension.weight),
        justification: '',
        quotes: [],
        strengths: [],
        improvements: [],
      })),
    });
    expect(() => reportToMarkdown(report)).not.toThrow();
  });
});

describe('reportFileName', () => {
  it('slugifies the candidate name and stamps the date', () => {
    expect(reportFileName(makeReport())).toBe(
      'laporan-substansi-lpdp-sri-wahyuni-2025-08-16.md',
    );
  });

  it('strips accents and punctuation', () => {
    const report = makeReport({
      profile: { ...EMPTY_PROFILE, name: 'José Ángel O\u2019Brien!' },
    });
    expect(reportFileName(report)).toMatch(/^laporan-substansi-lpdp-jose-angel-o-brien-/);
  });

  it('falls back when the name is empty', () => {
    const report = makeReport({ profile: { ...EMPTY_PROFILE, name: '' } });
    expect(reportFileName(report)).toContain('kandidat');
  });

  it('always produces a .md filename', () => {
    expect(reportFileName(makeReport()).endsWith('.md')).toBe(true);
  });
});
