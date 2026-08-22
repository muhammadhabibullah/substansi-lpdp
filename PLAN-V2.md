# PLAN-V2 — Substansi LPDP: Freemium Public Launch

> **Status: planned (not started).** This document is the plan for turning the
> static BYOK v1 app into a hosted freemium product with a backend, Midtrans
> payments, testimonials, and a pausable interview. Where it conflicts with
> PLAN.md (§3, §6, §7) or AGENTS.md hard constraints #1/#2, this document
> supersedes them — those docs are updated in the same change that starts P2-1.
> PLAN.md remains the product/format spec for the interview itself (§1, §2, §5).

---

## 1. Summary

| Area | v1 (today) | v2 (this plan) |
|---|---|---|
| Hosting | GitHub Pages, `output: 'export'`, no server | Vercel (serverless), Next.js route handlers |
| LLM access | BYOK only, browser → provider | Managed mode default: browser → **our proxy** → OpenRouter; BYOK kept for self-hosters |
| Pricing | Free (user pays own key) | Freemium: free tier + one-time upgrade credits Rp 2.000–5.000 via Midtrans |
| Models | User-chosen | Free: `gpt-5-mini` + `gpt-5-nano`. Paid tiers unlock better models, server-side |
| Data | Everything in browser | Account, payments, usage counters, testimonials on server; docs/transcripts still browser-only |
| Interview | No pause | Pause/resume with hidden transcript, persisted across reloads |
| Community | None | Testimonial page + featured testimonials on landing |

### Goals (user requirements → where solved)

1. Free interview for anyone with `gpt-5-mini` + `gpt-5-nano` → §3, §4.2 (free tier, quota-limited).
2. Optional AI upgrade, paid via Midtrans, Rp 2.000–5.000 → §3, §5.
3. Backend picks the model by payment tier, served via OpenRouter → §4.1.
4. Testimonial page (submit + read), best ones on the home page → §7.
5. Tighten security & anti-abuse → §8.
6. Update disclaimers; document exactly which data is saved to the server → §9.
7. Pausable interview (no progress loss, transcript hidden while paused) → §10; AI SDK feasibility verified there.

### Hard-constraint changes (AGENTS.md #1–#2, as of P2-1)

1. **No longer fully static.** The app moves to Vercel with route handlers under
   `app/api/`. No server actions, no middleware (keep that restriction); all
   backend logic lives in `app/api/*` + `server/` helpers. `output: 'export'`
   and the Pages deploy workflow are removed.
2. **BYOK becomes an optional mode.** The hosted instance uses a server-side
   OpenRouter key (env secret, never in the bundle). BYOK remains in the
   codebase for self-hosted/OSS builds (config flag), exactly as today.
3. **Privacy, refined (hard constraint #3).** Documents and transcripts are
   still never *stored* on our servers. They pass *through* the proxy
   transiently on the way to OpenRouter and are never logged. Server-stored:
   account data, payment records, usage *counters* (tokens/cost, never content),
   testimonials. Documented in §9.
4. Constraints #4–#6 (client-side parsing, prompt-injection hardening,
   disclaimer) stay unchanged.

---

## 2. Target architecture

```
┌─ Browser (unchanged core: chat UI, phase engine, docs parsing) ──────────┐
│ lib/llm.ts ── OpenAI-compatible client ──► our proxy (base URL = /api/v1)│
└──────────────────────────────────────────────────────────────────────────┘
                        │ HTTPS (Bearer: Supabase session token)
                        ▼
┌─ Vercel — Next.js route handlers ────────────────────────────────────────┐
│ app/api/v1/chat/completions   OpenAI-compatible LLM proxy (stateless)     │
│ app/api/payments/*            orders, status, Midtrans webhook            │
│ app/api/testimonials/*        list, submit, moderation (admin)            │
│ app/api/account/*             profile, quota, usage summary               │
└───────────────┬──────────────────────────┬───────────────────────────────┘
                │                          │
                ▼                          ▼
   Supabase (Auth + Postgres)      Upstash Redis (rate limits)
                │                          │
                ▼                          ▼
   OpenRouter (model routing)      Midtrans (Snap + webhook)
```

**Decisions**

