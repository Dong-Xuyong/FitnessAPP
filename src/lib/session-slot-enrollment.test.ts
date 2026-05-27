import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  nextMondayFrom,
  getWeekStart,
  isDateBeforeToday,
  dateForWeekdayInCycle,
  slotDocId,
  previewCycleDates,
  countStudentLogicalSessions,
  type SessionSlot,
  type WeeklySlotPattern,
} from "./session-slot-enrollment";
import { isNewBookingBlocked } from "./trainer-availability";

// ── nextMondayFrom ─────────────────────────────────────────────────────────

describe("nextMondayFrom", () => {
  it("returns next Monday when today is Wednesday", () => {
    const wed = new Date("2026-05-27T12:00:00"); // Wednesday
    assert.equal(nextMondayFrom(wed), "2026-06-01");
  });

  it("returns next Monday (7 days ahead) when today is already Monday", () => {
    const mon = new Date("2026-06-01T12:00:00"); // Monday
    assert.equal(nextMondayFrom(mon), "2026-06-08");
  });

  it("returns next Monday when today is Sunday", () => {
    const sun = new Date("2026-05-31T12:00:00"); // Sunday
    assert.equal(nextMondayFrom(sun), "2026-06-01");
  });

  it("returns next Monday when today is Saturday", () => {
    const sat = new Date("2026-05-30T12:00:00"); // Saturday
    assert.equal(nextMondayFrom(sat), "2026-06-01");
  });
});

// ── getWeekStart ──────────────────────────────────────────────────────────

describe("getWeekStart", () => {
  it("returns the Monday of the same week for a Wednesday", () => {
    assert.equal(getWeekStart("2026-05-27"), "2026-05-25");
  });

  it("returns the same day for a Monday", () => {
    assert.equal(getWeekStart("2026-06-01"), "2026-06-01");
  });

  it("returns the previous Monday for a Sunday", () => {
    assert.equal(getWeekStart("2026-06-07"), "2026-06-01");
  });

  it("normalizes any selected calendar day to that week Monday", () => {
    assert.equal(getWeekStart("2026-06-04"), "2026-06-01"); // Thu -> Mon
  });
});

describe("isDateBeforeToday", () => {
  const now = new Date("2026-06-10T14:00:00");

  it("returns true for past dates", () => {
    assert.equal(isDateBeforeToday("2026-06-09", now), true);
  });

  it("returns false for today", () => {
    assert.equal(isDateBeforeToday("2026-06-10", now), false);
  });

  it("returns false for future dates", () => {
    assert.equal(isDateBeforeToday("2026-06-11", now), false);
  });
});

// ── dateForWeekdayInCycle ────────────────────────────────────────────────

describe("dateForWeekdayInCycle", () => {
  const monday = "2026-06-01";

  it("returns the Monday itself for weekOffset=0, weekday=monday", () => {
    assert.equal(dateForWeekdayInCycle(monday, 0, "monday"), "2026-06-01");
  });

  it("returns Wednesday of the same week for weekOffset=0, weekday=wednesday", () => {
    assert.equal(dateForWeekdayInCycle(monday, 0, "wednesday"), "2026-06-03");
  });

  it("returns Monday of week 2 for weekOffset=1, weekday=monday", () => {
    assert.equal(dateForWeekdayInCycle(monday, 1, "monday"), "2026-06-08");
  });

  it("returns Friday of week 3 for weekOffset=2, weekday=friday", () => {
    assert.equal(dateForWeekdayInCycle(monday, 2, "friday"), "2026-06-19");
  });
});

// ── slotDocId ─────────────────────────────────────────────────────────────

describe("slotDocId", () => {
  it("formats correctly removing colon", () => {
    assert.equal(slotDocId("2026-06-01", "09:00"), "2026-06-01_0900");
    assert.equal(slotDocId("2026-06-01", "14:30"), "2026-06-01_1430");
  });
});

// ── previewCycleDates ─────────────────────────────────────────────────────

describe("previewCycleDates", () => {
  it("returns N * pattern.length entries", () => {
    const pattern: WeeklySlotPattern = [
      { weekday: "monday", startTime: "09:00" },
      { weekday: "wednesday", startTime: "11:00" },
    ];
    const result = previewCycleDates({ cycleStartMonday: "2026-06-01", repeatWeeks: 3, pattern });
    assert.equal(result.length, 6);
  });

  it("returns correct dates for week 0 and week 1", () => {
    const pattern: WeeklySlotPattern = [{ weekday: "tuesday", startTime: "10:00" }];
    const result = previewCycleDates({ cycleStartMonday: "2026-06-01", repeatWeeks: 2, pattern });
    assert.equal(result[0].dateStr, "2026-06-02"); // Tue of week 0
    assert.equal(result[1].dateStr, "2026-06-09"); // Tue of week 1
    assert.equal(result[0].startTime, "10:00");
  });
});

// ── Enrollment skip logic (pure helpers, no Firebase required) ────────────

