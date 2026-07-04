-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Chunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "stability" REAL,
    "difficulty" REAL,
    "dueAt" DATETIME,
    "lastReviewedAt" DATETIME,
    "reviewState" TEXT NOT NULL DEFAULT 'new',
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Chunk" ("content", "documentId", "id", "order", "title", "wordCount") SELECT "content", "documentId", "id", "order", "title", "wordCount" FROM "Chunk";
DROP TABLE "Chunk";
ALTER TABLE "new_Chunk" RENAME TO "Chunk";
CREATE INDEX "Chunk_documentId_order_idx" ON "Chunk"("documentId", "order");
CREATE INDEX "Chunk_dueAt_idx" ON "Chunk"("dueAt");
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'study',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "currentWpm" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    CONSTRAINT "Session_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("completedAt", "currentWpm", "documentId", "id", "startedAt", "status") SELECT "completedAt", "currentWpm", "documentId", "id", "startedAt", "status" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE INDEX "Session_documentId_idx" ON "Session"("documentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
