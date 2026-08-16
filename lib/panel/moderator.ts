/**
 * lib/panel/moderator.ts — the cheap "who speaks next, and about what" step
 * (PLAN §3).
 *
 * Given the phase, elapsed time, and the last exchange, it returns a panelist
 * plus a probing directive. It runs on the cheap model tier with a small prompt.
 *
 * A deterministic fallback (`fallbackDecision`) covers the case where the model
 * is unavailable or returns junk, so the interview never stalls on this step.
 */

import { completeJson, type CoreMessage } from '../llm';
import type {
  DocumentSet,
  LlmSettings,
  PanelistId,
  PhaseId,
  Profile,
  TranscriptTurn,
} from '../types';
import { docLabel, primaryAcademicDoc } from '../documents';
import { getPhase, shouldWrapUp } from './phases';
import { isPanelistId, panelistLabel } from './personas';

export interface ModeratorDecision {
  panelist: PanelistId;
  /** Instruction handed to the chosen panelist for this turn. */
  directive: string;
  /** True when this decision came from the fallback, not the model. */
  fallback?: boolean;
}

export interface ModeratorContext {
  phase: PhaseId;
  elapsedMs: number;
  remainingMs: number;
  /** Panelist questions asked so far in the current phase. */
  questionsInPhase: number;
  lastSpeaker: PanelistId | null;
  /** Recent transcript, oldest first. */
  history: readonly TranscriptTurn[];
  profile: Profile;
  documents: DocumentSet;
}

/** How many recent turns the moderator sees. Small on purpose — it is cheap. */
const MODERATOR_HISTORY_WINDOW = 6;

/* ── Deterministic fallback ──────────────────────────────────────────────── */

/**
 * Pick a speaker without an LLM: prefer the phase lead, but avoid the panelist
 * who just spoke so the panel does not monologue.
 */
export function fallbackDecision(context: ModeratorContext): ModeratorDecision {
  const phase = getPhase(context.phase);
  const participants = phase.participants;

  let panelist: PanelistId = phase.lead;
  if (context.lastSpeaker === phase.lead && participants.length > 1) {
    // Rotate to the next participant after the lead.
    const others = participants.filter((id) => id !== context.lastSpeaker);
    // Alternate deterministically using the question count.
    panelist = others[context.questionsInPhase % others.length] ?? phase.lead;
  }

  return {
    panelist,
    directive: fallbackDirective(context.phase, context.profile, context.questionsInPhase),
    fallback: true,
  };
}

function fallbackDirective(
  phase: PhaseId,
  profile: Profile,
  questionsInPhase: number,
): string {
  const academicDoc = docLabel(primaryAcademicDoc(profile.jenjang));

  const byPhase: Record<PhaseId, string[]> = {
    opening: [
      'Sapa kandidat, perkenalkan panel secara singkat, dan minta ia memperkenalkan diri secara ringkas.',
      'Minta kandidat menjelaskan secara singkat latar belakang pendidikan dan pekerjaannya saat ini.',
    ],
    motivation: [
      'Tanyakan mengapa kandidat memilih melanjutkan studi pada jenjang dan bidang ini, dan mengapa sekarang.',
      'Gali titik balik konkret dalam perjalanan kandidat yang membuatnya memilih bidang ini. Minta contoh spesifik.',
      'Tanyakan mengapa memilih universitas dan program studi tujuan tersebut dibandingkan alternatif lain.',
    ],
    studyPlan: [
      `Minta kandidat menjelaskan inti ${academicDoc}-nya: masalah yang diangkat dan mengapa itu penting.`,
      'Bedah metodologi yang dipilih kandidat. Tanyakan kelayakan data, waktu, dan sumber daya.',
      'Tanyakan siapa calon pembimbing atau kelompok riset yang relevan, dan mengapa mereka cocok.',
      'Uji penguasaan konsep inti di bidang kandidat dengan satu pertanyaan teknis.',
      'Tanyakan risiko terbesar dari rencana studi/riset ini dan rencana mitigasinya.',
    ],
    personality: [
      'Minta cerita konkret tentang kegagalan atau penolakan yang pernah dialami kandidat dan bagaimana ia menghadapinya.',
      'Tanyakan kelemahan terbesar kandidat dan bukti nyata upaya memperbaikinya.',
      profile.tujuan === 'ln'
        ? 'Gali kesiapan kandidat dan keluarganya untuk tinggal jauh dari Indonesia selama masa studi.'
        : 'Gali kesiapan kandidat mengatur pekerjaan, keluarga, dan studi penuh waktu secara bersamaan.',
      'Cari satu ketidaksesuaian antara jawaban kandidat dan dokumennya, lalu tanyakan secara langsung.',
    ],
    contribution: [
      'Minta kandidat menjabarkan rencana kontribusinya setelah studi: siapa penerima manfaat dan lewat lembaga apa.',
      'Paksa rencana kontribusi menjadi terukur: minta angka target, tenggat waktu, dan indikator keberhasilan.',
      'Uji komitmen kembali dengan skenario tawaran kerja bergaji tinggi di luar negeri setelah lulus.',
      'Tanyakan bagaimana bidang kandidat menjawab prioritas pembangunan Indonesia saat ini.',
    ],
    closing: [
      'Ajukan satu pertanyaan terakhir tentang hal yang masih belum jelas dari jawaban kandidat.',
      'Sampaikan bahwa waktu hampir habis dan minta kandidat menyampaikan closing statement singkat.',
    ],
  };

  const options = byPhase[phase];
  return options[Math.min(questionsInPhase, options.length - 1)] ?? options[0]!;
}

