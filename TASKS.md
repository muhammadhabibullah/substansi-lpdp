# TASKS.md — Execution Backlog

Source of truth for *what to work on*. Derived from `PLAN.md` §7 milestones.
See `AGENTS.md` for the working protocol.

**Statuses:** `todo` · `in_progress` · `done` · `blocked(<reason>)`

**Current milestone:** M1

---

## M1 — Skeleton

| ID | Task | Status |
|---|---|---|
| M1-1 | Scaffold Next.js (App Router, TS strict, Tailwind) with `output: 'export'`; pnpm; base pages routing for `/`, `/setup`, `/interview`, `/report`, `/settings` as placeholders | todo |
| M1-2 | Add shadcn/ui, base layout (header, footer with unofficial-tool disclaimer), landing page copy (id) via `lib/i18n.ts` | todo |
| M1-3 | `lib/llm.ts`: provider abstraction over Vercel AI SDK → OpenAI-compatible endpoint (base URL + key + model), browser-side streaming; key attached only to configured host | todo |
| M1-4 | Settings screen (BYOK): base URL + API key + model form, `localStorage` persistence, suggested default `gpt-5-mini`, plain-language key-safety notice, one-click clear, "test connection" button | todo |
| M1-5 | CI: GitHub Actions — lint, typecheck, build on PR/push | todo |
| M1-6 | Deploy: GitHub Actions → GitHub Pages on push to `main` (static export, correct `basePath` if project pages) | todo |

## M2 — Setup flow

| ID | Task | Status |
|---|---|---|
| M2-1 | Profile form: nama, jenjang (Magister/Doktor), DN/LN, universitas & prodi tujuan, LoA status, skema, bidang keilmuan, pekerjaan saat ini; persisted to `localStorage` | todo |
| M2-2 | `lib/documents.ts`: client-side parsing — PDF (`pdfjs-dist`), DOCX (`mammoth`), TXT, pasted text | todo |
| M2-3 | Upload UI per document type (CV, rencana studi / proposal penelitian by jenjang, essay kontribusi) with parse preview | todo |
| M2-4 | Chunking + per-doc char limits with smart truncation; summary pass for oversized docs; route excerpts per panelist (study plan → Akademisi, essay → LPDP, CV → all) | todo |
| M2-5 | Setup validation & gating: cannot start interview without required docs + profile + working LLM settings | todo |

## M3 — Interview engine

| ID | Task | Status |
|---|---|---|
| M3-1 | `lib/panel/phases.ts`: 6-phase state machine with per-phase time budgets (5/10/15/10/12/8 min), transitions on elapsed time + moderator signal | todo |
| M3-2 | `lib/panel/personas.ts`: system prompts for Akademisi (field-derived), Psikolog, Unsur LPDP per PLAN §1; prompt-injection fencing of document excerpts | todo |
| M3-3 | `lib/panel/moderator.ts`: cheap next-speaker + directive step (phase, elapsed time, last exchange → panelist + probing directive) | todo |
| M3-4 | Interview chat UI: streaming responses, panelist avatars/labels, visible 60-min countdown, end-early button, natural wrap-up as time runs out | todo |
| M3-5 | English-switching behavior for luar-negeri applicants (Akademisi mid-interview switches; panel follows user's language) | todo |
| M3-6 | Crash recovery: interview state (transcript, phase, clock) persisted to `localStorage`, resumable | todo |
| M3-7 | Unit tests: phase machine, moderator selection, prompt assembly snapshots | todo |

## M4 — Grading

| ID | Task | Status |
|---|---|---|
| M4-1 | Note-taker: silent per-answer annotation call (strengths/weaknesses per rubric dimension + verbatim quotes) | todo |
| M4-2 | `lib/rubric.ts`: 8 dimensions, weights per PLAN §5, 1–4 scoring, weighted total /100, bands (Sangat Direkomendasikan → Belum Direkomendasikan) | todo |
| M4-3 | Report generation: per-dimension scores with evidence quotes, per-panelist in-character narrative, strong/weak signal checklist (PLAN §2), actionable next steps | todo |
| M4-4 | Report page UI + Markdown download + print-to-PDF view; full transcript included | todo |

## M5 — Hardening

| ID | Task | Status |
|---|---|---|
| M5-1 | Doc size guardrails end-to-end (limits enforced, clear UX for truncation/summary) | todo |
| M5-2 | Prompt-injection guard review across all prompt assembly points | todo |
| M5-3 | Error/retry UX for flaky endpoints (stream failure recovery, rate-limit messaging, resume mid-interview) | todo |
| M5-4 | Disclaimers audit: landing + report; privacy stance page/section | todo |

## M6 — OSS polish

| ID | Task | Status |
|---|---|---|
| M6-1 | README (id + en): what it is, screenshots, BYOK setup, self-hosting; MIT LICENSE | todo |
| M6-2 | `CONTRIBUTING.md` + issue templates | todo |
| M6-3 | Provider presets in Settings (OpenAI / OpenRouter / Groq / Ollama / LM Studio) | todo |
| M6-4 | Example/dummy documents for trying the app without real materials | todo |

## Post-v1 (parked — do not start without user direction)

- Cloudflare Worker free-tier proxy (shared key + per-IP rate limiting)
- Voice mode (STT/TTS)
- Interview history
- Question bank enriched from awardee experiences

---

## Progress log

<!-- Newest first. Format: YYYY-MM-DD · TASK-ID · what changed · notes for next session -->

- 2025-08-16 · setup · Created AGENTS.md + TASKS.md agentic workflow files · Repo is otherwise empty (PLAN.md + README stub); start at M1-1.
