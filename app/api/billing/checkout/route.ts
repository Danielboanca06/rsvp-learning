import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { stripe, CHECKOUT_PRODUCTS } from "@/lib/stripe";
import { createCheckoutSchema } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = createCheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid checkout kind is required." }, { status: 400 });
  }

  const product = CHECKOUT_PRODUCTS[parsed.data.kind];
  const priceId = process.env[product.priceEnvVar];
  if (!priceId) {
    return NextResponse.json({ error: "Billing is not configured yet." }, { status: 503 });
  }

  const userPlan = await prisma.userPlan.findUnique({ where: { userId } });
  let stripeCustomerId = userPlan?.stripeCustomerId ?? null;

  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({ metadata: { userId } });
    stripeCustomerId = customer.id;
    await prisma.userPlan.upsert({
      where: { userId },
      create: { userId, stripeCustomerId },
      update: { stripeCustomerId },
    });
  }

  const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    mode: product.mode,
    customer: stripeCustomerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/billing?checkout=success`,
    cancel_url: `${origin}/billing?checkout=cancelled`,
    metadata: { userId, kind: parsed.data.kind, creditsGranted: String(product.creditsGranted) },
  });

  return NextResponse.json({ url: session.url });
}
