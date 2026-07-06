import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { computeAnalytics } from "@/lib/analytics";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(await computeAnalytics(userId));
}
