-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startingWpm" INTEGER NOT NULL DEFAULT 250,
    "spaceId" TEXT NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Space" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "stability" DOUBLE PRECISION,
    "difficulty" DOUBLE PRECISION,
    "dueAt" TIMESTAMP(3),
    "lastReviewedAt" TIMESTAMP(3),
    "reviewState" TEXT NOT NULL DEFAULT 'new',
    "reps" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "quizWrongCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'study',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "currentWpm" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "hint" TEXT NOT NULL,
    "socraticQuestion" TEXT,
    "wpmAtAttempt" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VocabularyWord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "documentId" TEXT,
    "chunkId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastRecalledAt" TIMESTAMP(3),
    "recallCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VocabularyWord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quiz" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "documentId" TEXT,
    "spaceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalQuestions" INTEGER NOT NULL,
    "score" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Quiz_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizItem" (
    "id" TEXT NOT NULL,
    "quizId" TEXT NOT NULL,
    "quizQuestionId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "selectedIndex" INTEGER,
    "correct" BOOLEAN,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "QuizItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizQuestion" (
    "id" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPlan" (
    "userId" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPlan_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "FreeQuotaCounter" (
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "FreeQuotaCounter_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "UserCredits" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UserCredits_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deltaCredits" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "realCostUsd" DOUBLE PRECISION,
    "stripeEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "servedModel" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "realCostUsd" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_userId_idx" ON "Document"("userId");

-- CreateIndex
CREATE INDEX "Document_spaceId_idx" ON "Document"("spaceId");

-- CreateIndex
CREATE INDEX "Space_userId_isDefault_idx" ON "Space"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "Space_createdAt_idx" ON "Space"("createdAt");

-- CreateIndex
CREATE INDEX "Chunk_documentId_order_idx" ON "Chunk"("documentId", "order");

-- CreateIndex
CREATE INDEX "Chunk_dueAt_idx" ON "Chunk"("dueAt");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_documentId_idx" ON "Session"("documentId");

-- CreateIndex
CREATE INDEX "Attempt_sessionId_idx" ON "Attempt"("sessionId");

-- CreateIndex
CREATE INDEX "Attempt_chunkId_idx" ON "Attempt"("chunkId");

-- CreateIndex
CREATE INDEX "PointsEvent_userId_idx" ON "PointsEvent"("userId");

-- CreateIndex
CREATE INDEX "PointsEvent_userId_createdAt_idx" ON "PointsEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PointsEvent_createdAt_idx" ON "PointsEvent"("createdAt");

-- CreateIndex
CREATE INDEX "VocabularyWord_userId_idx" ON "VocabularyWord"("userId");

-- CreateIndex
CREATE INDEX "VocabularyWord_createdAt_idx" ON "VocabularyWord"("createdAt");

-- CreateIndex
CREATE INDEX "VocabularyWord_lastRecalledAt_idx" ON "VocabularyWord"("lastRecalledAt");

-- CreateIndex
CREATE UNIQUE INDEX "VocabularyWord_userId_word_key" ON "VocabularyWord"("userId", "word");

-- CreateIndex
CREATE INDEX "Quiz_userId_idx" ON "Quiz"("userId");

-- CreateIndex
CREATE INDEX "Quiz_documentId_idx" ON "Quiz"("documentId");

-- CreateIndex
CREATE INDEX "Quiz_kind_createdAt_idx" ON "Quiz"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "Quiz_spaceId_kind_status_idx" ON "Quiz"("spaceId", "kind", "status");

-- CreateIndex
CREATE INDEX "QuizItem_quizId_idx" ON "QuizItem"("quizId");

-- CreateIndex
CREATE INDEX "QuizQuestion_chunkId_idx" ON "QuizQuestion"("chunkId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlan_stripeCustomerId_key" ON "UserPlan"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPlan_stripeSubscriptionId_key" ON "UserPlan"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "UserPlan_plan_idx" ON "UserPlan"("plan");

-- CreateIndex
CREATE INDEX "FreeQuotaCounter_periodStart_idx" ON "FreeQuotaCounter"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_stripeEventId_key" ON "CreditLedger"("stripeEventId");

-- CreateIndex
CREATE INDEX "CreditLedger_userId_createdAt_idx" ON "CreditLedger"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmUsageEvent_userId_createdAt_idx" ON "LlmUsageEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmUsageEvent_task_createdAt_idx" ON "LlmUsageEvent"("task", "createdAt");

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quiz" ADD CONSTRAINT "Quiz_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizItem" ADD CONSTRAINT "QuizItem_quizId_fkey" FOREIGN KEY ("quizId") REFERENCES "Quiz"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizItem" ADD CONSTRAINT "QuizItem_quizQuestionId_fkey" FOREIGN KEY ("quizQuestionId") REFERENCES "QuizQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "Chunk"("id") ON DELETE CASCADE ON UPDATE CASCADE;
