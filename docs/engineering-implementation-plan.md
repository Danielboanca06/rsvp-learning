# Engineering Implementation Plan

*Companion to `docs/product-strategy.md`. Everything that needs to be added or changed to reach the MVP launch, grounded in the current codebase. Ordered by workstream; sequencing at the end.*

Conventions used below: model names refer to `prisma/schema.prisma`; tasks/tiers refer to `lib/llm.ts` + `lib/llm-quota.ts`; chat platform refers to `lib/chat/*` + `components/chat/*`.

---

## Workstream A — Finish the Ask-AI selection feature (Phase 0)

Most of this exists (uncommitted): `SelectionChatPanel`, `ChatPanel`, `ThreadDrawer`, `useChatThread`, orchestrator, `selection`/`practice` thread kinds, practice threads listed under modules on the document page. Remaining work:

**A1. Layout: document shift-left.** When the panel opens on `/documents/[id]/read` and `/documents/[id]`, the document column must animate to a narrower left column (framer-motion layout transition) instead of being overlaid, preserving reading context. Panel is a right sidebar ≥380px on desktop; on mobile it becomes a bottom sheet. Acceptance: open/close never loses scroll position or current chunk.

**A2. Selection affordance unification.** `SelectionDefinePopover` (vocabulary) and the new Ask-AI trigger both act on text selection. Merge into one popover with two actions: "Define" (existing vocabulary flow) and "Ask AI" (opens `SelectionChatPanel` with the selection + chunk anchors). Must work in `ParagraphView` and on the summary/detail views wherever document text renders.

