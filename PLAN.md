# Substansi LPDP — AI Mock Interviewer

Open-source web app that simulates the **Seleksi Substansi (wawancara) LPDP** with a three-person AI panel, conducted primarily in Bahasa Indonesia (with English segments for overseas applicants), and ends with a structured grading report and specific feedback.

## 1. Product Overview

### User journey
1. **Setup** — User uploads/pastes the same materials they submitted to LPDP:
   - CV / riwayat hidup
   - Rencana studi (study plan) — for Magister
   - Proposal penelitian — for Doktor
   - Essay kontribusi ("Komitmen kembali ke Indonesia dan rencana kontribusi pasca studi")
   - Program details: jenjang (Magister/Doktor), dalam negeri / luar negeri, universitas & prodi tujuan, LoA status (unconditional/conditional/none), skema beasiswa (Reguler/PTUD/Afirmasi/Targeted)
2. **Interview** — Real-time chat with a 3-panelist AI board, up to **60 minutes** (visible countdown timer; the panel wraps up naturally as time runs out or user can end early).
3. **Report** — Scored rubric + specific, quotable feedback ("saat ditanya X, jawaban Anda Y — sebaiknya Z"), downloadable as Markdown/PDF.

### The three panelists (per LPDP's real format)
| Panelist | Persona | Focus |
|---|---|---|
| **Akademisi** | Professor in the *user's own field* (derived from uploaded study plan/proposal) | Depth of study plan, research feasibility, university/prodi fit, academic readiness, English follow-ups for overseas applicants |
| **Psikolog** | Professional psychologist | Motivation authenticity, resilience, self-awareness, family/personal readiness to live abroad, stress questions, consistency of answers vs documents |
| **Tim LPDP** | LPDP/Kemenkeu representative | Nationalism & komitmen kembali ke Indonesia, rencana kontribusi konkret & terukur, alignment with national priorities, funding accountability, integrity |

Panelists take turns naturally (a lightweight "moderator" model decides who speaks next), interrupt with follow-ups, and probe inconsistencies between answers and the uploaded documents.

### Language behavior
- Default: **Bahasa Indonesia**, formal-professional register.
- If program tujuan is **luar negeri**: the Akademisi periodically switches to English mid-interview ("Could you explain your research methodology in English?") and evaluates fluency; sudden switches are intentional, mirroring real LPDP interviews.
- User answers in either language; the panel responds accordingly.

## 2. Grounding: what the panel evaluates (from LPDP's own guidance)

