import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  blocksCoveringSession,
  effectiveBlockMaxStudents,
  enrolledSlotTimesForSession,
  firstMatchingBlockRule,
  generateSlotTimesByDuration,
  normalizeBlockRules,
  resolveBlockSettings,
  unionClockTimes,
  type BlockRule,
} from "./block-rules";
import {
  consecutiveSlotBlocksFrom,
  generateSlotTimes,
  resolveDaySlotTimes,
  type DaySchedule,
} from "./trainer-availability";

const mondayRule: BlockRule = {
  id: "solo",
  weekdays: ["monday", "wednesday"],
  startTime: "18:00",
  endTime: "20:00",
  durationMin: 60,
  maxStudents: 1,
};

const earlierRule: BlockRule = {
  id: "early",
  weekdays: ["monday"],
  startTime: "18:00",
  endTime: "19:00",
  durationMin: 30,
  maxStudents: 2,
};

const day: DaySchedule = {
  enabled: true,
  ranges: [{ startTime: "17:00", endTime: "21:00" }],
};

describe("normalizeBlockRules", () => {
  it("treats missing and invalid payloads as no rules", () => {
    assert.deepEqual(normalizeBlockRules(undefined), []);
    assert.deepEqual(normalizeBlockRules(null), []);
    assert.deepEqual(normalizeBlockRules({}), []);
    assert.deepEqual(normalizeBlockRules("18:00"), []);
  });

  it("keeps valid rules in order and drops broken rows", () => {
    const rules = normalizeBlockRules([
      null,
      { id: "", weekdays: ["monday"], startTime: "09:00", endTime: "10:00", durationMin: 30, maxStudents: 1 },
      mondayRule,
      { id: "bad-duration", weekdays: ["tuesday"], startTime: "09:00", endTime: "10:00", durationMin: 20, maxStudents: 1 },
      { id: "bad-range", weekdays: ["tuesday"], startTime: "10:00", endTime: "09:00", durationMin: 30, maxStudents: 1 },
      { ...earlierRule, weekdays: [" Monday ", "nope"] },
    ]);
    assert.deepEqual(rules.map((rule) => rule.id), ["solo", "early"]);
    assert.deepEqual(rules[1]?.weekdays, ["monday"]);
  });
});

describe("firstMatchingBlockRule", () => {
  const rules = [earlierRule, mondayRule];

  it("uses the first rule whose weekday and time match", () => {
    assert.equal(firstMatchingBlockRule(rules, "monday", "18:00")?.id, "early");
    assert.equal(firstMatchingBlockRule(rules, "monday", "18:30")?.id, "early");
  });

  it("falls through when the first rule's range has ended", () => {
    assert.equal(firstMatchingBlockRule(rules, "monday", "19:00")?.id, "solo");
    assert.equal(firstMatchingBlockRule(rules, "wednesday", "18:30")?.id, "solo");
  });

  it("treats the end time as outside the range", () => {
    assert.equal(firstMatchingBlockRule([mondayRule], "monday", "20:00"), null);
    assert.equal(firstMatchingBlockRule([mondayRule], "tuesday", "18:00"), null);
    assert.equal(firstMatchingBlockRule([], "monday", "18:00"), null);
  });
});

describe("resolveBlockSettings", () => {
  it("falls back to the current defaults when nothing matches", () => {
    assert.deepEqual(
      resolveBlockSettings({
        rules: [mondayRule],
        weekday: "monday",
        time: "17:30",
        defaultDurationMin: 30,
        defaultMaxStudents: 4,
      }),
      { durationMin: 30, maxStudents: 4, rule: null }
    );
  });

  it("returns the matching rule's duration and capacity", () => {
    const resolved = resolveBlockSettings({
      rules: [mondayRule],
      weekday: "monday",
      time: "18:00",
      defaultDurationMin: 30,
      defaultMaxStudents: 4,
    });
    assert.equal(resolved.durationMin, 60);
    assert.equal(resolved.maxStudents, 1);
    assert.equal(resolved.rule?.id, "solo");
  });
});

describe("effectiveBlockMaxStudents", () => {
  it("keeps a saved slot capacity ahead of the rule", () => {
    assert.equal(effectiveBlockMaxStudents(3, 1), 3);
  });

  it("uses the resolved capacity when the block was never saved", () => {
    assert.equal(effectiveBlockMaxStudents(undefined, 1), 1);
    assert.equal(effectiveBlockMaxStudents(null, 1), 1);
    assert.equal(effectiveBlockMaxStudents(0, 4), 4);
  });
});