**A3. Practice sub-thread anchoring.** Already modeled (`parentThreadId`, kind `practice`). Add: (a) the parent selection thread shows a persistent "Practice this passage" button (exists — verify state when a practice child already exists: re-open, don't duplicate); (b) on the document page, practice threads render as children of their module section with status (in progress / completed); (c) mark a practice thread `status: "archived"` (schema field exists) when the tutor declares the summary complete — detect via a structured tag the model emits (see A6).

**A4. Chat quota gating.** `LlmTask` already includes `"chat"`. Verify every message POST route calls `reserveLlmCall` + records `LlmUsageEvent` with `task: "chat"` (grep shows gating on threads/messages route — confirm failure path returns the same 402-style payload `UpgradePrompt` expects, reusing `llmGateErrorResponse`).

**A5. Thread lifecycle UX.** Reconnect to an in-flight SSE stream on page refresh (or degrade gracefully: mark message `failed`, offer retry). Retry action for `status: "failed"` messages. Empty/error/loading states in `ChatPanel`. Cap thread history sent to the model (last N messages + system prompt) to bound input tokens.

**A6. Structured completion signal for practice.** Extend the practice system prompt (`lib/chat/prompts.ts`) so the final approval reply includes a machine-readable marker (e.g. a `<practice_complete/>` token or a tool call). Orchestrator strips it, sets thread status, awards `PointsEvent` (`reason: "practice_completed"`, new reason string), and emits a celebratory UI state.

**A7. `diagram` message part.** New part type in `lib/chat/protocol.ts`:

```ts
export type DiagramPart = { type: "diagram"; format: "mermaid"; source: string; caption?: string };
```

- Orchestrator: parse fenced ```mermaid blocks out of streamed text into a `DiagramPart` (post-processing in the reducer is fine for v1; no new stream event needed).
- Renderer: new `MessageParts` case, client-side Mermaid render (dynamic import, error-tolerant — on parse failure show the source in a code block, never crash).
- Prompt: add to `SHARED_TUTOR_STYLE`: the tutor may include ONE small mermaid diagram when a structure/process/relationship is genuinely clearer as a picture.
- Old clients ignore unknown parts by design — no migration.

**A8. Tests.** Protocol reducer tests for the new part (extend `lib/chat/__tests__/protocol.test.ts`); orchestrator test for practice-completion detection; route test for chat quota exhaustion.

---

## Workstream B — AI course generation (Phase 1, the MVP headliner)

### B1. Schema (new models)

```prisma
model Course {
  id            String   @id @default(cuid())
  userId        String
  spaceId       String   // dedicated Space created per course
  title         String
  goal          String   // learner's stated objective
  learnerBrief  Json     // intake answers: level, time budget, motivation, interests
  status        String   @default("draft") // draft | active | completed | archived
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  modules       CourseModule[]
  @@index([userId, status])
}

model CourseModule {
  id          String    @id @default(cuid())
  courseId    String
  course      Course    @relation(fields: [courseId], references: [id], onDelete: Cascade)
  order       Int
  title       String
  objectives  Json      // string[] learning objectives (Bloom verbs)
  summary     String    // 1-2 sentence syllabus description
  status      String    @default("locked") // locked | unlocked | generating | ready | completed | failed
  documentId  String?   @unique // set once generated; content lives in existing Document/Chunk
  generatedAt DateTime?
  @@unique([courseId, order])
  @@index([courseId])
}
```

Add `Document.sourceType String @default("upload")` (`"upload" | "generated"`) and keep the generated module's `Document` in the course's `Space` so *every* existing surface (read flow, quizzes, FSRS review, daily quiz per Space, analytics) works unchanged.

### B2. LLM layer (`lib/llm.ts`)

Two new tasks with their own provider pools, prompts, and hard `max_tokens` caps:

- `coursegen_syllabus` — input: learner brief; output JSON: `{ title, modules: [{ title, summary, objectives[] }] }` (6–12 modules). Cap ~3k output tokens. Route to a mid-tier model (quality matters most here).
- `coursegen_module` — input: learner brief + syllabus + this module's objectives + titles of prior modules + (optional) learner performance summary; output JSON: **pre-chunked sections** `{ sections: [{ title, content, keyPoints[] }] }` (4–8 sections, ~150–350 words each — matches existing `Chunk` shape, skips the separate chunking call). Cap ~6k output tokens per module. Cheap model, escalate only if quality demands.

Both must respect the existing `Tier` routing and fallback loop. Add zod schemas in `lib/validation.ts` for both outputs; on parse failure retry once with a repair prompt, then mark module `failed` (visible, retryable — never silently swallow like the current chunking heuristic fallback).

### B3. Course pipeline (`lib/course.ts`, new)

- `createCourse(userId, intake)` → creates `Course` (+ its `Space`), calls `coursegen_syllabus`, persists `CourseModule` rows (module 1 `unlocked`, rest `locked`). One gated LLM call.
- `generateModule(courseId, order)` → guard: module is `unlocked`; set `generating`; call `coursegen_module`; create `Document` (`sourceType: "generated"`) + `Chunk` rows; set `ready` + `documentId`. Idempotent (re-entry while `generating` is a no-op; unique `documentId` guards double-create). Runs in the request with `maxDuration` extended like `app/api/documents/route.ts` does for chunking.
- `completeModule(courseId, order)` → called when the module's document is mastered (all chunks passed + module quiz completed, reusing existing `Attempt`/`Quiz` data); sets module `completed`, unlocks `order + 1`. "Test out" variant: completing the module quiz at ≥80% without reading also unlocks.
- Adaptive hook (cheap, v1): when generating module N, include a 1-paragraph performance summary computed from `Attempt` scores + `quizWrongCount` on modules < N (pure SQL, no extra LLM call).

### B4. API routes (new)

| Route | Method | Behavior |
|---|---|---|
| `/api/courses` | POST | intake payload → gated syllabus generation → course + modules (draft) |
| `/api/courses` | GET | list user's courses with progress % |
| `/api/courses/[id]` | GET / PATCH / DELETE | detail incl. modules; PATCH = syllabus edits (rename/reorder/delete modules while `draft`, then `status: "active"`); DELETE archives |
| `/api/courses/[id]/modules/[order]/generate` | POST | gated lazy generation (see B3); returns document id |
| `/api/courses/[id]/modules/[order]/complete` | POST | mastery-gate check + unlock next |

All follow existing conventions: Clerk `auth()`, zod validation, `llmGateErrorResponse` on quota/credit failure.

### B5. UI (new pages/components)

- `/courses/new` — 3-step wizard: (1) "What do you want to learn?" + goal; (2) level / time budget / why (radio + free text); (3) streamed syllabus review screen — editable module list, "Regenerate" (costs credits again, confirm), "Start course" CTA. Component: `components/course/CourseWizard.tsx`.
- `/courses/[id]` — course home: title, goal, progress bar, module list with states (locked 🔒 / unlocked / generating spinner / ready / completed ✓), "Continue" CTA to the next actionable module. Generating state polls or uses SSE. Components: `CourseHome.tsx`, `ModuleCard.tsx`.
- Module open: if `ready`, route straight into the existing `/documents/[id]/read` flow (zero new learning-loop UI); on session/quiz completion, call the complete endpoint and show unlock animation back on course home.
- Dashboard: add a "Courses" rail beside Documents/Spaces (`DashboardView`), plus "Create a course" as a primary empty-state CTA.
- Navigation: "Courses" link in `NavLinks` + mobile menu.

### B6. Credits & gating changes (`lib/llm-quota.ts`)

Current gate charges a flat `CREDIT_COST_PER_CALL = 1` and counts every free action identically. Needed:

- Per-task credit costs: `{ grading: 1, quizgen: 1, chat: 1, chunking: 5, coursegen_syllabus: 10, coursegen_module: 5 }` (≈35–50 credits for a full course, matching strategy pricing). `reserveLlmCall(userId, task)` looks up cost; `reserveCreditAtomic` already takes a `cost` param.
- **Free tier: course generation is hard-blocked** (not merely quota-counted) — return a distinct gate reason `"pro_feature"` so the UI can show the upgrade/trial pitch rather than "quota exceeded".
- Record the task's credit cost on `LlmUsageEvent` (add `creditsCharged Int?`) so revenue-vs-cost per task is one query.
- Refund on failure: if generation fails after reserving credits, credit them back via `CreditLedger` (`reason: "refund"`, already an enumerated reason).

---

## Workstream C — Tutor inside courses

**C1. `module` thread kind.** New `ChatThreadKind` `"module"`: one persistent tutor thread per generated module (anchor: `documentId`, no selection). Entry point on course home and in the read flow ("Ask the tutor"). System prompt (`buildModuleTutorPrompt`) includes: module objectives, learner brief, syllabus outline, and recent attempt history for this module.

**C2. New tool: `read_learner_performance`.** Registered in `lib/chat/tools.ts`; applicable when a thread has a `documentId`; returns a compact summary of the user's attempts/scores/quiz misses on that document so the tutor grounds difficulty adaptively. (Pure DB read; follows existing `ChatTool` shape.)

**C3. Prompt tuning pass.** Budget explicit engineering time for iterating `lib/chat/prompts.ts` + the two coursegen prompts against 5–10 real topics (technical, humanities, language, practical skill). Keep prompts in code, versioned; log prompt version into `LlmUsageEvent` metadata if cheap to add.

---

## Workstream D — Learner model (v1.1, ship right after MVP)

`LearnerProfile` table: `userId` PK, `knowledgeClaims Json`, `interests Json`, `misconceptions Json`, `paceNotes String?`, `updatedAt`. Written by a single cheap LLM summarization call triggered at session/practice completion (fire-and-forget); read by all tutor prompt builders. Explicitly *not* "learning styles" — only mastery/interest/goal data. Cut from MVP if timeline slips; the schema hooks (prompt builders taking an optional profile) should land in C1 so this slots in later.

---

## Workstream E — Billing, trial & growth mechanics

**E1. Reverse trial.** On first sign-in (Clerk webhook or lazy on first API hit): create `UserPlan` with `plan: "trial"`, `trialEndsAt DateTime` (+7 days), grant 100 credits via `CreditLedger` (`reason: "trial_grant"`). `getUserTier` returns `"paid"` while trial active. Expiry: check `trialEndsAt` lazily in `getUserTier` (no cron needed) — expired → `free`, remaining trial credits zeroed (ledger entry `trial_expiry`). Trial includes enough for exactly ~1 course + normal usage. UI: trial countdown badge in nav, end-of-trial modal with annual-discount offer.

**E2. Pricing config.** Stripe: `pro_monthly` $7 → 500 credits/period (grant on `invoice.paid`, plumbing exists), `pro_annual` ~$60, `topup_250` $5 (one-time, exists as top-ups). Keep credit costs and grant sizes in one config module (`lib/pricing.ts`) — they will be tuned.

**E3. Free-tier fallback budget cap.** Global monthly cap (env var, e.g. $10) on paid-model spend attributable to free/trial users: track via `LlmUsageEvent` aggregate; when exceeded, free-tier calls only use free-quota providers and fail soft ("high demand — try again later"). Kill-switch env var to force-route everything to the cheapest provider.

**E4. Streaks (cheap, proven).** `DailyActivity` table or derive from `PointsEvent` timestamps: current/longest streak computed server-side, shown in nav + dashboard. A streak day = ≥1 graded summary, review, or quiz answer. No leagues/leaderboards in MVP.

**E5. Email review reminders.** Provider: Resend (free tier). Daily Vercel cron route: users with due FSRS chunks (`Chunk.dueAt <= now`) and reminders enabled → one summary email ("5 modules due"). Needs `EmailPreference` (userId, enabled, lastSentAt) + unsubscribe route. Also the trial-day-6 email.

---

## Workstream F — Instrumentation, ops, hardening

**F1. Product analytics.** PostHog (free tier) or a minimal internal `AppEvent` table. Required events: `signup`, `document_created`, `course_created`, `module_generated`, `first_summary_graded`, `review_completed`, `trial_started/converted/expired`, `checkout_completed`, `quota_blocked`, `paywall_viewed`. Funnel dashboards: signup → first graded summary; trial → paid.
**F2. COGS monitoring.** Weekly query over `LlmUsageEvent` (`realCostUsd` by task/tier/user); alert (email to founder) if any user >$2/mo or free-tier paid-fallback spend > cap.
**F3. Infra.** Vercel Hobby → **Pro before charging** (commercial-use ToS); confirm `maxDuration` on the two coursegen routes; Neon plan check; Stripe live-mode keys + webhook signing verification re-check; rate limiting on unauthenticated + LLM-backed routes (simple per-user token bucket in Postgres or Upstash free tier).
**F4. Security/robustness.** Prompt-injection hygiene: document/course content is user-influenced — tutor prompts must treat document text as data (already quoted/delimited; audit). Zod-validate all LLM JSON outputs (exists for current tasks; required for the two new ones). PDF upload limits (size/page cap) before chunking spend.
**F5. Tests/CI.** Vitest already set up. Required new coverage: per-task credit costs + pro-feature gate (`llm-quota`), course pipeline state machine (lock→generate→ready→complete→unlock, idempotency, refund-on-failure), syllabus/module zod parsing incl. repair path, trial expiry tier resolution, streak computation. Add a GitHub Actions workflow (lint + test) if not present.

---

## Out of scope for MVP (do not build yet)

Course publishing/marketplace, public profiles, leaderboards/leagues, social features, native mobile apps, voice/audio tutoring, AI image generation, team/B2B features, offline mode. (Phase 3 — see strategy doc.)

---

## Sequencing & dependencies

```
A1–A6 (finish Ask AI)  ──►  ship Phase 0
A7 diagram part        ──►  anytime, independent
B1 schema ► B2 llm tasks ► B3 pipeline ► B4 routes ► B5 UI   (course gen spine)
B6 credits/gating      ──►  before B4 routes go live
C1–C2 module tutor     ──►  after B3 (needs modules to anchor to)
E1 reverse trial       ──►  before launch (needs B6's pro_feature gate)
E2 pricing config      ──►  before launch
E3/E4/E5, F1–F5        ──►  parallel, all pre-launch except E5 (can trail by a week)
D  learner model       ──►  post-launch v1.1
```

**Launch gate (MVP acceptance test):** a new user signs up → trial starts → types "I want to learn SQL" → edits & approves a 6-module syllabus → module 1 generates in <60s → completes it with RSVP/paragraph reading, graded summaries, Socratic feedback, and the module quiz → module 2 unlocks → next day a review is due and the reminder email arrives → highlights a sentence, asks the tutor, gets a Socratic answer with a diagram → trial expires → course remains readable, further generation paywalled → checkout at $7 works end to end.
