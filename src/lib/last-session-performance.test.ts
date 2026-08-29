import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildPlanExerciseLastPerformance, normalizeExerciseKey } from "./last-session-performance";

describe("buildPlanExerciseLastPerformance", () => {
  it("matches exercise names regardless of spacing, punctuation, or accents", () => {
    assert.equal(normalizeExerciseKey("Lat Pull Down"), normalizeExerciseKey("lat pulldown"));
    assert.equal(normalizeExerciseKey("Tríceps Francês"), normalizeExerciseKey("triceps-frances"));
  });

  it("prefers the latest session for this plan, then falls back to exercise name", () => {
    const items = buildPlanExerciseLastPerformance(
      [{ exerciseName: "Leg Press" }, { exerciseName: "Squat" }],
      "plan-b",
      [
        {
          workoutPlanId: "plan-a",
          completedAt: "2026-01-01T00:00:00.000Z",
          exercises: [
            {
              exerciseName: "Squat",
              sets: [{ weight: 80, reps: 8 }],
            },
          ],
        },
        {
          workoutPlanId: "plan-b",
          completedAt: "2026-02-01T00:00:00.000Z",
          exercises: [
            {
              exerciseName: "Leg Press",
              sets: [{ weight: 120, reps: 10 }],
            },
          ],
        },
      ]
    );

    assert.equal(items.length, 2);
    assert.equal(items[0]?.name, "Leg Press");
    assert.deepEqual(items[0]?.perf, { weight: 120, reps: 10 });
    assert.equal(items[1]?.name, "Squat");
    assert.deepEqual(items[1]?.perf, { weight: 80, reps: 8 });
  });
});
