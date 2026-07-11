import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

// Constructed even without a key so the module can be imported at build time;
// any real call will fail loudly (invalid key) rather than at import time,
// which is what we want until Stripe is actually configured.
export const stripe = new Stripe(secretKey || "sk_test_not_configured");

import {
  ANNUAL_SUBSCRIPTION_CREDITS,
  SUBSCRIPTION_CREDITS_PER_PERIOD,
  TOPUP_LARGE_CREDITS,
  TOPUP_SMALL_CREDITS,
} from "@/lib/pricing";

export type CheckoutKind = "subscription" | "subscription_annual" | "topup_small" | "topup_large";

export const CHECKOUT_PRODUCTS: Record<
  CheckoutKind,
  { mode: "subscription" | "payment"; priceEnvVar: string; creditsGranted: number }
> = {
  // Recurring allotment on the Pro plan ($7/mo). The annual plan (~$60/yr)
  // invoices yearly, so each invoice grants 12 periods of credits at once.
  subscription: {
    mode: "subscription",
    priceEnvVar: "STRIPE_PRICE_PRO_MONTHLY",
    creditsGranted: SUBSCRIPTION_CREDITS_PER_PERIOD,
  },
  subscription_annual: {
    mode: "subscription",
    priceEnvVar: "STRIPE_PRICE_PRO_ANNUAL",
    creditsGranted: ANNUAL_SUBSCRIPTION_CREDITS,
  },
  // One-time top-up packs for when a Pro user runs out before their next cycle.
  topup_small: { mode: "payment", priceEnvVar: "STRIPE_PRICE_TOPUP_SMALL", creditsGranted: TOPUP_SMALL_CREDITS },
  topup_large: { mode: "payment", priceEnvVar: "STRIPE_PRICE_TOPUP_LARGE", creditsGranted: TOPUP_LARGE_CREDITS },
};
