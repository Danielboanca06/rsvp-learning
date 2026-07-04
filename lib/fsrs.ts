import { fsrs, generatorParameters, createEmptyCard, Rating, State, type Card, type Grade } from "ts-fsrs";

// Short-term (minute-scale) relearning steps are disabled: this app already has its own
// immediate retry loop (fail -> reread -> resummarize) before a chunk is considered "learned".
// FSRS here only answers "when should this resurface days/weeks from now for retention".
const scheduler = fsrs(
  generatorParameters({
    enable_fuzz: true,
    enable_short_term: false,
    request_retention: 0.9,
  })
);

const STATE_TO_FSRS: Record<string, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

const FSRS_TO_STATE: Record<State, string> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

export type ChunkMemoryState = {
  stability: number | null;
  difficulty: number | null;
  dueAt: Date | null;
  lastReviewedAt: Date | null;
  reviewState: string;
  reps: number;
  lapses: number;
};

export function scoreToGrade(score: number): Grade {
  if (score < 50) return Rating.Again;
  if (score < 80) return Rating.Hard;
  if (score < 95) return Rating.Good;
  return Rating.Easy;
}

function toCard(chunk: ChunkMemoryState, now: Date): Card {
  if (chunk.reviewState === "new" || chunk.stability === null || chunk.difficulty === null) {
    return createEmptyCard(now);
  }

  return {
    due: chunk.dueAt ?? now,
    stability: chunk.stability,
    difficulty: chunk.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: chunk.reps,
    lapses: chunk.lapses,
    state: STATE_TO_FSRS[chunk.reviewState] ?? State.New,
    last_review: chunk.lastReviewedAt ?? undefined,
  };
}

export function scheduleNextReview(chunk: ChunkMemoryState, score: number, now: Date = new Date()): ChunkMemoryState {
  const card = toCard(chunk, now);
  const grade = scoreToGrade(score);
  const { card: updated } = scheduler.next(card, now, grade);

  return {
    stability: updated.stability,
    difficulty: updated.difficulty,
    dueAt: updated.due,
    lastReviewedAt: now,
    reviewState: FSRS_TO_STATE[updated.state],
    reps: updated.reps,
    lapses: updated.lapses,
  };
}
