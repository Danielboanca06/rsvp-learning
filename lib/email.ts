// Thin Resend client (plain HTTPS — no SDK dependency for one endpoint) plus
// the signed unsubscribe-token helpers shared by the cron sender and the
// unsubscribe route. Without RESEND_API_KEY every send is a logged no-op, so
// local dev and preview deployments never email anyone.
import { createHmac, timingSafeEqual } from "node:crypto";

const EMAIL_FROM = process.env.EMAIL_FROM ?? "Active Recall <reminders@notifications.activerecall.app>";
const APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3000";

function unsubscribeSecret(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET ?? process.env.CRON_SECRET ?? null;
}

export function unsubscribeToken(userId: string): string {
  const secret = unsubscribeSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(userId).digest("hex");
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = unsubscribeToken(userId);
  if (!expected || !token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
}

export function unsubscribeUrl(userId: string): string {
  return `${APP_BASE_URL}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&t=${unsubscribeToken(userId)}`;
}

export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`Email not sent (RESEND_API_KEY unset): "${params.subject}" to ${params.to}`);
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ from: EMAIL_FROM, to: [params.to], subject: params.subject, html: params.html }),
    });
    return response.ok;
  } catch (error) {
    console.error("Email send failed:", error);
    return false;
  }
}

export function reviewReminderHtml(dueCount: number, userId: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="font-style: italic;">${dueCount} module${dueCount === 1 ? "" : "s"} due for review</h2>
      <p>Spaced repetition only works when the reviews happen — and today ${dueCount === 1 ? "one is" : `${dueCount} are`} due. A few minutes now locks the knowledge in.</p>
      <p><a href="${APP_BASE_URL}/review" style="display: inline-block; padding: 10px 20px; background: #6d5ae6; color: #fff; text-decoration: none; border-radius: 8px;">Start reviewing</a></p>
      <p style="font-size: 12px; color: #888;">Daily summary from Active Recall. <a href="${unsubscribeUrl(userId)}" style="color: #888;">Unsubscribe</a></p>
    </div>`;
}

export function trialEndingHtml(userId: string): string {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2 style="font-style: italic;">Your trial ends tomorrow</h2>
      <p>Everything you've studied stays yours either way. Upgrade to Pro to keep generating course modules and using the AI tutor — the annual plan saves about 30%.</p>
      <p><a href="${APP_BASE_URL}/billing" style="display: inline-block; padding: 10px 20px; background: #6d5ae6; color: #fff; text-decoration: none; border-radius: 8px;">See Pro plans</a></p>
      <p style="font-size: 12px; color: #888;">Sent because your Active Recall trial is ending. <a href="${unsubscribeUrl(userId)}" style="color: #888;">Unsubscribe</a></p>
    </div>`;
}
