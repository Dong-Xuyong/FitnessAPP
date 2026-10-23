import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BLOCK_WEEKDAY_ORDER,
  blocksCoveringSession,
  canonicalClockTime,
  dayGridStartTimes,
  displayedBlockMaxStudents,
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
  weekdayKeyFromDate,
  weekdayKeyFromDateStr,
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

const fridayRule: BlockRule = {
  id: "sex-1530",
  weekdays: ["friday"],
  startTime: "15:30",
  endTime: "16:30",
  durationMin: 60,
  maxStudents: 1,
};

const fridayAfternoon: DaySchedule = {
  enabled: true,
  ranges: [{ startTime: "15:30", endTime: "17:00" }],
};

function fridayDuration(time: string): number {
  return resolveBlockSettings({
    rules: [fridayRule],
    weekday: "friday",
    time,
    defaultDurationMin: 30,
    defaultMaxStudents: 4,
  }).durationMin;
}

describe("Friday 30 Oct 2026 rule Sex 15:30–16:30", () => {
  it("uses JS getDay Sunday-first, and Lisbon and UTC agree on that Friday", () => {
    const localNoon = new Date(2026, 9, 30, 12, 0, 0);
    assert.equal(localNoon.getDay(), 5);
    assert.equal(weekdayKeyFromDate(localNoon), "friday");
    assert.equal(weekdayKeyFromDateStr("2026-10-30"), "friday");
    assert.equal(BLOCK_WEEKDAY_ORDER.indexOf("friday"), 4);
    assert.equal(BLOCK_WEEKDAY_ORDER[localNoon.getDay()], "saturday");
    const noonUtc = new Date("2026-10-30T12:00:00Z");
    assert.equal(
      new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Lisbon", weekday: "long" }).format(noonUtc),
      "Friday"
    );
    assert.equal(
      new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" }).format(noonUtc),
      "Friday"
    );
  });

  it("matches 15:30 by minutes, with an inclusive start and an exclusive end", () => {
    const rules = normalizeBlockRules([fridayRule]);
    assert.equal(firstMatchingBlockRule(rules, "friday", "15:30")?.durationMin, 60);
    assert.equal(firstMatchingBlockRule(rules, "friday", "16:00")?.maxStudents, 1);
    assert.equal(firstMatchingBlockRule(rules, "friday", "16:30"), null);
    const unpadded: BlockRule = { ...fridayRule, startTime: "9:30", endTime: "10:30" };
    assert.equal(firstMatchingBlockRule([unpadded], "friday", "09:30")?.id, fridayRule.id);
    assert.equal(canonicalClockTime("15:30:00"), "15:30");
    const fromTimeInput = normalizeBlockRules([
      { ...fridayRule, startTime: "15:30:00", endTime: "16:30:00" },
    ]);
    assert.equal(fromTimeInput[0]?.startTime, "15:30");
    assert.equal(fromTimeInput[0]?.endTime, "16:30");
    assert.equal(firstMatchingBlockRule(fromTimeInput, "friday", "15:30")?.maxStudents, 1);
  });

  it("builds one 60 min block at 15:30 inside the rule and keeps the default after it", () => {
    const withoutRules = resolveDaySlotTimes({
      dateStr: "2026-10-30",
      weeklySched: fridayAfternoon,
      openBlocks: [],
      slotDurationMin: 30,
    });
    assert.deepEqual(withoutRules, ["15:30", "16:00", "16:30"]);

    const times = resolveDaySlotTimes({
      dateStr: "2026-10-30",
      weeklySched: fridayAfternoon,
      openBlocks: [],
      slotDurationMin: 30,
      blockRules: [fridayRule],
    });
    assert.deepEqual(times, ["15:30", "16:30"]);
    const atStart = resolveBlockSettings({
      rules: [fridayRule],
      weekday: weekdayKeyFromDateStr("2026-10-30"),
      time: "15:30",
      defaultDurationMin: 30,
      defaultMaxStudents: 4,
    });
    assert.equal(atStart.durationMin, 60);
    assert.equal(atStart.maxStudents, 1);
    assert.equal(fridayDuration("16:30"), 30);
  });

  it("is exactly one block when the open window is the rule range", () => {
    const times = resolveDaySlotTimes({
      dateStr: "2026-10-30",
      weeklySched: { enabled: true, ranges: [{ startTime: "15:30", endTime: "16:30" }] },
      openBlocks: [],
      slotDurationMin: 30,
      blockRules: [fridayRule],
    });
    assert.deepEqual(times, ["15:30"]);
  });

  it("drops empty generated slots and keeps bookings that the rule does not cover", () => {
    const generated = resolveDaySlotTimes({
      dateStr: "2026-10-30",
      weeklySched: fridayAfternoon,
      openBlocks: [],
      slotDurationMin: 30,
      blockRules: [fridayRule],
    });
    const emptyDocs = dayGridStartTimes({
      generated,
      durationMinAt: fridayDuration,
      slots: [
        { startTime: "15:30", students: [] },
        { startTime: "16:00", students: [] },
      ],
    });
    assert.deepEqual(emptyDocs, ["15:30", "16:30"]);
    assert.equal(
      displayedBlockMaxStudents({
        rulesActive: true,
        persistedMax: 4,
        resolvedMax: 1,
        defaultMax: 4,
        studentCount: 0,
      }),
      1
    );

    const sameSession = dayGridStartTimes({
      generated,
      durationMinAt: fridayDuration,
      slots: [
        { startTime: "15:30", students: [{ studentId: "a", sessionStart: "15:30" }] },
        { startTime: "16:00", students: [{ studentId: "a", sessionStart: "15:30" }] },
      ],
    });
    assert.deepEqual(sameSession, ["15:30", "16:30"]);
    assert.equal(
      displayedBlockMaxStudents({
        rulesActive: true,
        persistedMax: 4,
        resolvedMax: 1,
        defaultMax: 4,
        studentCount: 1,
      }),
      1
    );

    const orphanContinuation = dayGridStartTimes({
      generated,
      durationMinAt: fridayDuration,
      slots: [{ startTime: "16:00", students: [{ studentId: "a", sessionStart: "15:30" }] }],
    });
    assert.deepEqual(orphanContinuation, ["15:30", "16:00", "16:30"]);

    const separateBooking = dayGridStartTimes({
      generated,
      durationMinAt: fridayDuration,
      slots: [{ startTime: "16:00", students: [{ studentId: "b", sessionStart: "16:00" }] }],
    });
    assert.deepEqual(separateBooking, ["15:30", "16:00", "16:30"]);
    assert.equal(
      displayedBlockMaxStudents({
        rulesActive: true,
        persistedMax: 4,
        resolvedMax: 1,
        defaultMax: 4,
        studentCount: 2,
      }),
      4
    );
  });

  it("does not let a Monday-first index treat this Friday as Saturday", () => {
    const saturdayRule: BlockRule = { ...fridayRule, id: "sat", weekdays: ["saturday"] };
    const times = resolveDaySlotTimes({
      dateStr: "2026-10-30",
      weeklySched: fridayAfternoon,
      openBlocks: [],
      slotDurationMin: 30,
      blockRules: [saturdayRule],
    });
    assert.deepEqual(times, ["15:30", "16:00", "16:30"]);
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
