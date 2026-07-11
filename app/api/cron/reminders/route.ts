// Daily reminder cron (vercel.json schedules it; Vercel calls with
// Authorization: Bearer CRON_SECRET). Two jobs in one pass:
// 1. FSRS review reminders — one summary email per user with due chunks.
// 2. Trial-day-6 email — users whose trial ends within the next 24h. The cron
//    runs once a day and the window is exactly one day wide, so each user gets
//    this at most once, no dedupe column needed.
// 3. COGS alert (Mondays) — emails the founder when any user's monthly LLM
//    spend exceeds $2 or free/trial paid-model spend exceeds its cap.
import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { reviewReminderHtml, sendEmail, trialEndingHtml } from "@/lib/email";
import { nonProPaidSpendThisMonthUsd } from "@/lib/llm-quota";
import { freeTierPaidSpendCapUsd } from "@/lib/pricing";

const PER_USER_MONTHLY_SPEND_ALERT_USD = 2;

const REVIEW_RESEND_COOLDOWN_MS = 20 * 60 * 60 * 1000; // one email per ~day, cron-jitter tolerant

async function primaryEmail(userId: string): Promise<string | null> {
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return (
      user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId)?.emailAddress ??
      user.emailAddresses[0]?.emailAddress ??
      null
    );
  } catch {
    return null;
  }
}

async function remindersEnabled(userId: string): Promise<boolean> {
  const preference = await prisma.emailPreference.findUnique({ where: { userId } });
  return preference?.enabled ?? true; // opted in by default, one-click out
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let reviewEmails = 0;
  let trialEmails = 0;

  // --- Review reminders ---
  const usersWithDue = await prisma.document.findMany({
    where: { chunks: { some: { dueAt: { lte: now } } } },
    select: { userId: true },
    distinct: ["userId"],
  });

  for (const { userId } of usersWithDue) {
    try {
      if (!(await remindersEnabled(userId))) continue;

      const preference = await prisma.emailPreference.findUnique({ where: { userId } });
      if (preference?.lastSentAt && now.getTime() - preference.lastSentAt.getTime() < REVIEW_RESEND_COOLDOWN_MS) {
        continue;
      }

      const dueCount = await prisma.chunk.count({ where: { dueAt: { lte: now }, document: { userId } } });
      const email = await primaryEmail(userId);
      if (!email || dueCount === 0) continue;

      const sent = await sendEmail({
        to: email,
        subject: `${dueCount} module${dueCount === 1 ? "" : "s"} due for review`,
        html: reviewReminderHtml(dueCount, userId),
      });
      if (sent) {
        reviewEmails += 1;
        await prisma.emailPreference.upsert({
          where: { userId },
          create: { userId, enabled: true, lastSentAt: now },
          update: { lastSentAt: now },
        });
      }
    } catch (error) {
      console.error(`Review reminder failed for ${userId}:`, error);
    }
  }

  // --- Trial-day-6 emails ---
  const endingTrials = await prisma.userPlan.findMany({
    where: {
      plan: "trial",
      trialEndsAt: { gt: now, lte: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
    },
    select: { userId: true },
  });

  for (const { userId } of endingTrials) {
    try {
      if (!(await remindersEnabled(userId))) continue;
      const email = await primaryEmail(userId);
      if (!email) continue;

      const sent = await sendEmail({
        to: email,
        subject: "Your Active Recall trial ends tomorrow",
        html: trialEndingHtml(userId),
      });
      if (sent) trialEmails += 1;
    } catch (error) {
      console.error(`Trial reminder failed for ${userId}:`, error);
    }
  }

  // --- COGS monitoring (weekly, on Mondays) ---
  let cogsAlerted = false;
  const founderEmail = process.env.FOUNDER_ALERT_EMAIL;
  if (founderEmail && now.getUTCDay() === 1) {
    try {
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const [perUser, nonProSpend] = await Promise.all([
        prisma.llmUsageEvent.groupBy({
          by: ["userId"],
          _sum: { realCostUsd: true },
          where: { createdAt: { gte: periodStart } },
        }),
        nonProPaidSpendThisMonthUsd(),
      ]);

      const heavyUsers = perUser.filter((row) => (row._sum.realCostUsd ?? 0) > PER_USER_MONTHLY_SPEND_ALERT_USD);
      const capBreached = nonProSpend > freeTierPaidSpendCapUsd();

      if (heavyUsers.length > 0 || capBreached) {
        const lines = [
          ...(capBreached
            ? [`<p>Free/trial paid-model spend this month: $${nonProSpend.toFixed(2)} (cap $${freeTierPaidSpendCapUsd()}).</p>`]
            : []),
          ...heavyUsers.map(
            (row) => `<p>User ${row.userId}: $${(row._sum.realCostUsd ?? 0).toFixed(2)} this month.</p>`
          ),
        ];
        cogsAlerted = await sendEmail({
          to: founderEmail,
          subject: "Active Recall COGS alert",
          html: `<div style="font-family: sans-serif;">${lines.join("")}</div>`,
        });
      }
    } catch (error) {
      console.error("COGS check failed:", error);
    }
  }

  return NextResponse.json({ reviewEmails, trialEmails, cogsAlerted });
}