describe("resolveDaySlotTimes with block rules", () => {
  it("matches the uniform grid when no rules are stored", () => {
    const without = resolveDaySlotTimes({
      dateStr: "2026-08-31",
      weeklySched: day,
      openBlocks: [],
      slotDurationMin: 30,
    });
    const empty = resolveDaySlotTimes({
      dateStr: "2026-08-31",
      weeklySched: day,
      openBlocks: [],
      slotDurationMin: 30,
      blockRules: [],
    });
    assert.deepEqual(without, generateSlotTimes("17:00", "21:00", 30));
    assert.deepEqual(empty, without);
  });

  it("steps with the first matching rule and keeps the default outside it", () => {
    const times = resolveDaySlotTimes({
      dateStr: "2026-08-31",
      weeklySched: day,
      openBlocks: [],
      slotDurationMin: 30,
      blockRules: [mondayRule],
    });
    assert.deepEqual(times, ["17:00", "17:30", "18:00", "19:00", "20:00", "20:30"]);
  });

  it("ignores rules that do not include that weekday", () => {
    const tuesday = resolveDaySlotTimes({
      dateStr: "2026-09-01",
      weeklySched: day,
      openBlocks: [],
      slotDurationMin: 30,
      blockRules: [mondayRule],
    });
    assert.deepEqual(tuesday, generateSlotTimes("17:00", "21:00", 30));
  });

  it("applies a rule inside an open block on that weekday", () => {
    const times = resolveDaySlotTimes({
      dateStr: "2026-08-31",
      weeklySched: { enabled: false, ranges: [] },
      openBlocks: [{ id: "open", date: "2026-08-31", startTime: "18:00", endTime: "20:00" }],
      slotDurationMin: 30,
      blockRules: [mondayRule],
    });
    assert.deepEqual(times, ["18:00", "19:00"]);
  });
});

describe("blocksCoveringSession", () => {
  it("matches uniform consecutive blocks when every step is the default", () => {
    const slotTimes = ["09:00", "09:15", "09:30", "10:00"];
    const uniform = (time: string) => {
      assert.ok(time);
      return 30;
    };
    const covered = blocksCoveringSession({
      slotTimes,
      startTime: "09:00",
      sessionDurationMin: 60,
      durationAt: uniform,
    });
    assert.deepEqual(covered, consecutiveSlotBlocksFrom(slotTimes, "09:00", 2, 30));
  });

  it("covers a 60 min session with the single matching block", () => {
    const covered = blocksCoveringSession({
      slotTimes: ["18:00", "19:00"],
      startTime: "18:00",
      sessionDurationMin: 60,
      durationAt: () => 60,
    });
    assert.deepEqual(covered, ["18:00"]);
  });

  it("refuses a chain that leaves the grid", () => {
    const covered = blocksCoveringSession({
      slotTimes: ["18:00"],
      startTime: "18:00",
      sessionDurationMin: 90,
      durationAt: () => 60,
    });
    assert.deepEqual(covered, []);
  });
});

describe("generateSlotTimesByDuration", () => {
  it("matches generateSlotTimes when the step never changes", () => {
    assert.deepEqual(
      generateSlotTimesByDuration("09:00", "11:00", () => 30),
      generateSlotTimes("09:00", "11:00", 30)
    );
  });
});

describe("enrolled slot times", () => {
  it("unions saved continuation blocks with the computed chain", () => {
    const enrolled = enrolledSlotTimesForSession(
      [
        {
          date: "2026-08-31",
          startTime: "09:00",
          students: [{ studentId: "a", sessionStart: "09:00" }],
        },
        {
          date: "2026-08-31",
          startTime: "09:30",
          students: [{ studentId: "a", sessionStart: "09:00" }],
        },
        {
          date: "2026-08-31",
          startTime: "10:00",
          students: [{ studentId: "a", sessionStart: "10:00" }],
        },
      ],
      "2026-08-31",
      ["a"],
      "09:00"
    );
    assert.deepEqual(unionClockTimes(["09:00"], enrolled), ["09:00", "09:30"]);
  });
});
