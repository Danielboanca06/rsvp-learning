// Shared test-DB helper: each test file gets its own isolated Postgres schema
// within the same Neon database (not a separate database/instance — Neon's
// free tier is schema-per-branch, and this keeps tests infra-free). Schema is
// dropped in teardown so nothing accumulates across runs.
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

function withSchema(rawUrl: string, schema: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

export async function setupTestDb(): Promise<{ db: PrismaClient; teardown: () => Promise<void> }> {
  const baseUrl = process.env.DATABASE_URL;
  const baseDirectUrl = process.env.DATABASE_URL_UNPOOLED ?? baseUrl;
  if (!baseUrl) {
    throw new Error("DATABASE_URL must be set (pointing at the Neon dev database) to run these tests.");
  }

  const schema = `test_${randomUUID().replace(/-/g, "")}`;
  const testUrl = withSchema(baseUrl, schema);
  const testDirectUrl = withSchema(baseDirectUrl!, schema);

  execSync("npx prisma db push --skip-generate --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: testUrl, DATABASE_URL_UNPOOLED: testDirectUrl },
    stdio: "pipe",
  });

  const db = new PrismaClient({ datasources: { db: { url: testUrl } } });

  return {
    db,
    teardown: async () => {
      await db.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.$disconnect();
    },
  };
}
