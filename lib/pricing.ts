// Single tunable config for everything money-shaped: per-task credit costs,
// trial parameters, Stripe grant sizes, and the free/trial paid-model budget
// cap. These numbers WILL be tuned — keep them here, not scattered through the
// gate/billing/webhook code that applies them.

export type LlmTask = "chunking" | "grading" | "quizgen" | "chat" | "coursegen_syllabus" | "coursegen_module";

// Credits deducted per paid-tier call. A full course lands around 35-50 credits
// (1 syllabus + 6-12 modules + normal grading/quiz usage), matching the
// strategy doc's pricing model.
export const CREDIT_COSTS: Record<LlmTask, number> = {
  grading: 1,
  quizgen: 1,
  chat: 1,
  chunking: 5,
  coursegen_syllabus: 10,
  coursegen_module: 5,
};

// Tasks free-tier users cannot run at all — they are hard-blocked with the
// "pro_feature" gate reason (upgrade/trial pitch), never merely quota-counted.
export const PRO_ONLY_TASKS: ReadonlySet<LlmTask> = new Set(["coursegen_syllabus", "coursegen_module"]);

// Free plan: AI actions/month across all non-pro-only tasks.
export const FREE_MONTHLY_QUOTA = 30;

// Reverse trial granted lazily on a user's first API hit: enough credits for
// roughly one full course plus normal usage.
export const TRIAL_DAYS = 7;
export const TRIAL_CREDITS = 100;

// Stripe grants. pro_monthly $7 -> 500 credits/period (granted on invoice.paid);
// pro_annual ~$60 -> same 500/period, invoiced yearly so the yearly invoice
// grants 12 periods at once; top-ups are one-time packs.
export const SUBSCRIPTION_CREDITS_PER_PERIOD = 500;
export const ANNUAL_SUBSCRIPTION_CREDITS = SUBSCRIPTION_CREDITS_PER_PERIOD * 12;
export const TOPUP_SMALL_CREDITS = 50;
export const TOPUP_LARGE_CREDITS = 250; // topup_250, $5

// E3: global monthly cap (USD) on paid-model spend attributable to free/trial
// users. When exceeded, non-pro calls are routed to the free provider pool and
// fail soft instead of burning more paid-model budget.
export function freeTierPaidSpendCapUsd(): number {
  const raw = Number(process.env.FREE_TIER_PAID_SPEND_CAP_USD);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10;
}

// Kill switch: force-route every LLM call to the cheapest (free) provider pool
// regardless of plan. Routing only — gating/charging is unaffected.
export function llmForceFreePool(): boolean {
  return process.env.LLM_FORCE_FREE_POOL === "1";
}
