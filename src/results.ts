import type { Verdict } from "./types";
export function verdict(actual: string | null, guess: string | null): Verdict {
  if (!guess) return "NOT_SUBMITTED";
  if (!actual) throw new Error("정답 데이터 누락");
  return actual === guess ? "CORRECT" : "INCORRECT";
}
export function accuracy(correct: number, submitted: number): number | null {
  return submitted ? Math.round((correct / submitted) * 1000) / 10 : null;
}
