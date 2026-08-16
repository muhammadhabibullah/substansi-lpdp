# AGENTS.md — Agent Operating Guide

Instructions for AI coding agents (and humans) working in this repository.

## What this project is

**Substansi LPDP** — an open-source, fully static web app that simulates the LPDP
Seleksi Substansi (wawancara) with a three-panelist AI board (Akademisi, Psikolog,
Tim LPDP), conducted primarily in Bahasa Indonesia, ending with a rubric-scored
report.

- **`PLAN.md` is the product/architecture source of truth.** Read it before making
  design decisions. If an implementation choice contradicts PLAN.md, either follow
  PLAN.md or update PLAN.md in the same change with a short rationale.
- **`TASKS.md` is the execution source of truth.** It holds the milestone backlog,
  per-task status, and a progress log.

## Working protocol (every session)

1. Read `PLAN.md` (skim) and `TASKS.md` (fully).
2. Pick the first unblocked task in the current milestone, or continue the task
   marked `in_progress`. Only one task should normally be `in_progress`.
3. Mark it `in_progress` in `TASKS.md` before you start; mark it `done` when the
   Definition of Done below is met.
4. Append a one-line entry to the **Progress log** at the bottom of `TASKS.md`
   (date, task id, what changed, anything the next session must know).
5. Commit in small, task-scoped commits: `feat(scope): ...`, `fix(scope): ...`,
   `chore(scope): ...`, `docs(scope): ...`. Reference the task id, e.g. `(M1-3)`.
6. Never leave the repo in a broken state at the end of a task: `pnpm lint`,
   `pnpm typecheck`, and `pnpm build` must pass (once the scaffold exists).

## Definition of Done (per task)

- Code compiles: `pnpm typecheck` and `pnpm build` pass.
- `pnpm lint` passes.
- New behavior is reachable from the UI or wired into the flow (no dead code drops).
- `TASKS.md` status + progress log updated.
- No violations of the hard constraints below.

## Hard constraints (do not break these)

1. **Fully static app.** Next.js App Router with `output: 'export'`. No server
   components requiring a server at runtime, **no API routes, no server actions,
   no middleware**. Everything must work from GitHub Pages / `next build` output.
2. **BYOK only (v1).** No API key may ever appear in the repo, the bundle, env
   files, or CI. Keys live only in the user's `localStorage` and are sent only to
   the user-configured base URL (never to third parties).
3. **Privacy.** Documents, transcripts, and keys never leave the browser except
   to the user's chosen LLM endpoint. No analytics/telemetry that captures
   request contents.
4. **Client-side parsing.** PDF (`pdfjs-dist`), DOCX (`mammoth`), TXT parsed in
   the browser; only extracted text goes into prompts.
5. **Prompt-injection hardening.** Uploaded document text is *data*, never
   instructions — always fence/escape it in prompts and say so in system prompts.
6. **Disclaimer.** Keep the "unofficial, tidak berafiliasi dengan LPDP/Kemenkeu"
   disclaimer visible on landing and report pages.

## Stack & conventions

- **Package manager:** `pnpm` (commit `pnpm-lock.yaml`).
- **Framework:** Next.js (App Router) + TypeScript `strict: true`.
- **Styling:** Tailwind CSS + shadcn/ui. Prefer composition over new dependencies.
- **LLM access:** Vercel AI SDK (`ai` package) from the browser against any
  OpenAI-compatible endpoint. All LLM calls go through `lib/llm.ts` — never call
  `fetch` to an LLM endpoint from components.
- **State:** React state + `localStorage` (crash recovery). No database.
- **Directory layout:** follow §3 of `PLAN.md` (`app/{setup,interview,report,settings}`,
  `lib/{llm,documents,rubric,i18n}`, `lib/panel/{moderator,personas,phases}`).
- **UI language:** all user-facing copy in Bahasa Indonesia with English variants,
  routed through `lib/i18n.ts` — no hardcoded copy in components.
- **Interview content** (personas, phases, rubric weights) must match PLAN.md
  §1, §3, §5 exactly; treat those tables as spec.

## Commands (once scaffolded — keep this section updated)

```bash
pnpm install        # install deps
pnpm dev            # local dev server
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm build          # next build (static export → out/)
pnpm test           # unit tests (when added)
```

## Testing guidance

- Pure logic (phase machine, moderator selection, rubric math, chunking,
  truncation) should be unit-tested — it's deterministic and cheap.
- LLM-dependent behavior: test prompt *construction* (snapshot the assembled
  messages), not model output.
- Don't gate CI on anything requiring a live API key.

## When unsure

- Product/architecture question → check `PLAN.md` first.
- Ambiguity that PLAN.md doesn't settle → choose the simplest option consistent
  with the hard constraints, note the decision in the `TASKS.md` progress log.
- Genuinely blocking ambiguity → stop and ask the user rather than guessing big.