- **Host: Vercel** (single deploy for UI + API, fits the existing Next.js app,
  env secrets, preview deployments; the `vercel-deploy` skill covers setup).
  *Alternative considered:* keep GitHub Pages + separate backend (Cloudflare
  Workers / Fly.io) — rejected: two deploys, CORS, and duplicated env/config
  for no benefit now that a server is required anyway.
- **Auth + DB: Supabase** (Postgres + email magic-link/Google auth + RLS in one
  service, generous free tier, Indonesian-friendly). *Alternative considered:*
  Neon + Clerk — two services instead of one.
- **Rate limiting: Upstash Redis** (works across Vercel's serverless instances;
  in-memory limits don't survive instance cycling).
- **Proxy design:** our backend exposes an *OpenAI-compatible*
  `/v1/chat/completions` endpoint, so `lib/llm.ts` and the whole interview
  engine stay untouched — the backend is just another base URL, the exact slot
  PLAN.md §3 already reserved for a post-v1 proxy. The client sends virtual
  model ids (`main` / `cheap`); the server resolves them per the user's plan.
- **Self-hosting story:** `NEXT_PUBLIC_MODE=managed|byok` at build time.
  Managed = account + proxy (hosted). BYOK = today's behavior (static-ish
  build for self-hosters, no Supabase required at runtime). CI keeps building
  both modes (BYOK build must still pass lint/typecheck/tests).

---

## 3. Pricing & model tiers

One-time **interview credits**: a credit = one interview at that tier, valid
**30 days**, consumed when the session starts. No subscriptions in v2.

| Tier | Price | `main` (panelist, grading, summarize) | `cheap` (moderator, note-taker) | Limits |
|---|---|---|---|---|
| Gratis | Rp 0 | `openai/gpt-5-mini` | `openai/gpt-5-nano` | 2 interviews/day, 1 concurrent stream, per-interview token cap, per-call `max_tokens` clamp |
| Standar | Rp 2.000 | `openai/gpt-5` | `openai/gpt-5-nano` | 1 credit = 1 interview; no daily cap; token/spend caps still apply |
| Plus | Rp 3.500 | `anthropic/claude-sonnet-4.6` (fallback `openai/gpt-5.1`) | `openai/gpt-5-mini` | same |
| Pro | Rp 5.000 | `openai/gpt-5.2` (fallback `anthropic/claude-opus-4.6`) | `openai/gpt-5-mini` | same |

- The mapping is **config-driven** (server env, e.g. `MODEL_TIER_MAP` JSON +
  `FALLBACK_MODEL_TIER_MAP`): OpenRouter model ids and prices drift; a mapping
  change must not require a deploy of app code. P2-3 includes a spike verifying
  current model availability/cost on OpenRouter before pinning defaults.
- The client's existing `ModelTier` (`'main' | 'cheap'`) maps 1:1 onto the
  virtual ids the proxy understands — **zero client logic changes**.
- A post-trained in-house model (`MODEL_PLAN.md`) would enter this table as one
  more `MODEL_TIER_MAP` entry, most likely on the free tier. That plan is
  independent of P2 and changes nothing here until it ships.
- Paid users can still use the free tier (credit is consumed only when they
  explicitly start an upgraded session); the upgrade picker is shown at setup
  and on the interview start screen.
- Free-quota values (2/day, token caps, spend cap) are env-configurable, not
  hardcoded.

---

## 4. Backend

### 4.1 LLM proxy (`POST /api/v1/chat/completions`)

OpenAI-compatible, streaming and non-streaming, stateless:

1. **Auth**: `Authorization: Bearer <token>` where token = Supabase session
   access token (managed) or the user's BYOK key (self-host mode). Invalid →
   401.
2. **Resolve model**: if body `model` is `main`/`cheap` → look up the user's
   plan (active credit > free) in `MODEL_TIER_MAP` → real OpenRouter id.
   Any other model id is rejected (managed mode never passes real ids through).
3. **Quota check**: free tier → daily interview count, concurrent streams,
   per-interview token budget, per-user monthly spend cap (Redis counters +
   `usage_logs`). Rejections return a typed error body the client already
   renders via `describeLlmError` (reuse `429` + message shape).
4. **Sanitize**: validate JSON (zod), clamp `max_tokens` per call type, drop
   unknown fields, apply the same reasoning-model quirks the client already
   handles (server may pass them upstream untouched — OpenRouter handles both
   param styles; keep it simple: forward as-is).
