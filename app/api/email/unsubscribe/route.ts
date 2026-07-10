// One-click unsubscribe target linked from every reminder email. Signed with
// an HMAC of the userId so the link works without a session but can't be
// forged to unsubscribe someone else.
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyUnsubscribeToken } from "@/lib/email";

function htmlResponse(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><body style="font-family: sans-serif; max-width: 480px; margin: 80px auto; text-align: center;">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("u");
  const token = request.nextUrl.searchParams.get("t");

  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return htmlResponse("<h2>Invalid unsubscribe link</h2><p>This link is malformed or expired.</p>", 400);
  }

  await prisma.emailPreference.upsert({
    where: { userId },
    create: { userId, enabled: false },
    update: { enabled: false },
  });

  return htmlResponse(
    "<h2>You're unsubscribed</h2><p>You won't receive review reminder emails anymore. You can re-enable them any time from your billing page.</p>"
  );
}
