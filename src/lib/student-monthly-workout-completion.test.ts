import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countCompletedWorkoutSessionsInMonth,
  parseSessionCompletedAtMs,
} from "./student-monthly-workout-completion";

describe("countCompletedWorkoutSessionsInMonth", () => {
  it("counts sessions with completedAt in the reference month", () => {
    const ref = new Date("2026-05-15T12:00:00");
    const n = countCompletedWorkoutSessionsInMonth(
      [
        { data: { completedAt: "2026-05-10T10:00:00.000Z" } },
        { data: { completedAt: "2026-04-28T10:00:00.000Z" } },
        { data: { date: "2026-05-12" } },
      ],
      ref
    );
    assert.equal(n, 1);
  });

  it("parseSessionCompletedAtMs accepts ISO strings", () => {
    assert.equal(
      parseSessionCompletedAtMs("2026-05-10T10:00:00.000Z"),
      Date.parse("2026-05-10T10:00:00.000Z")
    );
  });
});
