# Product Strategy & MVP Roadmap — RSVP Learning

*July 2026. Goal: evolve the app into an AI-tutored learning platform — "the primary school teacher who stuck by your side, for any topic" — bootstrapped and self-funding.*

---

## 1. Where we are today (codebase audit)

The app is further along than "documents + questions". What exists and works:

- **Ingestion → chunking**: PDF/text upload, LLM semantic chunking into titled sections (`lib/llm.ts`, task `chunking`).
- **Active recall core loop**: read a chunk (RSVP or paragraph mode) → write your own summary → LLM grades it with a score, hint, and Socratic question (`Attempt`, `SocraticFeedback`). This is the app's soul.
- **Spaced repetition**: FSRS-6 scheduling per chunk (`ts-fsrs`), review sessions, review badge.
- **Quizzes**: per-document module quizzes + daily quizzes per Space, MCQ generation tied to chunks, wrong-answer tracking.
- **Vocabulary**: select-to-define, daily recall practice.
- **Motivation**: points ledger (`PointsEvent`), analytics, sparklines.
- **Organization**: Spaces (subject folders).
- **Chat platform (in progress)**: generic `ChatThread`/`ChatMessage` with typed message parts, surface kinds (`selection`, `practice`), parent/child threads, SSE orchestrator, tool support. This is the "Ask AI on highlighted text + summarize-in-your-own-words sub-thread" feature — and, crucially, it's built as a platform, not a one-off.
- **Monetization plumbing (already built)**: free tier of 30 AI actions/month, credit-based Pro, Stripe subscriptions + top-ups with idempotent webhooks, per-call usage/cost logging (`LlmUsageEvent`), multi-provider LLM gateway stacking free-tier quotas with paid fallback.

**The strategic insight**: most "AI learning" products are a chat box. We already have the two things a chat box can't offer — a *structured learning loop* (chunk → recall → grade → schedule) and *persistence* (FSRS debt, points, progress). The plan below builds course generation and tutoring on top of that loop rather than beside it.

---

## 2. Learning science foundation (what the research says)

Everything we build should be justified by evidence. The strongest findings from a century of cognitive/educational psychology:

