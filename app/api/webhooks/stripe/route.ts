import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe, CHECKOUT_PRODUCTS } from "@/lib/stripe";
import { grantCredits } from "@/lib/billing";

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const creditsGranted = Number(session.metadata?.creditsGranted ?? 0);
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;

      if (userId && creditsGranted > 0) {
        await grantCredits(
          userId,
          creditsGranted,
          session.mode === "subscription" ? "stripe_subscription_grant" : "stripe_topup",
          event.id
        );
      }

      if (userId && session.mode === "subscription" && typeof session.subscription === "string") {
        await prisma.userPlan.upsert({
          where: { userId },
          create: { userId, plan: "pro", stripeCustomerId: customerId, stripeSubscriptionId: session.subscription },
          update: { plan: "pro", stripeSubscriptionId: session.subscription },
        });
      }
      break;
    }

    // Recurring monthly grant on renewal — skipped for the invoice that fires the
    // subscription's *first* cycle, since checkout.session.completed already
    // granted that period's credits.
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      if (invoice.billing_reason === "subscription_cycle") {
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        const userPlan = customerId ? await prisma.userPlan.findFirst({ where: { stripeCustomerId: customerId } }) : null;
        if (userPlan) {
          await grantCredits(
            userPlan.userId,
            CHECKOUT_PRODUCTS.subscription.creditsGranted,
            "stripe_subscription_grant",
            event.id
          );
        }
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await prisma.userPlan.updateMany({
        where: { stripeSubscriptionId: subscription.id },
        data: { plan: "free" },
      });
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
