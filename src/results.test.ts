import { test, expect } from "vitest";
import { verdict, accuracy } from "./results";
test("미제출은 오답이 아니며 정답은 챙겨준 사람과 비교한다", () => {
  expect(verdict("giver", "giver")).toBe("CORRECT");
  expect(verdict("giver", "target")).toBe("INCORRECT");
  expect(verdict("giver", null)).toBe("NOT_SUBMITTED");
  expect(() => verdict(null, "someone")).toThrow();
});
test("정답률의 분모는 제출 수이고 0명은 null", () => {
  expect(accuracy(1, 3)).toBe(33.3);
  expect(accuracy(0, 0)).toBeNull();
});
