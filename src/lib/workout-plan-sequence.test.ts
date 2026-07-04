import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompletedWorkoutPlanIds,
  findSequenceAppendContext,
  isSequenceStepEffectiveUnlocked,
} from "./workout-plan-sequence";

describe("buildCompletedWorkoutPlanIds", () => {
  it("includes completed plan docs and logged sessions", () => {
    const completed = buildCompletedWorkoutPlanIds(
      [
        { id: "a", status: "completed" },
        { id: "b", completedAt: "2026-01-01T00:00:00.000Z" },
        { id: "c" },
      ],
      [{ workoutPlanId: "d", completedAt: "2026-01-02T00:00:00.000Z" }]
    );
    assert.deepEqual([...completed].sort(), ["a", "b", "d"]);
  });
});

describe("isSequenceStepEffectiveUnlocked", () => {
  it("unlocks when prior step is completed even if studentUnlocked is false", () => {
    const plan = {
      id: "step-b",
      sequenceGroupId: "grp",
      studentUnlocked: false,
      sequenceUnlockAfterPlanId: "step-a",
    };
    assert.equal(isSequenceStepEffectiveUnlocked(plan, new Set(["step-a"])), true);
    assert.equal(isSequenceStepEffectiveUnlocked(plan, new Set()), false);
  });
});

describe("findSequenceAppendContext", () => {
  it("returns null when no sequence plans exist", () => {
    assert.equal(findSequenceAppendContext([], 2), null);
    assert.equal(findSequenceAppendContext([{ id: "p1" }], 2), null);
  });

  it("returns append context for an existing chain", () => {
    const group = "grp-1";
    const plans = [
      { id: "a", sequenceGroupId: group, sequenceStepIndex: 0 },
      { id: "b", sequenceGroupId: group, sequenceStepIndex: 1 },
      { id: "c", sequenceGroupId: group, sequenceStepIndex: 2 },
      { id: "d", sequenceGroupId: group, sequenceStepIndex: 3 },
    ];
    const ctx = findSequenceAppendContext(plans, 2);
    assert.ok(ctx);
    assert.equal(ctx.sequenceGroupId, group);
    assert.equal(ctx.tailPlanId, "d");
    assert.equal(ctx.nextStepIndex, 4);
    assert.equal(ctx.existingCycles, 2);
    assert.equal(ctx.tailCompleted, false);
  });

  it("marks tail completed when prior step is done", () => {
    const group = "grp-2";
    const ctx = findSequenceAppendContext(
      [
        {
          id: "done",
          sequenceGroupId: group,
          sequenceStepIndex: 0,
          status: "completed",
        },
      ],
      1
    );
    assert.ok(ctx);
    assert.equal(ctx.tailPlanId, "done");
    assert.equal(ctx.tailCompleted, true);
    assert.equal(ctx.nextStepIndex, 1);
    assert.equal(ctx.existingCycles, 1);
  });

  it("picks the group with the highest tail step index", () => {
    const ctx = findSequenceAppendContext(
      [
        { id: "old", sequenceGroupId: "g-old", sequenceStepIndex: 0 },
        { id: "new", sequenceGroupId: "g-new", sequenceStepIndex: 5 },
      ],
      2
    );
    assert.ok(ctx);
    assert.equal(ctx.sequenceGroupId, "g-new");
    assert.equal(ctx.tailPlanId, "new");
    assert.equal(ctx.nextStepIndex, 6);
  });
});
