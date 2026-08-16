# TASKS.md — Execution Backlog

Source of truth for *what to work on*. Derived from `PLAN.md` §7 milestones.
See `AGENTS.md` for the working protocol.

**Statuses:** `todo` · `in_progress` · `done` · `blocked(<reason>)`

**Current milestone:** v1 complete (M1–M6 done) — next work is Post-v1, which
needs user direction before starting.

---

## M1 — Skeleton

| ID | Task | Status |
|---|---|---|
| M1-1 | Scaffold Next.js (App Router, TS strict, Tailwind) with `output: 'export'`; pnpm; base pages routing for `/`, `/setup`, `/interview`, `/report`, `/settings` as placeholders | done |
| M1-2 | Add shadcn/ui, base layout (header, footer with unofficial-tool disclaimer), landing page copy (id) via `lib/i18n.ts` | done |
| M1-3 | `lib/llm.ts`: provider abstraction over Vercel AI SDK → OpenAI-compatible endpoint (base URL + key + model), browser-side streaming; key attached only to configured host | done |
| M1-4 | Settings screen (BYOK): base URL + API key + model form, `localStorage` persistence, suggested default `gpt-5-mini`, plain-language key-safety notice, one-click clear, "test connection" button | done |
| M1-5 | CI: GitHub Actions — lint, typecheck, build on PR/push | done |
| M1-6 | Deploy: GitHub Actions → GitHub Pages on push to `main` (static export, correct `basePath` if project pages) | done |

## M2 — Setup flow

| ID | Task | Status |
|---|---|---|
| M2-1 | Profile form: nama, jenjang (Magister/Doktor), DN/LN, universitas & prodi tujuan, LoA status, skema, bidang keilmuan, pekerjaan saat ini; persisted to `localStorage` | done |
| M2-2 | `lib/documents.ts`: client-side parsing — PDF (`pdfjs-dist`), DOCX (`mammoth`), TXT, pasted text | done |
| M2-3 | Upload UI per document type (CV, rencana studi / proposal penelitian by jenjang, essay kontribusi) with parse preview | done |
| M2-4 | Chunking + per-doc char limits with smart truncation; summary pass for oversized docs; route excerpts per panelist (study plan → Akademisi, essay → LPDP, CV → all) | done |
| M2-5 | Setup validation & gating: cannot start interview without required docs + profile + working LLM settings | done |

## M3 — Interview engine

