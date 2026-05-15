import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { findSequenceAppendContext } from "./workout-plan-sequence";

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
