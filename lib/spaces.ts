import { prisma } from "@/lib/prisma";

export class SpaceNotFoundError extends Error {}

export async function ensureGeneralSpace(userId: string) {
  const existing = await prisma.space.findFirst({ where: { userId, isDefault: true } });
  if (existing) return existing;

  return prisma.space.create({ data: { userId, name: "General", isDefault: true } });
}

export async function resolveSpaceId(userId: string, rawSpaceId: string | null | undefined): Promise<string> {
  if (!rawSpaceId) {
    const space = await ensureGeneralSpace(userId);
    return space.id;
  }

  const space = await prisma.space.findFirst({ where: { id: rawSpaceId, userId } });
  if (!space) {
    throw new SpaceNotFoundError(`Space ${rawSpaceId} does not exist`);
  }
  return space.id;
}
