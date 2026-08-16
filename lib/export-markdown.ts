/**
 * lib/export-markdown.ts — render a `Report` as a standalone Markdown document
 * (M4-4), including the full transcript.
 *
 * Pure string building so it is unit-testable and works in the browser without
 * any DOM dependency; `downloadMarkdown` handles the actual file save.
 */

import { getCopy, type Locale } from './i18n';
import { panelistLabel } from './panel/personas';
import { getDimension } from './rubric';
import { SITE } from './site';
import type { PanelistId, Report, SignalVerdict } from './types';
import { formatClock, formatDateTime, formatDuration } from './utils';

function verdictLabel(
  verdict: SignalVerdict,
  locale: Locale,
  kind: 'strong' | 'weak',
): string {
  const copy = getCopy(locale);
  if (kind === 'weak') {
    return verdict === 'present' ? copy.report.signalWeakPresent : copy.report.signalWeakAbsent;
  }
  if (verdict === 'present') return copy.report.signalStrong;
  if (verdict === 'partial') return copy.report.signalPartial;
  return copy.report.signalMissing;
}

/** Escape pipes so long quotes cannot break Markdown tables. */
function cell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

export function reportToMarkdown(report: Report, locale: Locale = report.locale): string {
  const copy = getCopy(locale);
  const lines: string[] = [];

  lines.push(`# ${copy.report.title} — ${copy.meta.appName}`);
  lines.push('');
  lines.push(`> ${copy.disclaimer.short}`);
  lines.push('');

  /* Session metadata. */
  lines.push(`## ${copy.report.metaTitle}`);
  lines.push('');
  lines.push(`- **${copy.setup.fieldName}:** ${report.profile.name || '-'}`);
  lines.push(
    `- **${copy.setup.fieldJenjang}:** ${
      report.profile.jenjang === 'doktor'
        ? copy.setup.fieldJenjangDoktor
        : copy.setup.fieldJenjangMagister
    }`,
  );
  lines.push(
    `- **${copy.setup.fieldTujuan}:** ${
      report.profile.tujuan === 'ln' ? copy.setup.fieldTujuanLN : copy.setup.fieldTujuanDN
    }`,
  );
  lines.push(
    `- **${copy.setup.fieldUniversitas}:** ${report.profile.universitas || '-'} — ${
      report.profile.prodi || '-'
    }`,
  );
  lines.push(`- **${copy.setup.fieldBidang}:** ${report.profile.bidang || '-'}`);
  lines.push(`- **${copy.report.metaDate}:** ${formatDateTime(report.createdAt, locale)}`);
  lines.push(
    `- **${copy.report.metaDuration}:** ${formatDuration(report.durationMs, locale)}`,
  );
  lines.push(`- **${copy.report.metaModel}:** ${report.model}`);
  lines.push(`- **${copy.report.metaAnswers}:** ${report.answerCount}`);
  lines.push(
    `- **${copy.report.metaPhasesCovered}:** ${report.phasesCovered
      .map((phase) => copy.phases[phase].name)
      .join(', ')}`,
  );
  lines.push('');

  /* Headline score. */
  lines.push(
    `## ${copy.report.totalScore}: ${report.totalScore}/100 — ${copy.bands[report.band].label}`,
  );
  lines.push('');
  lines.push(copy.bands[report.band].description);
  lines.push('');

  /* Dimension table. */
  const table = copy.report.dimensionTable;
  lines.push(`## ${copy.report.dimensionsTitle}`);
  lines.push('');
  lines.push(
    `| ${table.dimension} | ${table.owner} | ${table.weight} | ${table.score} | ${table.weighted} |`,
  );
  lines.push('|---|---|---:|---:|---:|');
  for (const dimension of report.dimensions) {
    const spec = getDimension(dimension.id);
    lines.push(
      `| ${cell(copy.rubric[dimension.id].name)} | ${cell(
        copy.panelists[spec.owner].name,
      )} | ${spec.weight} | ${dimension.score}/4 | ${dimension.weighted.toFixed(1)} |`,
    );
  }
  lines.push('');

  /* Per-dimension detail. */
  for (const dimension of report.dimensions) {
    const spec = getDimension(dimension.id);
    lines.push(
      `### ${copy.rubric[dimension.id].name} — ${dimension.score}/4 (${copy.report.scoreLabels[dimension.score]})`,
    );
    lines.push('');
    lines.push(`*${copy.panelists[spec.owner].name} · ${table.weight}: ${spec.weight}*`);
    lines.push('');
    lines.push(dimension.justification);
    lines.push('');

    if (dimension.quotes.length > 0) {
      lines.push(`**${copy.report.evidenceTitle}:**`);
      lines.push('');
      for (const quote of dimension.quotes) lines.push(`> “${quote}”`);
      lines.push('');
    }
    if (dimension.strengths.length > 0) {
      lines.push(`**${copy.report.strengthsTitle}:**`);
      lines.push('');
      for (const item of dimension.strengths) lines.push(`- ${item}`);
      lines.push('');
    }
    if (dimension.improvements.length > 0) {
      lines.push(`**${copy.report.weaknessesTitle}:**`);
      lines.push('');
      for (const item of dimension.improvements) lines.push(`- ${item}`);
      lines.push('');
    }
  }

  /* Panelist narratives. */
  if (report.panelNotes.length > 0) {
    lines.push(`## ${copy.report.panelNotesTitle}`);
    lines.push('');
    for (const note of report.panelNotes) {
      const panelist = copy.panelists[note.panelist];
      lines.push(`### ${panelist.name} — ${panelist.role}`);
      lines.push('');
      lines.push(note.narrative);
      lines.push('');
    }
  }

  /* Signal checklist. */
  lines.push(`## ${copy.report.signalsTitle}`);
  lines.push('');
  lines.push(`*${copy.report.signalsSubtitle}*`);
  lines.push('');

  lines.push(`### ${copy.report.signalStrongTitle}`);
  lines.push('');
  for (const check of report.strongSignals) {
    const label = copy.signals.strong[check.index];
    if (!label) continue;
    const verdict = verdictLabel(check.verdict, locale, 'strong');
    lines.push(`- **${verdict}** — ${label}${check.note ? ` · ${check.note}` : ''}`);
  }
  lines.push('');

  lines.push(`### ${copy.report.signalWeakTitle}`);
  lines.push('');
  for (const check of report.weakSignals) {
    const label = copy.signals.weak[check.index];
    if (!label) continue;
    const verdict = verdictLabel(check.verdict, locale, 'weak');
    lines.push(`- **${verdict}** — ${label}${check.note ? ` · ${check.note}` : ''}`);
  }
  lines.push('');

  /* Next steps. */
  if (report.nextSteps.length > 0) {
    lines.push(`## ${copy.report.nextStepsTitle}`);
    lines.push('');
    report.nextSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
    lines.push('');
  }

  /* Transcript. */
  lines.push(`## ${copy.report.transcriptTitle}`);
  lines.push('');
  for (const turn of report.turns) {
    if (turn.speaker === 'system') continue;
    const who =
      turn.speaker === 'user'
        ? copy.panelists.you.name
        : copy.panelists[turn.speaker as PanelistId].name;
    lines.push(`**[${formatClock(turn.atMs)}] ${who}:**`);
    lines.push('');
    lines.push(turn.text);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`${copy.disclaimer.body}`);
  lines.push('');
  lines.push(`${copy.footer.lpdpSourceNote} ${SITE.lpdpGuidanceUrl}`);
  lines.push('');
  lines.push(`${copy.meta.appName} — ${SITE.repoUrl}`);

  return lines.join('\n');
}

/** Filename such as `laporan-substansi-lpdp-budi-2025-08-16.md`. */
export function reportFileName(report: Report): string {
  const slug = (report.profile.name || 'kandidat')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const date = new Date(report.createdAt).toISOString().slice(0, 10);
  return `laporan-substansi-lpdp-${slug || 'kandidat'}-${date}.md`;
}

/** Trigger a client-side download of the Markdown report. */
export function downloadMarkdown(report: Report, locale: Locale): void {
  const markdown = reportToMarkdown(report, locale);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = reportFileName(report);
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