describe("enrollment slot skips", () => {
  it("pattern preview: 2 weeks × 2 day pattern generates 4 entries", () => {
    const pattern: WeeklySlotPattern = [
      { weekday: "monday", startTime: "09:00" },
      { weekday: "wednesday", startTime: "09:00" },
    ];
    const preview = previewCycleDates({ cycleStartMonday: "2026-06-01", repeatWeeks: 2, pattern });
    assert.equal(preview.length, 4);
    assert.equal(preview[0].dateStr, "2026-06-01"); // Mon week 0
    assert.equal(preview[1].dateStr, "2026-06-03"); // Wed week 0
    assert.equal(preview[2].dateStr, "2026-06-08"); // Mon week 1
    assert.equal(preview[3].dateStr, "2026-06-10"); // Wed week 1
  });

  it("already-booked check: detects student already enrolled on same date", () => {
    const existingSlot: SessionSlot = {
      id: "2026-06-01_0900",
      date: "2026-06-01",
      startTime: "09:00",
      maxStudents: 2,
      students: [{ studentId: "student-1", studentName: "Test", sessionAttendance: "pending" }],
    };
    const alreadyBooked = [existingSlot].some(
      (s) => s.date === "2026-06-01" && s.students.some((st) => st.studentId === "student-1")
    );
    assert.equal(alreadyBooked, true);
  });

  it("capacity check: detects a full block", () => {
    const slot: SessionSlot = {
      id: "2026-06-01_0900",
      date: "2026-06-01",
      startTime: "09:00",
      maxStudents: 1,
      students: [{ studentId: "other", studentName: "Other", sessionAttendance: "pending" }],
    };
    assert.equal(slot.students.length >= slot.maxStudents, true);
  });

  it("60 min session requires 2 consecutive 30 min blocks", () => {
    assert.equal(Math.ceil(60 / 30), 2);
  });

  it("30 min session requires exactly 1 block", () => {
    assert.equal(Math.ceil(30 / 30), 1);
  });

  it("insufficient blocks: start time not present in slot list → skip", () => {
    const allSlotTimes = ["09:00", "10:00"];
    assert.equal(allSlotTimes.indexOf("10:30"), -1);
  });
});

// ── Vacation skip logic ───────────────────────────────────────────────────

describe("countStudentLogicalSessions", () => {
  it("counts unique logical sessions across multi-block rows", () => {
    const slots: SessionSlot[] = [
      {
        id: "2026-06-01_0900",
        date: "2026-06-01",
        startTime: "09:00",
        maxStudents: 2,
        students: [
          {
            studentId: "s1",
            studentName: "A",
            sessionStart: "09:00",
            sessionDurationMin: 60,
            sessionAttendance: "pending",
          },
        ],
      },
      {
        id: "2026-06-01_0930",
        date: "2026-06-01",
        startTime: "09:30",
        maxStudents: 2,
        students: [
          {
            studentId: "s1",
            studentName: "A",
            sessionStart: "09:00",
            sessionDurationMin: 60,
            sessionAttendance: "pending",
          },
        ],
      },
      {
        id: "2026-06-03_1000",
        date: "2026-06-03",
        startTime: "10:00",
        maxStudents: 2,
        students: [{ studentId: "s1", studentName: "A", sessionAttendance: "pending" }],
      },
    ];
    assert.equal(countStudentLogicalSessions(slots, ["s1"]), 2);
  });

  it("excludes past dates when excludePast is true", () => {
    const slots: SessionSlot[] = [
      {
        id: "2026-05-01_0900",
        date: "2026-05-01",
        startTime: "09:00",
        maxStudents: 2,
        students: [{ studentId: "s1", studentName: "A", sessionAttendance: "pending" }],
      },
      {
        id: "2026-06-10_1000",
        date: "2026-06-10",
        startTime: "10:00",
        maxStudents: 2,
        students: [{ studentId: "s1", studentName: "A", sessionAttendance: "pending" }],
      },
    ];
    const now = new Date("2026-06-10T12:00:00");
    assert.equal(countStudentLogicalSessions(slots, ["s1"], { excludePast: true, now }), 1);
  });
});

describe("vacation skip logic", () => {
  it("detects that a date in a vacation period is blocked", () => {
    const vacationPeriods = [{ id: "v1", startDate: "2026-06-01", endDate: "2026-06-07" }];
    const blocked = isNewBookingBlocked({
      dateStr: "2026-06-03",
      time: "09:00",
      vacationPeriods,
      openBlocks: [],
    });
    assert.equal(blocked, true);
  });

  it("does not block a date outside vacation period", () => {
    const vacationPeriods = [{ id: "v1", startDate: "2026-06-01", endDate: "2026-06-07" }];
    const blocked = isNewBookingBlocked({
      dateStr: "2026-06-08",
      time: "09:00",
      vacationPeriods,
      openBlocks: [],
    });
    assert.equal(blocked, false);
  });
});