5. **Forward** to `https://openrouter.ai/api/v1/chat/completions` with the
   server key; relay the SSE stream verbatim; honor client disconnect by
   aborting upstream (`request.signal`).
6. **Meter**: on completion (or stream end), persist only the `usage` object
   (prompt/completion tokens, model, cost) to `usage_logs`. **Never persist or
   log message content.**

**Feasibility note (AI SDK):** the client keeps `createOpenAICompatible` from
`@ai-sdk/openai-compatible` — no change. Server-side, a raw `fetch` + SSE relay
is sufficient (no AI SDK needed); if we later want SDK niceties, AI SDK v4's
`streamText` supports route handlers and `abortSignal` upstream. Both options
verified against `ai@4.3.16`.

### 4.2 Quotas & abuse budget (Upstash Redis + Postgres counters)

| Limit | Free | Paid |
|---|---|---|
| Interviews/day | 2 | — (spend cap only) |
| Concurrent streams | 1 | 2 |
| Per-interview token budget | cap (env, e.g. 120k input-equiv) | higher cap |
| Per-call `max_tokens` clamp | yes | yes (larger) |
| Monthly spend cap/user | yes | yes (protects us from bill spikes) |
| Rate limit `/api/v1` | 30 req/min/user + IP fallback | same |
| Rate limit `/auth`, `/payments`, `/testimonials` | stricter per-IP | stricter per-IP |

Counters are server-side only — the client never enforces its own quota.

### 4.3 Frontend wiring (`lib/llm.ts` managed mode)

- Managed settings: `baseUrl = "/api/v1"`, `model = "main"`,
  `cheapModel = "cheap"`, `apiKey = <session token>` (refreshed on session
  change, stored in memory/localStorage as today).
- `guardedFetch` already attaches credentials only to the configured origin
  and forces `redirect: 'error'` — behavior is reused for the proxy.
- BYOK mode keeps working unchanged (settings screen gains an
  "Akun (disarankan) / Bawa kunci sendiri" selector).

---

## 5. Payments (Midtrans)

**Flow (Snap popup):**

1. `POST /api/payments/orders {tier}` (auth) → server creates
   `payments` row (`status: pending`, random `midtrans_order_id`) → Snap
   transaction (amount 2.000/3.500/5.000, item = tier name) → returns Snap
   token + redirect URL.
2. Client opens the Snap popup.
3. Snap `onSuccess`/close → client polls `GET /api/payments/orders/:id` until
   `settled` (polling only reads; the webhook is the source of truth).
4. Midtrans sends the notification to `POST /api/payments/midtrans/notify`
   (public): verify SHA-512 signature
   (`order_id + status_code + gross_amount + ServerKey`), idempotently update
   the row (store the raw notification), and on `settlement`/`capture` create a
   `credits` row (tier, `expires_at = now + 30 days`). Always reply
   `200`/`201` so Midtrans stops retrying.

**Decisions**

- **Snap** over Core API: hosted UI, less PCI surface, easiest channels.
- **Sandbox first** (`SB-Mid-server-*` keys in dev envs, production keys only
  in Vercel prod env). A settings/env block lets devs test against sandbox.
- **Channel minimums spike (P2-4-1):** some channels enforce minimum amounts;
  for a Rp 2.000 transaction verify QRIS/GoPay/OVO/ShopeePay/VA behavior in
  sandbox. If a channel rejects tiny amounts, restrict the channel list for the
  Standar tier or offer multi-credit packs (3 credits for Rp 5.000).
- **Refunds:** manual only (Midtrans dashboard); ToS states credits are
  non-refundable once consumed. No auto-refund logic in v2.
- **Mid-session upgrade:** not in v2 — the tier is fixed when the interview
  starts; the upgrade picker communicates this clearly.

---

## 6. Data model (Supabase Postgres)

`auth.users` (built-in) + `profiles` (public):

