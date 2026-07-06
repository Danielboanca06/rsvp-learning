import Stripe from "stripe";

const secretKey = process.env.STRIPE_SECRET_KEY;

// Constructed even without a key so the module can be imported at build time;
// any real call will fail loudly (invalid key) rather than at import time,
// which is what we want until Stripe is actually configured.
export const stripe = new Stripe(secretKey || "sk_test_not_configured");

export type CheckoutKind = "subscription" | "topup_small" | "topup_large";

export const CHECKOUT_PRODUCTS: Record<
  CheckoutKind,
  { mode: "subscription" | "payment"; priceEnvVar: string; creditsGranted: number }
> = {
  // Recurring monthly allotment on the Pro plan.
  subscription: { mode: "subscription", priceEnvVar: "STRIPE_PRICE_PRO_MONTHLY", creditsGranted: 200 },
  // One-time top-up packs for when a Pro user runs out before their next cycle.
  topup_small: { mode: "payment", priceEnvVar: "STRIPE_PRICE_TOPUP_SMALL", creditsGranted: 50 },
  topup_large: { mode: "payment", priceEnvVar: "STRIPE_PRICE_TOPUP_LARGE", creditsGranted: 250 },
};
