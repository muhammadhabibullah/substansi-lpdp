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
import { isPanelistId, PANELIST_IDS, panelistLabel } from './personas';

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

/**
 * Strict interjection cap (user feedback #4): a panelist who does not lead the
 * current block may ask at most this many questions in it. Enforced
 * deterministically on every decision path — the model cannot override it.
 */
export const MAX_INTERJECTIONS_PER_BLOCK = 1;

/* ── Interjection budget ─────────────────────────────────────────────────── */

/**
 * How many questions `panelist` has already asked inside the current lead's
 * block. A "block" is the run of phases led by the same panelist (Akademisi:
 * opening + studyPlan; Psikolog: motivation + personality; Tim LPDP:
 * contribution + closing). The lead's own questions never count — they are
 * hosting their session, not interjecting in it.
 */
export function interjectionsInBlock(
  context: Pick<ModeratorContext, 'phase' | 'history'>,
  panelist: PanelistId,
): number {
  const lead = getPhase(context.phase).lead;
  if (panelist === lead) return 0;
  return context.history.filter(
    (turn) => turn.speaker === panelist && getPhase(turn.phase).lead === lead,
  ).length;
}

/** Whether `panelist` may still be given the floor in the current phase. */
export function mayInterject(
  context: Pick<ModeratorContext, 'phase' | 'history'>,
  panelist: PanelistId,
): boolean {
  return (
    getPhase(context.phase).lead === panelist ||
    interjectionsInBlock(context, panelist) < MAX_INTERJECTIONS_PER_BLOCK
  );
}

/**
 * Redirect an exhausted interjector back to the block lead, keeping the
 * directive. Applied to every moderator decision, model-based or fallback.
 */
export function applyInterjectionCap(
  context: Pick<ModeratorContext, 'phase' | 'history'>,
  decision: ModeratorDecision,
): ModeratorDecision {
  if (mayInterject(context, decision.panelist)) return decision;
  return { ...decision, panelist: getPhase(context.phase).lead };
}

/* ── Deterministic fallback ──────────────────────────────────────────────── */

/**
 * Pick a speaker without an LLM: prefer the phase lead, but avoid the panelist
 * who just spoke so the panel does not monologue. Panelists who already used
 * their single interjection in this block are never picked again.
 */
export function fallbackDecision(context: ModeratorContext): ModeratorDecision {
  const phase = getPhase(context.phase);
  const participants = phase.participants;

  let panelist: PanelistId = phase.lead;
  if (context.lastSpeaker === phase.lead && participants.length > 1) {
    // Rotate to the next participant after the lead — but only among those
    // who still have interjection budget left in this block.
    const others = participants.filter(
      (id) => id !== context.lastSpeaker && mayInterject(context, id),
    );
    if (others.length > 0) {
      // Alternate deterministically using the question count.
      panelist = others[context.questionsInPhase % others.length] ?? phase.lead;
    }
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
    '- "lpdp": Tim LPDP (perwakilan LPDP/Kemenkeu). Menguji nasionalisme, komitmen kembali ke Indonesia, dan rencana kontribusi yang konkret dan terukur.',
    '',
    'PRINSIP MEMILIH:',
    `1. Urutan sesi tetap dan ketat: blok Akademisi (pembukaan + rencana studi) → blok Psikolog (motivasi + kepribadian) → blok Tim LPDP (kontribusi + penutup). Pemimpin tahap ini adalah "${phase.lead}" — beri dia sebagian besar giliran pada tahap ini.`,
    `2. Pewawancara yang boleh bicara pada tahap ini: ${phase.participants.join(', ')}.`,
    '3. Pewawancara di luar pemimpin tahap hanya boleh menyela dengan SATU pertanyaan lanjutan singkat per blok sesi untuk mengklarifikasi poin dari jawaban terakhir yang menarik bagi mereka — setelah itu kembalikan giliran ke pemimpin tahap. Batas ini MUTLAK dan dipaksakan sistem: pewawancara yang jatah selanya sudah habis tidak akan mendapat giliran lagi di blok ini, jadi jangan pilih mereka.',
    '4. Jatah waktu bertanya tiap pewawancara sekitar 20 menit selama seluruh sesi. Seimbangkan giliran memakai jumlah pertanyaan tiap pewawancara di bawah — jangan beri giliran baru ke pewawancara yang sudah jauh lebih banyak bicara, kecuali ada alasan mendesak.',
    '5. Jika jawaban terakhir kandidat mengandung klaim tanpa bukti, kontradiksi dengan dokumen, atau jawaban normatif — perintahkan menggali itu.',
    '6. Jika kandidat sudah menjawab tuntas, pindah ke aspek lain yang belum diuji pada tahap ini.',
    '7. Directive harus SPESIFIK dan merujuk isi jawaban atau dokumen kandidat. Contoh baik: "Kejar kontradiksi antara klaim memimpin tim 20 orang dan CV yang hanya menyebut anggota tim."',
    '',
    'FORMAT KELUARAN: JSON mentah saja, tanpa penjelasan, tanpa markdown:',
    '{"panelist":"akademisi|psikolog|lpdp","directive":"satu instruksi dalam Bahasa Indonesia, maksimal 2 kalimat"}',
  ].join('\n');

  const questionCounts = PANELIST_IDS.map((id) => {
    const asked = context.history.filter((turn) => turn.speaker === id).length;
    return `${panelistLabel(id)} ${asked}`;
  }).join(', ');

  const interjectionBudget = PANELIST_IDS.filter((id) => id !== phase.lead)
    .map(
      (id) =>
        `${panelistLabel(id)} ${interjectionsInBlock(context, id)}/${MAX_INTERJECTIONS_PER_BLOCK}`,
    )
    .join(', ');

  const user = [
    `TAHAP: ${context.phase} (${phase.minutes} menit dijatah)`,
    `PERTANYAAN PADA TAHAP INI: ${context.questionsInPhase}`,
    `JUMLAH PERTANYAAN SEJAUH INI: ${questionCounts}`,
    `JATAH SELA DI BLOK INI (maks ${MAX_INTERJECTIONS_PER_BLOCK} tiap pewawancara): ${interjectionBudget}`,
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
  let safePanelist = allowed.includes(panelist) ? panelist : getPhase(context.phase).lead;
  // Strict cap: a panelist who already interjected once in this block is
  // redirected to the block lead, whatever the model decided.
  safePanelist = applyInterjectionCap(context, { panelist: safePanelist, directive }).panelist;

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