| Table | Columns (key ones) | Notes |
|---|---|---|
| `profiles` | `id` (FK auth.users), `display_name`, `role` (`user`/`admin`), `created_at` | RLS: own row readable |
| `payments` | `id`, `user_id`, `midtrans_order_id` (unique), `tier`, `amount_idr`, `status` (`pending`/`settled`/`failed`/`expired`), `raw_notification` (jsonb), `created_at`, `settled_at` | webhook idempotency: update only forward state transitions |
| `credits` | `id`, `user_id`, `tier`, `status` (`available`/`consumed`/`expired`), `expires_at`, `consumed_at`, `interview_id` | one row per purchase |
| `interviews` | `id`, `user_id`, `tier` (`free`/…), `status` (`running`/`finished`/`abandoned`), `started_at`, `ended_at`, `model_main`, `model_cheap`, `total_input_tokens`, `total_output_tokens`, `total_cost_usd` | usage metadata only — **no transcript content** |
| `usage_logs` | `id`, `user_id`, `interview_id`, `call_type` (`moderator`/`panelist`/`notetaker`/`grader`/`summarize`), `model`, `prompt_tokens`, `completion_tokens`, `cost_usd`, `created_at` | fed by proxy step 6 |
| `testimonials` | `id`, `user_id`, `name` (or anonymous), `text`, `rating` (1–5), `tier_used`, `anonymous`, `status` (`pending`/`approved`/`rejected`), `featured`, `created_at`, `reviewed_at`, `reviewed_by` | see §7 |

RLS: users read/write their own rows; public read on approved testimonials;
admin role gates moderation endpoints.

---

## 7. Testimonials

**Public page `/testimoni` (id+en):**
- Lists approved testimonials (paginated, newest first, rating stars, tier
  badge, "anonim" label).
- Submit form — gated: authenticated, has ≥1 `finished` interview, one
  testimonial per user (editable until approved; new one after rejection).
  Fields: rating 1–5, text 20–500 chars, anonymous toggle, optional name.
  URLs stripped; banned-word list + optional one-shot cheap-model moderation
  before queueing. Submission lands as `pending` with a "Menunggu moderasi"
  state.

**Moderation `/admin/testimoni` (admin role):** approve/reject (with reason),
feature/unfeature; only approved items appear publicly.

**Landing page:** featured carousel (≤3 items; pick `featured=true`, else
top-rated approved) above the fold, with a link to `/testimoni`.

**Anti-abuse:** auth gate + completed-interview gate + one-per-user + rate
limit (1 submission/24h) + moderation queue + no links. Testimonials are the
only user-generated content the server stores and displays.

---

## 8. Security & anti-abuse

**Payments**
- Midtrans webhook signature verified server-side; raw notifications stored;
  idempotent state machine; order ids are unguessable (crypto-random).
- Server key only in Vercel env; sandbox/production key separation.

**Auth**
- Supabase email confirmation + rate limits; Google OAuth allowed.
- Optional Cloudflare Turnstile on signup + testimonial submit (env-gated,
  decide during P2-6 based on observed abuse).

**LLM proxy**
- Zod-validated bodies; whitelisted virtual model ids only; `max_tokens`
  clamps; payload size caps.
- No persistence/logging of message content; usage rows keep counts only.
- `Authorization` never logged; CORS allowlist (app origin only); rate limits
  per user and per IP (Upstash).

**Abuse budget**
- Free-tier quotas enforced server-side (never in the client).
- Per-user monthly spend cap stops bill spikes from one actor.
- Multi-account detection heuristic (shared IP + rapid free interviews) →
  throttle or shadow-freeze; monitored via Supabase logs, not a v2 hard
  requirement to automate.

**Existing assets kept:** client-side doc parsing, prompt-injection fencing,
`guardedFetch` key rules, CI key-leak scan (extended to check the server dir).

---

## 9. Disclaimers & data policy

**Unchanged:** "unofficial practice tool, tidak berafiliasi dengan LPDP/Kemenkeu;
skor tidak memprediksi hasil seleksi asli" stays on landing + report + footer.

**New disclosure (all id+en, via `lib/i18n.ts`):** the app now stores account
data on our servers. Landing/settings/privacy pages state:

> "Data akun Anda (email, riwayat pembayaran, statistik penggunaan seperti
> jumlah token) disimpan di server kami. Dokumen dan transkrip wawancara tetap
> hanya ada di browser Anda — saat wawancara berlangsung, potongan teks
> dikirim melalui server kami ke penyedia AI (OpenRouter) untuk menghasilkan
> jawaban panel, dan tidak pernah disimpan oleh kami."

