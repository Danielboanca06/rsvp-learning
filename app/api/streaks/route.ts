import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getStreaks } from "@/lib/streaks";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const streaks = await getStreaks(userId);
  return NextResponse.json(streaks);
}