1. **Retrieval practice (practice testing)** and **distributed (spaced) practice** are the two highest-utility techniques — confirmed by Dunlosky et al. (2013) and replicated by Hattie & Donoghue's meta-analysis of 242 studies / 169k participants. Passive rereading and highlighting are near-worthless. *We already do both (summaries, quizzes, FSRS). Double down.*
2. **Combining testing + spacing** beats either alone. *FSRS scheduling of quiz items, not just re-reads.*
3. **Elaborative interrogation & self-explanation** ("why is this true?", explain in your own words) are moderate-to-high utility. *This is exactly the practice sub-thread feature. The Socratic method is elaboration made interactive.*
4. **Bloom's 2-sigma (1984)**: one-on-one tutoring with mastery learning moves the average student two standard deviations up. AI is the first economically viable path to this. A 2025 Harvard RCT (Kestin et al., Scientific Reports) found a purpose-built AI tutor produced **0.73–1.3 SD** learning gains in *less* time than active-classroom teaching; a 2025 UK classroom RCT found LLM tutoring (LearnLM, human-supervised) comparable to expert human tutors. The key phrase is *purpose-built*: pedagogy prompts + structure won, not raw chat.
5. **Mastery learning**: don't advance until the current unit is demonstrably understood. *Our pass/fail chunk gate is this; courses should keep it.*
6. **Desirable difficulties / generation effect**: producing an answer beats recognizing one. Free-text summaries > MCQ. *Keep MCQs for cheap daily engagement, but the graded summary stays the core assessment.*
7. **⚠ "Learning styles" (visual/auditory/kinesthetic matching) is a debunked neuromyth** — four meta-analyses put the matching effect at d ≈ 0.04. **Do not build style-matching.** What *does* work as personalization: adapting to **prior knowledge, pace, demonstrated mastery, interests, and goal** (why they're learning). Frame our adaptivity as a *learner model* (what do they know, where do they struggle, what examples land) — that's real, and it's what the memory/personalization layer in §4.4 does. Multiple *representations* (diagrams + text + worked examples) help everyone; offering them isn't style-matching, it's dual coding.

---

## 3. Market position

| Player | What they are | Price | Gap we exploit |
|---|---|---|---|
| ChatGPT Study Mode / Gemini Guided Learning | Free Socratic chat modes | Free | No persistence, no scheduling, no structured course, no accountability loop |
| Khanmigo | AI tutor over Khan Academy's fixed catalog | $4/mo | Can't learn *anything* — only their catalog; engagement is weak (~15% regular use) |
| Anki & clones | Spaced repetition | Free–$25 | You author every card yourself; no tutor, no comprehension |
| AI course builders (Coursebox, Mindsmith, LearnWorlds) | B2B authoring tools for *instructors* | $10–40+/mo | They generate courses to *sell*, not to *learn* — no recall loop, wrong buyer |
| Duolingo | Gamified fixed-curriculum learning | Freemium | Only languages (and a few subjects); proves streaks/leagues retain (7-day streak users retain 2.4×) |

**Positioning statement**: *"Learn anything. Actually remember it."* — an AI tutor that builds you a course on any topic, teaches it Socratically at your level, and uses active recall + spaced repetition so it sticks. We are not selling chat (free elsewhere); we're selling the **system and the outcome**.

---

## 4. The product we're building

### 4.1 Ship the current feature first (Ask AI on selection)

Finish what's specced: highlight → contextual "Ask AI" → right chat panel, document shifts left → Socratic explanation grounded in selection + full document → optional practice sub-thread anchored to the section where the user summarizes in their own words. The `ChatThread` schema, prompts, and orchestrator already support all of it. This is a prerequisite for everything below because **the same chat platform becomes the course tutor**.

### 4.2 AI course generation (the MVP headliner)

"I want to learn X" → a full course, module by module, that plugs into the existing loop. Architecture that keeps quality high and cost low:

1. **Intake interview (1–2 cheap LLM turns)**: goal, current level, time budget, motivation. A 3-question form + one clarifying AI turn. Output: a *learner brief*.
2. **Syllabus generation (1 call, mid-tier model)**: ordered module list with learning objectives per module (Bloom's taxonomy verbs), prerequisites, and an estimated effort. Show it to the user for approval/edit *before* generating content — this is both good pedagogy and a cost gate.
3. **Lazy module generation (1 call per module, on first open)**: generate module content *only when the user reaches it*. Most learners never finish; lazy generation cuts course COGS by 50–80% and lets later modules adapt to performance on earlier ones. Each module is generated as pre-chunked sections (skip the separate chunking call) with embedded worked examples and one diagram spec.
4. **Reuse the entire existing engine**: a generated module is just a `Document` in a course `Space` → RSVP/paragraph reading, graded summaries, Socratic feedback, FSRS review, quizzes, points — zero new learning-loop code. Add `Course` and `CourseModule` models (or a `kind` on Space/Document) plus `sourceType: "generated"`.
5. **Mastery gate between modules**: module quiz + summary passes unlock the next module (skippable, but visibly "tested out").

Cost reality (cheap-model class, $0.15/$0.60 per 1M tokens): a full 8-module course ≈ 50–200k output tokens ≈ **$0.04–$0.13**, or ~$0.15–0.55 on a stronger model for syllabus + explanations. Course generation is 100–500× the cost of grading a summary — it is the *only* action that materially matters for COGS, so it is credit-priced and never free (see §6).

### 4.3 The guided tutor (evolve, don't invent)

The tutor is the chat platform + pedagogy prompts, upgraded over time:

- **Study-mode default inside courses**: every module gets a persistent thread whose system prompt includes the module objectives, the learner brief, and recent attempt history. Socratic first, explanation second, never just the answer.
- **Diagram/visual parts**: the `ChatMessage.parts` array was explicitly designed for new part types with no migration. Add a `diagram` part (Mermaid or constrained SVG generated by the model) and a `quiz` part (inline check-for-understanding the tutor can drop mid-conversation). Renderers ignore unknown parts, so this ships incrementally.
- **Adaptive difficulty**: use signals we already store — attempt scores, quiz wrong-counts, FSRS lapses, WPM — to tell the tutor "this learner is struggling with module 3's second objective; re-teach with a simpler analogy" or "they're cruising; compress."

### 4.4 Learner model & memory (personalization that's real)

A small per-user profile the tutor reads and writes: prior knowledge claims, goals, interests (for tailored analogies — "explain via football"), misconception log, preferred pace. Stored as structured rows, injected into prompts, updated after sessions with one cheap summarization call. This is the honest version of "learns how you learn" — grounded in mastery data, not style quizzes.

### 4.5 Post-MVP (explicitly out of scope for launch)

Course **publishing/marketplace**, public profiles, points **leaderboards/leagues**, streak wagers, social features, mobile apps, audio/voice tutoring, image generation in courses. Community features are a chicken-and-egg problem before you have users; gamification beyond points/streaks needs a population to rank. Duolingo's data (streaks drive 2.4× retention; leagues drive daily return) says these are *phase 3 growth multipliers*, not MVP requirements.

---

## 5. Roadmap

### Phase 0 — Finish the tutor surface (now → ~2-3 weeks)
Ship selection Ask-AI + practice sub-threads end to end (panel UX, thread anchoring under document sections, mobile). Add the `diagram` message part (Mermaid render) — small, high-wow. Harden chat quota gating.

### Phase 1 — MVP: course generation (≈ 4–8 weeks)
- Intake → syllabus (user-editable) → lazy per-module generation → modules run through the existing read/recall/review loop with mastery gates.
- Course home screen: syllabus with progress, locked/unlocked modules, "continue" CTA.
- Per-module tutor thread with module context.
- Credit-price course generation; reverse trial (§6); switch Vercel Hobby → Pro (commercial-use requirement).
- Quality pass: try 5–10 real courses yourself (a language topic, a technical topic, a history topic…), tune the syllabus/module prompts. Prompt quality is the product here — budget real time for it.
- **MVP acceptance test**: a stranger types "I want to learn SQL", gets a credible 6-module course, completes module 1 with graded summaries and a quiz, gets a review scheduled tomorrow, and the tutor answers a highlighted-text question Socratically. If that demo works, launch.

### Phase 2 — Launch + first users (weeks 10–16)
- Launch: Product Hunt, r/GetStudying / r/Anki / r/learnprogramming, HN Show HN, X/TikTok demo clips (the RSVP reader + "watch AI build me a course" is inherently demoable).
- Instrument activation funnel (signup → first doc or course → first graded summary → day-7 return). Fix drop-offs before adding features.
- Cheap retention: email review reminders ("5 chunks due today"), streaks (simple daily-goal streak — near-zero cost, proven 2.4× retention effect).
- Target: **~350 registered users ≈ break-even** at 2% conversion (see §6); with a working reverse trial (5–8%), ~100–150.

### Phase 3 — Community & growth (after first ~500–1,000 users)
- **Publish a course**: one-click share of a generated course (content already static once generated — served at ~$0 marginal cost; buyer's recall/tutor usage is on *their* quota). Public course gallery with search.
- Profiles: points, courses created/completed, badges; then leaderboards/leagues once the population supports it.
- A shared-course library also *amortizes generation cost to ~$0* for popular topics — the economics improve as the community grows.
- Explore B2B2C later (teachers/teams), the historically more reliable edtech revenue path.

---

## 6. Business model (business-analysis summary)

Assumptions: cheap-model class $0.15/$0.60 per 1M tokens; free users routed through stacked free-tier provider quotas (≈$0 marginal) with capped paid fallback.

**Cost per action**: grade a summary ~$0.0003 · chat turn ~$0.0005 · daily quiz ~$0.001 · chunk a 20-page doc ~$0.004 · **full course $0.04–0.55** (model-dependent). A free user (30 actions) costs ~$0.01–0.03/mo; an active Pro user ~$0.40–1.30/mo, of which course generation is 70–90%.

**Pricing — recommended: $7/mo (or ~$60/yr) hybrid credits** (the system already built):
- Subscription grants **500 credits/mo**. Grading/quiz/chat = 1 credit, doc chunking = 5, **course = 30–50** (or per-module). Worst-case COGS ≈ $2.50 → ~57% margin floor, ~82% typical.
- **Top-ups $5 → 250 credits** (≈75% margin), impulse-priced.
- **Unlimited & free forever**: reading, RSVP, FSRS review scheduling, viewing generated content — zero LLM cost, maximizes habit formation.
- Rejected alternatives: flat unlimited $7–10 (one course-gen power user destroys margin); course-packs only (no recurring revenue, abandons the retention loop that *is* the product).
- Why $7: Khanmigo's $4 is subsidized nonprofit pricing; B2B course builders at $10–40 are the wrong comparison; $7 clears costs with margin at consumer-acceptable levels.

**Free tier & conversion**:
- 30 actions/month should map to one complete "aha" loop: 1 doc chunked + ~20 graded summaries + quizzes + a couple of chat turns — the user *feels* the system work on their own material.
- **Course generation is never free.** It's both the cost bomb and the hero feature — perfect paywall placement (gate at the moment of highest desire).
- **Reverse trial**: 7 days of Pro on signup incl. ~100 credits and exactly **1 course generation** (~$0.15–0.50 one-time cost — trivially cheap CAC). After trial, their course stays visible but further generation locks. RevenueCat benchmarks: freemium converts ~2%, hard paywalls ~10.7%; reverse trials are the recommended fix when freemium underperforms.

**Break-even**: fixed costs ~$30–45/mo at first revenue (Vercel Pro $20 + Neon $5–19 + domain). Net per Pro user at $7 ≈ $5.75 after Stripe fees + typical COGS → **6–8 Pro users = break-even**; 100 Pros ≈ $575/mo profit. LTV at 10%/mo churn ≈ $57–60 — fine with $0 organic CAC; **do not buy ads** at these numbers.

**Two non-negotiable disciplines**: (1) never give away course generation, (2) never route free users to premium paid models.

---

## 7. Top risks

1. **"ChatGPT does this free."** Mitigate by selling the system (structure + grading + scheduling + progress), not the chat; demo the loop, market the outcome ("actually remember it").
2. **Course-gen cost blowout / abuse.** Hard `max_tokens` per module, per-user daily course caps, credits, weekly `LlmUsageEvent` review, env-var kill switch to force cheapest model; later, shared-course caching amortizes cost.
3. **Course quality is mediocre.** The existential product risk. Mitigations: syllabus-first with user edit, objective-driven module prompts, mastery-gated iteration, and founder-led quality passes on real topics before launch. A bad generated course loses the user permanently.
4. **Free provider quotas revoked.** Gateway already has paid fallback; add a monthly fallback budget cap for free traffic (e.g., $10), then degrade gracefully (queue, or "come back tomorrow").
5. **Consumer churn (8–15%/mo typical).** FSRS review debt, streaks, email reminders, annual plans (~30% discount pitched at trial end) to lock in motivated learners before motivation decays.
6. **Conversion <2%.** Reverse trial + paywall on course gen; if still low, tighten free tier before adding features.

## 8. Metrics that matter (from day one)

Activation: signup → first graded summary (target >40%); % of trials that generate a course. Learning: median chunk pass rate, review completion rate, D7/D30 retention. Business: trial→paid conversion (target ≥5% with reverse trial), COGS per Pro user (alert if >$2/mo avg — the `LlmUsageEvent` table already makes this a single query), churn.

---

## 9. Immediate next actions

1. Finish and polish the selection Ask-AI + practice sub-thread feature (Phase 0).
2. Add the Mermaid `diagram` message part.
3. Design `Course`/`CourseModule` schema + the three course-gen prompts (intake, syllabus, module) and start testing them on real topics with cheap models.
4. Set course credit pricing (30–50 credits) and implement the reverse trial.
5. Move to Vercel Pro before charging money.

**Sources**: Dunlosky et al. 2013 / [Hattie & Donoghue replication](https://ecsglobal.in/improving-students-learning-with-effective-learning-techniques-promising-directions-from-cognitive-and-educational-psychology/) · [Kestin et al. 2025 Harvard AI-tutor RCT](https://etcjournal.com/2025/11/10/review-of-kestin-et-al-s-june-2025-harvard-study-on-ai-tutoring/) · [UK classroom LLM-tutoring RCT](https://arxiv.org/html/2512.23633v1) · [Learning-styles meta-analyses (d≈0.04)](https://carlhendrick.substack.com/p/the-learning-styles-illusion-debunking) · [Khanmigo pricing](https://www.khanmigo.ai/pricing) · [ChatGPT Study Mode](https://openai.com/index/chatgpt-study-mode/) · [Gemini Guided Learning](https://techcrunch.com/2025/08/06/google-takes-on-chatgpts-study-mode-with-new-guided-learning-tool-in-gemini/) · [LLM pricing 2026](https://pricepertoken.com/) · [RevenueCat State of Subscription Apps](https://www.revenuecat.com/state-of-subscription-apps/) · [Duolingo gamification case study](https://trophy.so/blog/duolingo-gamification-case-study) · [AI course-builder market](https://www.skillstudio.ai/industry-news/best-ai-course-builders-complete-comparison-guide-for-2026)