**Privacy page rewrite — full data-flow table:**

| Data | Browser | Our server (stored) | Third party (transient) |
|---|---|---|---|
| Documents (CV, studi, esai) | ✅ stored | ❌ (pass-through only) | OpenRouter (excerpts per turn) |
| Transcript & notes | ✅ stored | ❌ (pass-through only) | OpenRouter |
| API keys (BYOK) | ✅ stored | ❌ | ❌ |
| Account (email, name) | session | ✅ Supabase | ❌ |
| Payment records | — | ✅ | Midtrans |
| Usage counters (tokens, cost, tier) | — | ✅ | OpenRouter (billing) |
| Testimonials | — | ✅ (approved only public) | ❌ |

**Payments ToS** (new page or privacy section): prices in IDR, credits expire
in 30 days, no refund after consumption, Midtrans as payment processor, sandbox
notice for dev environments.

---

## 10. Interview pause (current workflow)

**Requirements:** pause mid-interview without discarding the session; while
paused the transcript is hidden; resume later (including after a reload);
session continues where it left off.

**AI SDK feasibility — verified, no limitation:**
- AI SDK v4 (`ai@4.3.16`) supports `abortSignal` on both `generateText` and
  `streamText`; `lib/llm.ts` already threads it and `use-interview.ts` already
  aborts the in-flight controller (`abortRef`) for end-early/unmount — pause
  reuses the same mechanism.
- Server-side (managed mode): the proxy aborts the upstream OpenRouter call on
  client disconnect via `request.signal` — supported.
- Consequence (by design): a panelist turn streaming at pause time is
  discarded; on resume the moderator regenerates the turn. Nothing is lost
  from the transcript because the aborted turn was never committed.

**Design**

1. **Types/storage** — add `'paused'` to `InterviewStatus`; bump
   `SCHEMA_VERSION` in `lib/storage.ts` and extend the session validator so a
   stored paused session loads cleanly.
2. **Engine (`lib/panel/engine.ts`)** — `tickClock` already only accumulates
   for `running`/`wrapping`, so a paused session freezes the clock for free.
   Add `pauseSession(session)` → `{ status: 'paused' }` (persist) and
   `resumePausedSession(session)` → `{ status: 'running', tickedAt: now }`
   (same checkpoint trick as `resumeSession`, so paused time is never charged).
3. **Hook (`hooks/use-interview.ts`)** — `pause()`: abort in-flight turn,
   commit paused session. `resume()`: set running + `runPanelTurn()` if the
   last turn wasn't a pending panelist question. Recovery effect: a stored
   `paused` session stays paused (no auto-resume, no clock drift). Note-taker
   completions landing during pause are fine (annotations append; transcript
   hidden anyway).
4. **UI (`app/interview/interview-screen.tsx`)** — pause button beside the
   timer/end controls; paused state replaces the chat area with a "Wawancara
   dijeda" panel (timer frozen, no transcript rendered), resume button;
   composer, voice input, and end-early are disabled while paused (end requires
   resume first). Voice mic is force-stopped on pause.
5. **i18n** — new keys for pause/resume copy (id+en).
6. **Tests** — engine: pause freezes clock, resume restarts checkpoint,
  reload of paused session stays paused; hook: pause aborts in-flight stream
  (reuse the unmount-abort test pattern), resume re-runs the panel turn.

---

## 11. Frontend changes (beyond §4.3, §7, §10)

- **Settings rework:** mode selector (Akun vs BYOK); account card (login /
  logout / quota + credit summary); upgrade entry point; keep "clear local
  data" and connection test for BYOK.
- **Upgrade UI:** tier cards (Rp 2.000 / 3.500 / 5.000) with model comparison,
  Snap popup launcher; billing page listing credits + payment history.
- **Setup & interview start:** tier picker (free default), shows remaining free
  quota today.
- **Landing:** testimonial carousel + "testimoni" nav link.
- **Header/footer:** account menu, new nav items, updated compact disclaimer
  text.
- **i18n:** all new copy in both locales through `lib/i18n.ts` (English tree
  stays typed against the Indonesian one).

---

## 12. Milestones (P2)

Ordered; each task ends with DoD per AGENTS.md (typecheck, lint, test, build,
TASKS.md + progress log).