| ID | Task | Status |
|---|---|---|
| M3-1 | `lib/panel/phases.ts`: 6-phase state machine with per-phase time budgets (5/10/15/10/12/8 min), transitions on elapsed time + moderator signal | done |
| M3-2 | `lib/panel/personas.ts`: system prompts for Akademisi (field-derived), Psikolog, Unsur LPDP per PLAN §1; prompt-injection fencing of document excerpts | done |
| M3-3 | `lib/panel/moderator.ts`: cheap next-speaker + directive step (phase, elapsed time, last exchange → panelist + probing directive) | done |
| M3-4 | Interview chat UI: streaming responses, panelist avatars/labels, visible 60-min countdown, end-early button, natural wrap-up as time runs out | done |
| M3-5 | English-switching behavior for luar-negeri applicants (Akademisi mid-interview switches; panel follows user's language) | done |
| M3-6 | Crash recovery: interview state (transcript, phase, clock) persisted to `localStorage`, resumable | done |
| M3-7 | Unit tests: phase machine, moderator selection, prompt assembly snapshots | done |

## M4 — Grading

| ID | Task | Status |
|---|---|---|
| M4-1 | Note-taker: silent per-answer annotation call (strengths/weaknesses per rubric dimension + verbatim quotes) | done |
| M4-2 | `lib/rubric.ts`: 8 dimensions, weights per PLAN §5, 1–4 scoring, weighted total /100, bands (Sangat Direkomendasikan → Belum Direkomendasikan) | done |
| M4-3 | Report generation: per-dimension scores with evidence quotes, per-panelist in-character narrative, strong/weak signal checklist (PLAN §2), actionable next steps | done |
| M4-4 | Report page UI + Markdown download + print-to-PDF view; full transcript included | done |

## M5 — Hardening

| ID | Task | Status |
|---|---|---|
| M5-1 | Doc size guardrails end-to-end (limits enforced, clear UX for truncation/summary) | done |
| M5-2 | Prompt-injection guard review across all prompt assembly points | done |
| M5-3 | Error/retry UX for flaky endpoints (stream failure recovery, rate-limit messaging, resume mid-interview) | done |
| M5-4 | Disclaimers audit: landing + report; privacy stance page/section | done |

## M6 — OSS polish

| ID | Task | Status |
|---|---|---|
| M6-1 | README (id + en): what it is, screenshots, BYOK setup, self-hosting; MIT LICENSE | done (screenshots pending — needs a real run to capture) |
| M6-2 | `CONTRIBUTING.md` + issue templates | done |
| M6-3 | Provider presets in Settings (OpenAI / OpenRouter / Groq / Ollama / LM Studio) | done |
| M6-4 | Example/dummy documents for trying the app without real materials | done |

## Post-v1 (parked — do not start without user direction)

- Cloudflare Worker free-tier proxy (shared key + per-IP rate limiting)
- Voice mode (STT/TTS)
- Interview history
- Question bank enriched from awardee experiences

## Known follow-ups (small, non-blocking)

- README screenshots are not committed yet (M6-1); capture from a real session.
- `pnpm test` covers pure logic + prompt assembly only. The browser flow was
  verified manually with a mock OpenAI-compatible endpoint (see progress log);
  wiring that into CI as a Playwright job is optional future work.
- Dependency majors are intentionally pinned behind latest (Next 15, AI SDK 4,
  Tailwind 3) for stability; upgrading is a separate task.

---

## Progress log

<!-- Newest first. Format: YYYY-MM-DD · TASK-ID · what changed · notes for next session -->

- 2025-08-17 · M1–M6 · **v1 feature-complete.** Verified end-to-end in a real
  headless browser against a mock OpenAI-compatible endpoint: 29/29 flow checks
  (BYOK settings + test connection, doc paste/parse, gating, moderator →
  streamed panelist → note-taker loop, report with all 8 dimensions summing to
  100, Markdown export, id/en switch, zero console errors) plus 6/6 checks for
  crash recovery (clock resumed at 45:00, transcript + phase restored) and the
  mid-interview English segment. Gates: `pnpm lint`, `pnpm typecheck`,
  `pnpm test` (201 unit tests), `pnpm build` (7 static routes) all pass.
  Constraint audit passed: no API-key patterns in repo/bundle, no API routes,
  no middleware, no server actions, disclaimer present on landing + report.
- 2025-08-17 · M6 · README (id+en), CONTRIBUTING, MIT LICENSE, issue/PR
  templates, and four fictional example documents in `examples/`.
- 2025-08-17 · M5 · Hardening: per-doc limits + summary pass surfaced in the UI,
  `sanitizeForPrompt`/`fenceDocument` applied at every prompt assembly point,
  typed `LlmError` mapped to localized retry/skip/end recovery actions, privacy
  page added. Note: `guardedFetch` strips `Authorization` and uses
  `redirect: 'error'` so a cross-origin redirect can never carry the key.
- 2025-08-17 · M4 · Grading: note-taker annotations, `lib/rubric.ts` (PLAN §5
  weights, 1→0 / 4→full scoring so straight 1s = 0/100 and straight 4s =
  100/100), three-step report generation each with a deterministic fallback so a
  finished interview always yields a report, report page + Markdown/print export.
- 2025-08-17 · M3 · Interview engine: 6-phase machine (advances on budget only
  after minimum questions, catches up when behind schedule), personas, cheap
  moderator with deterministic fallback rotation, streaming chat UI with 60-min
  countdown, English segments, and `localStorage` crash recovery that does not
  charge the candidate for time with the tab closed.
- 2025-08-17 · M2 · Setup flow: profile form, browser-side PDF/DOCX/TXT parsing
  (pdf.js worker copied to `public/` by `scripts/copy-pdf-worker.mjs`), paste
  fallback for scanned PDFs, per-panelist excerpt routing, and start gating.
- 2025-08-17 · M1 · Scaffold: Next 15 App Router static export, TS strict with
  `noUncheckedIndexedAccess`, Tailwind + local shadcn-style primitives, full
  id/en `lib/i18n.ts` (English tree typed against the Indonesian one, so a
  missing key is a compile error), `lib/llm.ts` BYOK gateway, settings screen,
  and CI + Pages workflows.
- 2025-08-16 · setup · Created AGENTS.md + TASKS.md agentic workflow files · Repo is otherwise empty (PLAN.md + README stub); start at M1-1.
