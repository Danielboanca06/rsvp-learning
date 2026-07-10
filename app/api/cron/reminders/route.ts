// Daily reminder cron (vercel.json schedules it; Vercel calls with
// Authorization: Bearer CRON_SECRET). Two jobs in one pass:
// 1. FSRS review reminders — one summary email per user with due chunks.
// 2. Trial-day-6 email — users whose trial ends within the next 24h. The cron
//    runs once a day and the window is exactly one day wide, so each user gets
//    this at most once, no dedupe column needed.
import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { reviewReminderHtml, sendEmail, trialEndingHtml } from "@/lib/email";

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

  return NextResponse.json({ reviewEmails, trialEmails });
}
