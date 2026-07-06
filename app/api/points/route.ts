import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getTotalPoints } from "@/lib/points";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const total = await getTotalPoints(userId);
  return NextResponse.json({ total });
}
