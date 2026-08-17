# TASKS.md — Execution Backlog

Source of truth for *what to work on*. Derived from `PLAN.md` §7 milestones.
See `AGENTS.md` for the working protocol.

**Statuses:** `todo` · `in_progress` · `done` · `blocked(<reason>)`

**Current milestone:** v1 complete (M1–M6 done) — Post-v1 started with user
direction (2026-08-17); first task is voice input (P1-1).

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
| M3-1 | `lib/panel/phases.ts`: 6-phase state machine with per-phase time budgets (5/10/15/10/15/5 min since P1-7), transitions on elapsed time + moderator signal | done |
| M3-2 | `lib/panel/personas.ts`: system prompts for Akademisi (field-derived), Psikolog, Tim LPDP per PLAN §1; prompt-injection fencing of document excerpts | done |
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

## Post-v1 (user-directed — started 2026-08-17)

| ID | Task | Status |
|---|---|---|
| P1-1 | Voice input mode for the interview: browser Speech Recognition (STT), transcript shown read-only (non-editable) and submitted as-is; typing stays as the fallback. Rationale: typing answers inside a 60-minute interview is not time-efficient. | done |
| P1-2 | Voice output (TTS) for panelist turns | parked |
| P1-3 | Cloudflare Worker free-tier proxy (shared key + per-IP rate limiting) | parked |
| P1-4 | Report history: multiple reports (one per attempt) with a viewable/deletable history list on the report page | done |
| P1-5 | Question bank enriched from awardee experiences | parked |
| P1-6 | Voice-first composer: voice input is the default mode and the transcript becomes editable once listening stops (supersedes P1-1's read-only rule per user feedback #2) | done |
| P1-7 | Per-role time model: each role leads 15–20 min (Akademisi 15', Psikolog 20', Tim LPDP 15' + opening/closing) within the 60' total, follow-up interjections allowed in any phase, and "Unsur LPDP" renamed to "Tim LPDP" (user feedback #3) | done |
| P1-8 | Strict session order: Akademisi (opening + study plan) → Psikolog (motivation + personality) → Tim LPDP (contribution + closing), each ~20' lead; other roles may still interject one short clarifying follow-up in another session (user feedback #4) | done |
| P1-9 | Early-exit grading: dimensions the interview never reached are graded from the uploaded documents only — 1 if the documents contain substance, 0 if not — instead of a neutral 2; 0–4 scale (user feedback #5) | done |
| P1-10 | Strict interjection limit: other roles may interrupt another session block with exactly one question each — enforced deterministically in the moderator engine instead of relying on prompt wording alone | done |

## Known follow-ups (small, non-blocking)

- README screenshots are not committed yet (M6-1); capture from a real session.
- `pnpm test` covers pure logic, prompt assembly, and the `useInterview` turn
  lifecycle (busy guard, unmount abort, truncation-retry buffer reset). The
  full browser flow was verified manually with a mock OpenAI-compatible
  endpoint (see progress log); wiring that into CI as a Playwright job is
  optional future work.
- Dependency majors are intentionally pinned behind latest (Next 15, AI SDK 4,
  Tailwind 3) for stability; upgrading is a separate task.

---

## Progress log

<!-- Newest first. Format: YYYY-MM-DD · TASK-ID · what changed · notes for next session -->

- 2026-08-17 · ad-hoc · docs: PLAN.md §3 Key modules and AGENTS.md Directory
  layout now list `lib/panel/engine.ts` (session lifecycle & phase
  bookkeeping) and `lib/panel/notetaker.ts` (silent per-answer annotation),
  so the module map covers every file in `lib/panel/`; moderator, personas,
  and phases entries unchanged. Gate: typecheck pass.

- 2026-08-17 · P1-10 · feat(panel): strict one-interjection-per-block cap.
  P1-8 limited off-block interjections to one short follow-up via prompt
  wording only; now the cap is enforced deterministically in
  `lib/panel/moderator.ts`: `interjectionsInBlock` counts a panelist's
  questions across every phase of the current lead's block (opening+studyPlan
  / motivation+personality / contribution+closing), `applyInterjectionCap`
  redirects an exhausted interjector back to the block lead inside
  `parseDecision` (LLM path), and `fallbackDecision` only rotates to
  participants with budget left. The moderator prompt now states the limit is
  absolute and shows per-panelist block interjection counts. New tests in
  `moderator.test.ts` (10; `pnpm test` 304 pass). Gates: lint, typecheck,
  test, build.

- 2026-08-17 · P1-9 · fix(grading): early-exit grading (user feedback #5).
  `Score` is 0–4; untested dimensions (session ended early) are graded from
  the uploaded documents only — the scoring prompt now receives fenced doc
  excerpts (`renderGraderDocuments`, report screen passes `loadDocuments()`),
  rule: 1 if the docs contain substance, 0 if not, never ≥2; both score 0 and
  1 contribute zero weighted points. Omitted dimensions in
  `buildDimensionResults` and the no-evidence case in `fallbackScores`
  default 2 → 1. New `lib/report.test.ts` (8 tests; `pnpm test` 294 pass).
  Gates: lint, typecheck, test, build.

- 2026-08-17 · P1-8 · feat(panel): strict session order (user feedback #4).
  Phases reordered to Akademisi block (opening + studyPlan) → Psikolog block
  (motivation + personality) → Tim LPDP block (contribution + closing) with
  budgets 5/15/10/10/15/5 (each role leads ~20'); opening lead moved
  LPDP → Akademisi, closing stays LPDP; moderator prompt now states the fixed
  order and limits off-block interjections to one clarifying follow-up.

- 2026-08-17 · ad-hoc · test(interview): hook-level lifecycle coverage for
  `hooks/use-interview.ts` (3 tests): busy guard rejects a second submit while
  a turn is in flight, unmount aborts the in-flight `AbortController`, and
  `onTruncationRetry` resets the live streaming buffer. The vitest include
  pattern already matched `hooks/*.test.ts`, so no config change was needed —
  the file opts into jsdom per-file (`// @vitest-environment jsdom`, new
  `jsdom` devDependency) and renders the hook via `react-dom/client` +
  `React.act` with mocked `streamComplete`/storage/moderator/notetaker.
  Verified by temporarily removing the busy guard: the test fails as
  expected. `pnpm test`: 278 pass. Gates: lint, typecheck, test all pass.

- 2026-08-17 · ad-hoc · chore(ci): broadened the key-leak scan in
  `.github/workflows/ci.yml` to cover every BYOK key shape from the README
  table: OpenAI (`sk-...`, incl. `sk-proj-`), OpenRouter (`sk-or-v1-...`),
  Groq (`gsk_...`) across repo sources + build output, plus a long-token
  heuristic (`[A-Za-z0-9_-]{48,}`) on sources only for arbitrary local
  endpoint keys (Ollama/LM Studio). The heuristic skips `out/` because the
  bundle legitimately embeds long base64 runs (fonts, pdf.js WASM worker) and
  allowlists the LPDP article URL slug in `lib/site.ts`. Validated: extracted
  the exact CI script and ran it against a throwaway fixture (all four key
  shapes detected, exit 1) and the clean repo + static build output (exit 0).
  Triggers and permissions unchanged.

- 2026-08-17 · P1-7 · feat(panel): per-role time blocks, follow-ups, and
  "Tim LPDP" rename (user feedback #3). Phase budgets rebalanced to
  5/10/15/10/15/5 so each role leads 15–20 min of questioning: Akademisi 15'
  (study plan), Psikolog 20' (motivation + personality), Tim LPDP 15'
  (contribution) plus the LPDP-led opening/closing (closing cap lowered 4→3).
  All three panelists now participate in every phase so any role may interject
  a short follow-up mid-block; the moderator prompt states the 15–20 min
  per-role allocation and the follow-up rule, and now sees per-panelist
  question counts to balance turns. Renamed "Unsur LPDP" → "Tim LPDP" across
  prompts, i18n (id+en), README, PLAN, AGENTS. Gates: lint, typecheck, test,
  build.

- 2026-08-17 · P1-6 · feat(interview): voice-first composer with editable
  transcript (user feedback #2). The composer now defaults to voice mode
  (typing remains one click away and is the fallback on unsupported
  browsers). The transcript stays read-only while the mic is live, but after
  stopping the candidate can edit the text before sending: new
  `useVoiceInput.setText` drives the now-editable field, edits reset the
  sentence-gap heuristic, and `checked` suppresses the unsupported-browser
  flash on first paint. Copy updated in both locales (`voiceEditableNote`
  replaces `voiceNonEditableNote`). Gates: lint, typecheck, test, build.

- 2026-08-17 · P1-4 · feat(report): report history for multiple attempts
  (user feedback #1). Reports now live in a `substansi-lpdp:reports` list
  (newest first, capped at 20); the legacy single-report key migrates into it
  automatically. `upsertReport` keeps one entry per session, so "rebuild
  report" replaces instead of duplicating. The report page gained a history
  card (score, band, duration, answers; select to view, delete with confirm),
  and rebuild is only offered while that report's session is still stored.
  Added `lib/storage.test.ts` (8 tests). Gates: lint, typecheck, test, build.
- 2026-08-17 · P1-1 · feat(voice): pause-based sentence punctuation. The
  speech engine never emits punctuation, so multi-sentence answers now get
  sentence breaks from timing: when speech resumes ≥ `SENTENCE_GAP_MS` (1.5 s)
  after the last finalized chunk — or the listening segment restarts after
  silence — the previous sentence is closed with `.` and the next capitalized
  (`appendFinalChunk(existing, chunk, newSentence)` in `lib/voice.ts`);
  `finish()` also appends a trailing period via `finalizePunctuation`. Handles
  straight and curly closing quotes. 7 new tests (`pnpm test`: 258 pass).
  Gates: lint, typecheck, build all pass.

- 2026-08-17 · P1-1 · feat(interview): voice input mode (user-directed, starts
  Post-v1). The composer now offers a voice mode alongside typing: answers are
  spoken, transcribed by the browser Speech Recognition API (continuous
  listening with auto-restart after pauses, live interim words), and shown in a
  read-only field — non-editable by design and submitted verbatim, like a real
  interview. Recognition language follows the session language (id-ID ↔ en-US);
  the mic auto-closes while the panel is busy. Unsupported browsers
  (Firefox/Safari) or a denied microphone fall back to typing with localized
  messaging. New files: `lib/voice.ts`, `hooks/use-voice-input.ts`,
  `lib/voice.test.ts` (9 tests); i18n copy in both locales and a new privacy
  page section disclose that transcription runs on the browser's own speech
  service — audio never reaches the LLM endpoint or this project. No new
  dependencies. `pnpm test`: 251 pass. Gates: lint, typecheck, build all pass.
  Next: P1-2 (TTS) or another user-directed Post-v1 task.

- 2026-08-17 · fix(llm) · Generous response-wait timeout: `guardedFetch` now
  wraps every attempt in `fetchWithTimeout` (`RESPONSE_TIMEOUT_MS` = 120 s).
  A stalled endpoint fails as a retryable `network` error, so the interview
  recovery card with "Coba lagi" appears after a long wait instead of hanging
  forever; the timer clears once headers arrive, so long streams are never cut
  short, and each quirk retry gets its own full window. User-initiated aborts
  stay silent (`aborted`). Added 3 timeout tests (`pnpm test`: 237 pass).
  Gates: lint, typecheck, build all pass.

- 2026-08-17 · fix(llm) · Two-layer defense against gpt-5/o-series parameter
  rejections. Layer 1 (proactive): `guardedFetch` sanitizes the request body
  before the first attempt when the body's `model` matches the reasoning
  families (gpt-5*, o1/o3/o4, provider prefixes tolerated) — renames
  `max_tokens` → `max_completion_tokens` and drops `temperature`, so no failed
  round-trip and no reliance on error-message wording. Layer 2 (reactive):
  unrecognized models still self-heal from the endpoint's exact error message,
  once per quirk. Added unit tests: model matcher, body sanitizer, proactive
  one-shot non-stream/stream/prefixed-id, reactive paths re-targeted to an
  unrecognized model (`pnpm test`: 234 pass). Gates: lint, typecheck, build
  all pass.

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
- 2026-08-17 · ad-hoc · Print CSS: the floating lightning button seen in local
  PDFs is a runtime overlay injected by the dev environment (not app code;
  verified absent from source and `out/`). Added a `@media print` rule hiding
  any non-landmark `<body>` children so dev-tools/preview widgets never reach
  the downloaded PDF; production static export was never affected.
- 2026-08-17 · ad-hoc · fix(panel): note-taker warning ("Catatan penilaian...
  gagal dibuat") popped up after every answer because the cheap-tier call
  failed consistently (truncated JSON at maxTokens 500 on reasoning models,
  invalid cheap model id, or weak JSON compliance). `annotateAnswer` now uses a
  1500-token budget and falls back to the main model before returning null;
  added `lib/panel/notetaker.test.ts` (5 tests).
- 2026-08-17 · ad-hoc · fix(llm): panelist questions were sometimes cut off
  mid-sentence because reasoning models count internal thinking against the
  shared `max_completion_tokens` budget (panelist budget raised 700 → 1500).
  `streamComplete` now detects `finishReason: 'length'`, retries once with a
  doubled budget (capped at 4000) via a new `onTruncationRetry` hook that
  resets the live streaming buffer in `use-interview`, and surfaces the
  existing "Coba lagi" recovery card if the retry is still truncated. Added 3
  tests to `lib/llm.test.ts`.
- 2026-08-17 · ad-hoc · test(llm): added 4 `guardedFetch` privacy tests to
  `lib/llm.test.ts` (same-origin credentials preserved, cross-origin
  `Authorization`/`api-key` stripped, `redirect: 'error'` forced, relative-path
  URL treated as same-origin). `guardedFetch` is now exported for unit testing,
  matching the existing pattern for internal helpers. Verified by temporarily
  disabling the header-stripping: the cross-origin test fails as expected.
- 2026-08-17 · ad-hoc · perf(panel): cut provider prompt-cache misses during the
  interview. The panelist system prompt mutated every minute ("Sisa waktu
  wawancara sekitar N menit" sat *before* the document excerpts) and the 14-turn
  history window slid one turn per call, so nearly the whole prompt re-prefilled
  (cache miss) on most turns. Now the system prompt is byte-stable per
  (panelist, phase, language); remaining minutes, wrap-up pressure, and the
  closing-statement request moved to the trailing moderator-directive message;
  and the history window start advances in anchored 8-turn steps
  (`historyWindowStart`), growing append-only between advances. Tests in
  `personas.test.ts` pin both the byte-stability and the anchor.
- 2026-08-17 · ad-hoc · fix(setup): "Mulai wawancara" was enabled without an API
  key because `settingsAreUsable` only checked base URL + model. It now requires
  a non-empty key unless the endpoint is local (localhost/127.x/::1/0.0.0.0 —
  Ollama/LM Studio style, matching the existing "empty key ok for local
  endpoints" semantics); `assertConfigured` in `lib/llm.ts` enforces the same
  rule so a slipped-through session fails fast with `not-configured` instead of
  a 401 mid-interview. Review/blocked/landing copy now mentions the key (id+en).
  New tests in `lib/storage.test.ts` (4) and `lib/llm.test.ts` (1).
- 2026-08-17 · ad-hoc · fix(llm): surface provider API error messages (e.g.
  Groq rate-limit payloads) in the UI instead of only generic copy.
  `toLlmError` now keeps the endpoint's message verbatim (bare strings,
  `{ error: { message } }` payloads, SDK `RetryError.lastError` unwrap), and
  `streamComplete` consumes `fullStream` so mid-stream `error` parts are no
  longer silently dropped. New shared `describeLlmError` in `lib/i18n.ts`
  returns a localized summary plus the provider detail, rendered in a
  monospace block on the interview, settings (connection test), and report
  screens. New tests in `lib/llm.test.ts` (7) and `lib/i18n.test.ts` (5).