Source: [Ini yang Perlu Disiapkan untuk Hadapi Seleksi Substansi LPDP](https://lpdp.kemenkeu.go.id/beasiswa/serba-serbi/ini-yang-perlu-disiapkan-untuk-hadapi-seleksi-substansi-lpdp) (LPDP, Okt 2024).

**Strong-candidate signals** (the rubric rewards these):
- Structured, connected flow of ideas
- Demonstrated leadership qualities
- Concrete examples and strong experiences (not normative/generic answers)
- Professional demeanor, enthusiastic tone
- Ambitious **and measurable** future plans, with the *how*
- Authentic answers; unique experiences relevant to academic goals
- Confident highlighting of key achievements
- Dedicated, **concrete** plan to give back to society (kontribusi)
- Genuine passion for the chosen field

**Weak-candidate signals** (the rubric penalizes these):
- Unstructured, unfocused delivery
- Low enthusiasm, hesitant tone
- Reading from a script / memorized-sounding, repetitive answers
- Self-promotion without substance/achievements
- Normative, overly general answers
- Contribution plan that is vague or unconvincing
- Future plans without specific, measurable steps

These map directly into the grading rubric (§5) and into each panelist's probing instructions.

## 3. Architecture

### Stack
- **Next.js (App Router) + TypeScript** with **static export** (`output: 'export'`) — no server, no API routes; the whole app is static files.
- Hosting: **GitHub Pages**, deployed by GitHub Actions on every push to `main`. Self-hosting = opening the same URL, or `git clone && pnpm build` for a local copy.
- UI: Tailwind CSS + shadcn/ui; chat UI with streaming responses.
- LLM access **directly from the browser** via the Vercel AI SDK (`ai` package) against any **OpenAI-compatible** endpoint (OpenAI's API supports CORS from browsers; so do OpenRouter, Groq, Ollama, LM Studio).
- No database: interview state lives in the browser (React state + `localStorage` for crash recovery); documents and transcripts never touch any server we operate.

### Key model: BYOK-only for v1 (no shared key anywhere)
GitHub Pages serves only static files — there is no server-side environment to hold a shared API key, and any key embedded in a static bundle is publicly extractable. Therefore **v1 has no hosted-key mode at all**:

| | GitHub Pages (and any clone of it) |
|---|---|
| Model | User-chosen; `gpt-5-mini` is the suggested default in the Settings screen |
| Key | User enters base URL + API key + model in Settings; stored only in the user's `localStorage`; sent only to the user's chosen LLM endpoint; never to us |
| Abuse control | Not needed — every user spends their own quota |
| Run | Visit the Pages URL, or `git clone && pnpm build` (identical build) |

**Post-v1 "free tier" option**: a tiny Cloudflare Worker (free plan) that holds a shared `gpt-5-mini` key as a secret and proxies chat requests with per-IP rate limiting. The frontend treats it as just another OpenAI-compatible base URL, so no app changes are needed — it slots into the same provider abstraction.

Key-safety rules baked into the client:
- The key is only ever attached to requests whose target host equals the user-configured base URL (no third-party leakage).
- Settings screen shows a plain-language notice: the key stays in this browser; clear it with one click; recommend a spend-limited project key.
- No analytics/telemetry that could capture request contents.

### Key modules
```
app/
  page.tsx                 # landing + start
  setup/                   # document upload & program profile form
  interview/               # chat room UI, timer, panelist avatars
  report/                  # grading report view + export
  settings/                # BYOK: base URL + API key + model
lib/
  llm.ts                   # provider abstraction (browser → OpenAI-compatible endpoint)
  documents.ts             # file parsing: PDF (pdfjs), DOCX (mammoth), plain text
  panel/
    moderator.ts           # decides next speaker, phase transitions, time budget
    personas.ts            # system prompts: akademisi / psikolog / tim LPDP
    phases.ts              # interview phase state machine
  rubric.ts                # scoring dimensions, weights, band descriptors
  i18n.ts                  # UI copy (id/en)
```

### Interview engine
- **Phase state machine** driving a 60-minute budget in a **strict session
  order — one panelist leads each block** (approximate minutes):
  1. Pembukaan & perkenalan diri — Akademisi (5')
  2. Rencana studi / proposal riset — deep dive by Akademisi, incl. English segment if luar negeri (15')
  3. Latar belakang & motivasi studi — Psikolog (10')
  4. Kepribadian, kesiapan, konsistensi — Psikolog (10')
  5. Nasionalisme & rencana kontribusi — Tim LPDP (15')
  6. Pertanyaan penutup & closing statement — Tim LPDP (5')

  Each role leads about 20 minutes of questioning: Akademisi 20' (opening +
  study plan), Psikolog 20' (motivation + personality), Tim LPDP 20'
  (contribution + closing). Every panelist participates in every phase, but
  panelists other than the phase lead may interject with at most ONE short
  clarifying follow-up per lead block on a point that interests them, then
  the floor returns to the lead. The one-interjection cap is enforced
  deterministically in the moderator engine (both the LLM decision and its
  fallback), not only by prompt wording.
- **Moderator step** (cheap, small prompt): given phase, elapsed time, and last exchange → picks next panelist + a directive ("probe the inconsistency between his CV gap year and his claimed leadership").
- **Panelist step**: full persona prompt + relevant document excerpts + conversation window → streamed question/response in character.
- Documents are chunked at setup; each panelist gets the excerpts relevant to its focus (study plan → Akademisi; essay kontribusi → LPDP; CV → all).
- Every user answer is silently annotated by a lightweight **note-taker** call (strengths/weaknesses per rubric dimension + verbatim quotes) so the final report has specific evidence without re-reading the whole transcript.

## 4. Document intake
- Accept PDF / DOCX / TXT / pasted text; parsed **client-side** where possible (pdfjs-dist, mammoth) so raw files never leave the browser — only extracted text is sent with prompts.
- Structured profile form: nama, jenjang, DN/LN, universitas & prodi tujuan, LoA status, skema, bidang keilmuan (drives the Akademisi persona), pekerjaan saat ini.
- Size guardrails: per-doc char limit with smart truncation + summary pass for oversized docs.

## 5. Grading system

Score 0–4 per dimension (mirroring "unsur penilaian" style), weighted to 100.
0 is reserved for dimensions with nothing to grade — no evidence in the
transcript and nothing in the candidate's documents.

| Dimension | Weight | Owner |
|---|---|---|
| Rencana studi / riset & kesiapan akademik | 20 | Akademisi |
| Penguasaan bidang & kesesuaian prodi-karier | 10 | Akademisi |
| Kemampuan bahasa Inggris (jika LN) / komunikasi | 10 | Akademisi |
| Motivasi & autentisitas | 10 | Psikolog |
| Kepribadian, resiliensi & kesiapan psikologis | 10 | Psikolog |
| Konsistensi jawaban vs dokumen | 10 | Psikolog |
| Nasionalisme & komitmen kembali ke Indonesia | 15 | Tim LPDP |
| Rencana kontribusi: konkret & terukur | 15 | Tim LPDP |

Dimensions the interview never reached (e.g. the candidate ended the session
early) are graded from the uploaded documents only: 1 if the documents contain
relevant substance for the dimension, 0 if there is nothing to grade. Both
contribute zero weighted points — an abandoned session never earns a neutral 2.

Report contents:
- **Total score /100 + band**: Sangat Direkomendasikan / Direkomendasikan / Dipertimbangkan / Belum Direkomendasikan
- Per-dimension score with **evidence quotes** from the transcript
- Per-panelist narrative feedback (in character)
- **Strong/weak signal checklist** scored against the LPDP article's criteria (§2)
- Actionable next steps ("perbaiki jawaban kontribusi: sebutkan target angka, timeline, dan pemangku kepentingan")
- Export: Markdown download + print-to-PDF view; full transcript included.

## 6. Open source & safety
- License: MIT. `README` (id + en), `CONTRIBUTING.md`, GitHub Actions CI (lint, typecheck, build), issue templates.
- Prominent disclaimer: *unofficial practice tool, tidak berafiliasi dengan LPDP/Kemenkeu; skor tidak memprediksi hasil seleksi asli.*
- Privacy stance documented: fully static app — documents, transcripts, and API keys exist only in the user's browser and requests go only to the user's chosen LLM endpoint; we operate no server and store nothing.
- Prompt-injection hardening on uploaded docs (treat as data, not instructions).

## 7. Milestones

1. **M1 – Skeleton**: Next.js static-export scaffold, browser LLM provider abstraction, BYOK settings screen, GitHub Actions CI + Pages deploy.
2. **M2 – Setup flow**: profile form + client-side doc parsing + chunking.
3. **M3 – Interview engine**: phase machine, moderator, 3 personas, streaming chat UI, 60-min timer, English switching.
4. **M4 – Grading**: note-taker annotations, rubric scoring, report page, Markdown/PDF export.
5. **M5 – Hardening**: doc size limits, prompt-injection guards, disclaimers, error/retry UX for flaky endpoints.
6. **M6 – OSS polish**: docs (id/en), provider presets (OpenAI/OpenRouter/Ollama), examples with dummy documents.
7. **Post-v1**: free-tier Cloudflare Worker proxy with shared `gpt-5-mini` key + rate limiting, voice mode (STT/TTS — voice *input* shipped via the browser Speech Recognition API, voice-first composer with the transcript editable after listening stops; TTS pending), report history (shipped — one report per attempt, viewable/deletable history list), question bank enriched from awardee experiences.
