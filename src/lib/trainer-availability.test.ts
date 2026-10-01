import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isNewBookingBlocked,
  resolveDaySlotTimes,
  studentDayBookable,
  type DaySchedule,
  type OpenAvailabilityBlock,
  type VacationPeriod,
} from "./trainer-availability";

const mondaySched: DaySchedule = {
  enabled: true,
  ranges: [{ startTime: "09:00", endTime: "11:00" }],
};

const vacation: VacationPeriod[] = [{ id: "v1", startDate: "2026-08-31", endDate: "2026-09-04" }];

describe("resolveDaySlotTimes vacation", () => {
  it("includes Monday weekly hours on a vacation Monday", () => {
    const times = resolveDaySlotTimes({
      dateStr: "2026-08-31",
      weeklySched: mondaySched,
      openBlocks: [],
      slotDurationMin: 30,
      vacationPeriods: vacation,
    });
    assert.deepEqual(times, ["09:00", "09:30", "10:00", "10:30"]);
  });

  it("merges weekly hours with open blocks on vacation", () => {
    const openBlocks: OpenAvailabilityBlock[] = [
      { id: "o1", date: "2026-08-31", startTime: "16:00", endTime: "17:00" },
    ];
    const times = resolveDaySlotTimes({
      dateStr: "2026-08-31",
      weeklySched: mondaySched,
      openBlocks,
      slotDurationMin: 30,
      vacationPeriods: vacation,
    });
    assert.deepEqual(times, ["09:00", "09:30", "10:00", "10:30", "16:00", "16:30"]);
  });
});

describe("isNewBookingBlocked student self-book", () => {
  it("blocks students on vacation even without open blocks", () => {
    assert.equal(
      isNewBookingBlocked({
        dateStr: "2026-08-31",
        time: "09:00",
        vacationPeriods: vacation,
        openBlocks: [],
      }),
      true
    );
  });

  it("blocks students on vacation even inside an open block", () => {
    assert.equal(
      isNewBookingBlocked({
        dateStr: "2026-08-31",
        time: "16:00",
        vacationPeriods: vacation,
        openBlocks: [{ id: "o1", date: "2026-08-31", startTime: "16:00", endTime: "17:00" }],
      }),
      true
    );
  });

  it("does not block a date outside vacation", () => {
    assert.equal(
      isNewBookingBlocked({
        dateStr: "2026-08-30",
        time: "09:00",
        vacationPeriods: vacation,
        openBlocks: [],
      }),
      false
    );
  });
});

describe("studentDayBookable", () => {
  it("stays false on vacation even when weekly slots exist", () => {
    assert.equal(
      studentDayBookable({ weeklyAvailable: true, onVacation: true, hasResolvableSlots: true }),
      false
    );
  });
});