/* ── LLM-backed decision ─────────────────────────────────────────────────── */

function buildModeratorMessages(context: ModeratorContext): CoreMessage[] {
  const phase = getPhase(context.phase);
  const window = context.history.slice(-MODERATOR_HISTORY_WINDOW);

  const transcript =
    window.length > 0
      ? window
          .map((turn) => {
            const who =
              turn.speaker === 'user'
                ? 'KANDIDAT'
                : turn.speaker === 'system'
                  ? 'SISTEM'
                  : panelistLabel(turn.speaker).toUpperCase();
            // Keep the moderator prompt small: excerpt long turns.
            const text =
              turn.text.length > 700 ? `${turn.text.slice(0, 700)}…` : turn.text;
            return `${who}: ${text}`;
          })
          .join('\n\n')
      : '(belum ada percakapan — wawancara baru dimulai)';

  const system = [
    'Anda adalah moderator sebuah panel wawancara Seleksi Substansi LPDP. Anda TIDAK berbicara kepada kandidat.',
    'Tugas Anda: memilih pewawancara mana yang bicara berikutnya, dan memberi satu instruksi tajam tentang apa yang harus digali.',
    '',
    'PEWAWANCARA YANG TERSEDIA:',
    '- "akademisi": profesor di bidang kandidat. Menguji rencana studi/riset, metodologi, penguasaan bidang, kesesuaian kampus, dan bahasa Inggris akademik.',
    '- "psikolog": menguji autentisitas motivasi, resiliensi, kesadaran diri, kesiapan personal, dan konsistensi jawaban vs dokumen.',
    '- "lpdp": perwakilan LPDP. Menguji nasionalisme, komitmen kembali ke Indonesia, dan rencana kontribusi yang konkret dan terukur.',
    '',
    'PRINSIP MEMILIH:',
    `1. Pemimpin tahap ini adalah "${phase.lead}". Utamakan dia, tetapi jangan biarkan satu orang bicara dua kali berturut-turut jika ada pewawancara lain yang relevan.`,
    `2. Pewawancara yang boleh bicara pada tahap ini: ${phase.participants.join(', ')}.`,
    '3. Jika jawaban terakhir kandidat mengandung klaim tanpa bukti, kontradiksi dengan dokumen, atau jawaban normatif — perintahkan menggali itu.',
    '4. Jika kandidat sudah menjawab tuntas, pindah ke aspek lain yang belum diuji pada tahap ini.',
    '5. Directive harus SPESIFIK dan merujuk isi jawaban atau dokumen kandidat. Contoh baik: "Kejar kontradiksi antara klaim memimpin tim 20 orang dan CV yang hanya menyebut anggota tim."',
    '',
    'FORMAT KELUARAN: JSON mentah saja, tanpa penjelasan, tanpa markdown:',
    '{"panelist":"akademisi|psikolog|lpdp","directive":"satu instruksi dalam Bahasa Indonesia, maksimal 2 kalimat"}',
  ].join('\n');

  const user = [
    `TAHAP: ${context.phase} (${phase.minutes} menit dijatah)`,
    `PERTANYAAN PADA TAHAP INI: ${context.questionsInPhase}`,
    `SISA WAKTU WAWANCARA: ${Math.round(context.remainingMs / 60_000)} menit`,
    `PEWAWANCARA TERAKHIR: ${context.lastSpeaker ?? '(belum ada)'}`,
    shouldWrapUp(context.elapsedMs)
      ? 'STATUS: waktu hampir habis — arahkan ke penutup, jangan buka topik baru yang panjang.'
      : 'STATUS: waktu masih cukup.',
    '',
    'CUPLIKAN PERCAKAPAN TERAKHIR:',
    transcript,
    '',
    'Tentukan pewawancara berikutnya dan directive-nya. Balas dengan JSON saja.',
  ].join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** Validate the moderator's JSON, restricted to panelists allowed in the phase. */
function parseDecision(value: unknown, context: ModeratorContext): ModeratorDecision {
  if (typeof value !== 'object' || value === null) {
    throw new Error('moderator response was not an object');
  }
  const record = value as Record<string, unknown>;
  const panelist = record.panelist;
  const directive = record.directive;

  if (!isPanelistId(panelist)) {
    throw new Error(`moderator returned invalid panelist: ${String(panelist)}`);
  }
  if (typeof directive !== 'string' || directive.trim().length === 0) {
    throw new Error('moderator returned an empty directive');
  }

  const allowed = getPhase(context.phase).participants;
  const safePanelist = allowed.includes(panelist) ? panelist : getPhase(context.phase).lead;

  return { panelist: safePanelist, directive: directive.trim() };
}

/**
 * Choose the next speaker and directive. Never throws: on any failure it falls
 * back to the deterministic rotation so the interview keeps moving.
 */
export async function decideNextSpeaker(
  context: ModeratorContext,
  settings: LlmSettings,
  signal?: AbortSignal,
): Promise<ModeratorDecision> {
  try {
    return await completeJson({
      settings,
      messages: buildModeratorMessages(context),
      tier: 'cheap',
      temperature: 0.4,
      maxTokens: 220,
      signal,
      validate: (value) => parseDecision(value, context),
    });
  } catch (error) {
    // An aborted turn must propagate: the user navigated away or ended early.
    if (
      error instanceof DOMException && error.name === 'AbortError'
    ) {
      throw error;
    }
    if (
      typeof error === 'object' &&
      error !== null &&
      (error as { kind?: unknown }).kind === 'aborted'
    ) {
      throw error;
    }
    return fallbackDecision(context);
  }
}
