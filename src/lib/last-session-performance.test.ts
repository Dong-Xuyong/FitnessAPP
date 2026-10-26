import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildLastPerfByExercise,
  buildPlanExerciseLastPerformance,
  lastPerfLookupForPlanExercises,
  normalizeExerciseKey,
  prefillUntouchedSetLogs,
} from "./last-session-performance";

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

  it("keeps the first logged set and skips a blank leading set", () => {
    const perf = buildLastPerfByExercise({
      exercises: [
        {
          exerciseName: "Remada",
          sets: [
            { weight: 40, reps: 6 },
            { weight: 45, reps: 4 },
          ],
        },
        {
          exerciseName: "Supino",
          sets: [
            { weight: 0, reps: 0, completed: false },
            { weight: 30, reps: 8 },
          ],
        },
      ],
    });
    assert.deepEqual(perf[normalizeExerciseKey("Remada")], { weight: 40, reps: 6 });
    assert.deepEqual(perf[normalizeExerciseKey("Supino")], { weight: 30, reps: 8 });
  });

  it("reads legacy weight and reps when sets is not an array", () => {
    const perf = buildLastPerfByExercise({
      exercises: [{ name: "DB Bench", sets: 3, weight: "12,5", reps: "12" }],
    });
    assert.deepEqual(perf[normalizeExerciseKey("DB Bench")], { weight: 12.5, reps: 12 });
  });
});

describe("prefillUntouchedSetLogs", () => {
  const plan = [
    { exerciseName: "Lat pulldown reverse grip" },
    { exerciseName: "Remada horizontal mãos em pronação" },
    { exerciseName: "Incline machine" },
    { name: "DB bench" },
    { exerciseName: "New move" },
  ];

  const sessions = [
    {
      workoutPlanId: "plan-a",
      completedAt: "2026-03-01T00:00:00.000Z",
      exercises: [
        { exerciseName: "Lat pulldown reverse grip", sets: [{ weight: 40, reps: 6 }] },
        {
          exerciseName: "remada horizontal maos em pronacao",
          sets: [{ weight: 35, reps: 10 }],
        },
        { exerciseName: "Incline machine", sets: [{ weight: 30, reps: 8 }] },
      ],
    },
    {
      workoutPlanId: "plan-b",
      completedAt: "2026-04-01T00:00:00.000Z",
      exercises: [
        { exerciseName: "DB bench", sets: [{ weight: 12.5, reps: 12 }] },
        { exerciseName: "Remada horizontal mãos em pronação", sets: [{ weight: 50, reps: 6 }] },
      ],
    },
    {
      source: "coach_body_metric",
      completedAt: "2026-05-01T00:00:00.000Z",
      exercises: [],
    },
  ];

  it("prefills weight and reps from the same última vez source as the plan card", () => {
    const logs = prefillUntouchedSetLogs({}, plan, "plan-a", sessions);
    assert.deepEqual(logs[0], { weight: "40", reps: "6" });
    assert.deepEqual(logs[1], { weight: "35", reps: "10" });
    assert.deepEqual(logs[2], { weight: "30", reps: "8" });
    assert.deepEqual(logs[3], { weight: "12.5", reps: "12" });
    assert.equal(4 in logs, false);

    const lookup = lastPerfLookupForPlanExercises(plan, "plan-a", sessions);
    assert.deepEqual(lookup[normalizeExerciseKey(plan[1].exerciseName!)], { weight: 35, reps: 10 });
  });

  it("uses this plan's latest log, then a newer session of the same plan replaces it", () => {
    const remada = [{ exerciseName: "Remada horizontal mãos em pronação" }];
    const first = prefillUntouchedSetLogs({}, remada, "plan-a", sessions);
    assert.deepEqual(first[0], { weight: "35", reps: "10" });

    const afterNext = prefillUntouchedSetLogs({}, remada, "plan-a", [
      ...sessions,
      {
        workoutPlanId: "plan-a",
        completedAt: "2026-06-01T00:00:00.000Z",
        exercises: [{ exerciseName: "Remada horizontal mãos em pronação", sets: [{ weight: 37.5, reps: 8 }] }],
      },
    ]);
    assert.deepEqual(afterNext[0], { weight: "37.5", reps: "8" });
  });

  it("does not overwrite a draft the athlete already touched, including a cleared one", () => {
    const logs = prefillUntouchedSetLogs(
      { 0: { weight: "", reps: "" }, 1: { weight: "32.5", reps: "9" } },
      plan,
      "plan-a",
      sessions
    );
    assert.deepEqual(logs[0], { weight: "", reps: "" });
    assert.deepEqual(logs[1], { weight: "32.5", reps: "9" });
    assert.deepEqual(logs[2], { weight: "30", reps: "8" });
  });

  it("leaves bodyweight reps filled and weight blank", () => {
    const logs = prefillUntouchedSetLogs(
      {},
      [{ exerciseName: "Pull-up" }],
      "plan-a",
      [
        {
          workoutPlanId: "plan-a",
          completedAt: "2026-03-01T00:00:00.000Z",
          exercises: [{ exerciseName: "Pull-up", sets: [{ weight: 0, reps: 8 }] }],
        },
      ]
    );
    assert.deepEqual(logs[0], { weight: "", reps: "8" });
  });
});
