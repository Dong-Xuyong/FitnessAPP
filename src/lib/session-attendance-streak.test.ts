import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  datesWithActionablePendingAttendance,
  studentHasCoachPresentAccessForPlan,
  type SessionSlotAttendance,
} from "./session-attendance-streak";
import type { VacationPeriod } from "./trainer-availability";

const vacation: VacationPeriod[] = [{ id: "v1", startDate: "2026-08-31", endDate: "2026-09-04" }];

function slot(partial: Partial<SessionSlotAttendance> & Pick<SessionSlotAttendance, "date" | "startTime">): SessionSlotAttendance {
  return {
    students: [],
    ...partial,
  };
}

describe("studentHasCoachPresentAccessForPlan vacation", () => {
  it("grants access when booked today on vacation with pending attendance", () => {
    const slots = [
      slot({
        date: "2026-08-31",
        startTime: "09:00",
        students: [
          {
            studentId: "s1",
            sessionStart: "09:00",
            sessionAttendance: "pending",
            workoutPlanId: "plan-1",
          },
        ],
      }),
    ];
    const nowMs = Date.parse("2026-08-31T12:00:00");
    assert.equal(
      studentHasCoachPresentAccessForPlan(slots, "s1", "plan-1", nowMs, 60, vacation),
      true
    );
  });

  it("does not grant vacation access on a non-vacation pending booking", () => {
    const slots = [
      slot({
        date: "2026-08-30",
        startTime: "09:00",
        students: [
          {
            studentId: "s1",
            sessionStart: "09:00",
            sessionAttendance: "pending",
            workoutPlanId: "plan-1",
          },
        ],
      }),
    ];
    const nowMs = Date.parse("2026-08-30T12:00:00");
    assert.equal(
      studentHasCoachPresentAccessForPlan(slots, "s1", "plan-1", nowMs, 60, vacation),
      false
    );
  });
});

describe("datesWithActionablePendingAttendance vacation", () => {
  it("omits vacation dates even when attendance is pending and markable", () => {
    const slots = [
      slot({
        date: "2026-08-31",
        startTime: "09:00",
        students: [
          {
            studentId: "s1",
            sessionStart: "09:00",
            sessionAttendance: "pending",
          },
        ],
      }),
    ];
    const nowMs = Date.parse("2026-08-31T12:00:00");
    assert.deepEqual(
      datesWithActionablePendingAttendance(slots, nowMs, { vacationPeriods: vacation }),
      []
    );
  });
});
