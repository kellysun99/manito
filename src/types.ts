export type Phase = "ACTIVITY" | "GUESS" | "REVEALED";
export type User = {
  id: string;
  name: string;
  isAdmin: boolean;
  isParticipant: boolean;
};
export type Entry = {
  userId: string;
  targetId: string | null;
  activityText: string | null;
  guessedGiverId: string | null;
  guessReason: string | null;
  targetUpdatedAt: string | null;
  activityUpdatedAt: string | null;
  guessUpdatedAt: string | null;
};
export type Verdict = "CORRECT" | "INCORRECT" | "NOT_SUBMITTED";
export type Result = {
  userId: string;
  name: string;
  actualGiverId: string | null;
  actualGiverName: string | null;
  guessedGiverName: string | null;
  guessReason: string | null;
  verdict: Verdict;
  receivedActivity: string | null;
  targetName: string | null;
  activityText: string | null;
};
export type Summary = {
  total: number;
  targets: number;
  activities: number;
  guesses: number;
  correct: number;
  incorrect: number;
  missing: number;
  accuracy: number | null;
};
export type Screen = {
  phase: Phase;
  updatedAt: string;
  me: User;
  myEntry: Entry | null;
  candidates: User[];
  adminData: (User & { entry: Entry | null })[] | null;
  results: Result[] | null;
  summary: Summary | null;
};