| ID | Task | Notes |
|---|---|---|
| **P2-1 Backend scaffold & hosting** | | |
| P2-1-1 | Remove `output: 'export'`/`basePath`; add `app/api` route-handler skeleton + `server/` helpers; `.env.example` (Supabase, Midtrans, OpenRouter, Upstash) | update AGENTS.md hard constraints #1/#2 + commands + directory layout in the same change |
| P2-1-2 | Move deploy from GitHub Pages to Vercel (project settings + env); CI keeps lint/typecheck/test + a BYOK-mode build job; key-leak scan extended to `server/` | Pages workflow removed or repurposed for self-host docs |
| **P2-2 Auth & managed mode** | | |
| P2-2-1 | Supabase Auth wiring: login/signup UI (magic link + Google), session provider, account card | |
| P2-2-2 | Managed mode in `lib/llm.ts` + settings selector (Akun/BYOK), session-token as key, `NEXT_PUBLIC_MODE` flag | BYOK path regression-tested |
| **P2-3 LLM proxy** | | |
| P2-3-1 | Spike: verify OpenRouter model availability/cost for §3 defaults; pin `MODEL_TIER_MAP` | |
| P2-3-2 | `/api/v1/chat/completions` proxy: auth, tier→model resolution, quotas, clamps, SSE relay, usage metering, disconnect abort | |
| P2-3-3 | Upstash rate limits + free-quota counters + monthly spend cap; typed error bodies surfaced via existing `describeLlmError` | |
| **P2-4 Midtrans payments** | | |
| P2-4-1 | Spike: sandbox channel minimums for Rp 2.000; decide channel list/pack bundling | |
| P2-4-2 | Orders endpoint + Snap popup + upgrade tier cards UI | |
| P2-4-3 | Webhook: signature verify, idempotent updates, credit grant; status polling; billing page | |
| **P2-5 Testimonials** | | |
| P2-5-1 | `testimonials` table + RLS; submit endpoint (gates + moderation checks) | |
| P2-5-2 | `/testimoni` page (list + form + pending state) | |
| P2-5-3 | Admin moderation page; landing featured carousel | |
| **P2-6 Security hardening** | | |
| P2-6-1 | CORS allowlist, payload caps, header hygiene, auth rate limits; Turnstile decision (env-gated) | |
| P2-6-2 | Abuse review: multi-account heuristic, quota edge cases, webhook replay tests, admin audit log (minimal) | |
| **P2-7 Trust & docs** | | |
| P2-7-1 | Disclaimer updates + privacy page rewrite (§9 table) + payments ToS (id+en) | |
| P2-7-2 | README v2 (hosted + self-host/BYOK), CONTRIBUTING, env docs | |
| **P2-8 Interview pause** | | |
| P2-8-1 | Engine + storage: `paused` status, schema bump, pause/resume helpers + tests | |
| P2-8-2 | Hook wiring (abort on pause, resume loop) + UI paused screen + i18n + tests | |

**Ordering rationale:** P2-1→P2-3 make the free tier usable end-to-end before
payments exist (free users can already interview via the proxy). P2-4 is the
first revenue milestone. P2-5 can proceed in parallel with P2-6. P2-8 is
independent of the backend work (works in BYOK mode too) and can be pulled
earlier if desired.

---

## 13. Risks & open questions

- **OpenRouter cost drift** — mitigated by config-driven tier map + spend caps +
  `usage_logs` monitoring; revisit defaults monthly.
- **Free-tier cost exposure** — quotas above are conservative; monitor
  `usage_logs` from day one, add a dashboard query in P2-3-3.
- **Midtrans minimums for Rp 2.000** — spike P2-4-1; fallback = channel
  restriction or credit packs.
- **Model availability** at launch may differ from §3 defaults — spike P2-3-1
  pins final ids before P2-3-2.
- **Self-host story** must not regress — BYOK build stays in CI (P2-1-2).
- **Open questions (decide before/at implementation):**
  1. Production domain & branding (affects CORS allowlist, Midtrans app
     registration, email sender).
  2. Whether paid users get a badge/display name on testimonials (leaning yes:
     "Tier: Pro" chip).
  3. Free daily limit final value (2/day proposed) — start conservative, tune
     with usage data.
  4. Admin access model (Supabase admin role via `profiles.role` proposed).
