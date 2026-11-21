import { describe, expect, it } from "vitest";
import { BookingRejection, checkBooking, isFull, nextAssignmentId } from "../src/domain/booking.js";
import type { ScheduleData } from "../src/domain/types.js";
import { book, makeAgent, makeShift } from "./support/builders.js";

const guard = makeAgent("guard", { GUARD_LICENSE: "2027-01-01" });
const other = makeAgent("other", { GUARD_LICENSE: "2027-01-01" });
const unqualified = makeAgent("unqualified");

describe("isFull", () => {
  it("is false below headcount and true once headcount is reached", () => {
    const shift = makeShift("s", "2026-09-15T22:00:00Z", "2026-09-16T06:00:00Z", [], 2);
    const oneBooked: ScheduleData = { agents: [guard, other], shifts: [shift], assignments: [book(guard, shift)] };
    const twoBooked: ScheduleData = { ...oneBooked, assignments: [book(guard, shift), book(other, shift)] };

    expect(isFull(shift, oneBooked)).toBe(false);
    expect(isFull(shift, twoBooked)).toBe(true);
  });
});

describe("checkBooking", () => {
  const shift = makeShift("s", "2026-09-15T22:00:00Z", "2026-09-16T06:00:00Z", ["GUARD_LICENSE"], 1);

  it("allows an available agent onto a shift with room", () => {
    const data: ScheduleData = { agents: [guard], shifts: [shift], assignments: [] };
    expect(checkBooking(guard, shift, data)).toBeUndefined();
  });

  it("rejects an agent who is not available", () => {
    const data: ScheduleData = { agents: [unqualified], shifts: [shift], assignments: [] };
    expect(checkBooking(unqualified, shift, data)).toBe(BookingRejection.AgentUnavailable);
  });

  it("rejects booking an agent twice onto the same shift", () => {
    const roomy = makeShift("roomy", "2026-09-15T22:00:00Z", "2026-09-16T06:00:00Z", [], 2);
    const data: ScheduleData = { agents: [guard], shifts: [roomy], assignments: [book(guard, roomy)] };
    expect(checkBooking(guard, roomy, data)).toBe(BookingRejection.AgentUnavailable);
  });

  it("rejects an available agent when the shift is full", () => {
    const data: ScheduleData = { agents: [guard, other], shifts: [shift], assignments: [book(other, shift)] };
    expect(checkBooking(guard, shift, data)).toBe(BookingRejection.ShiftFull);
  });

  it("reports a full shift before an unavailable agent", () => {
    const data: ScheduleData = { agents: [guard, unqualified], shifts: [shift], assignments: [book(guard, shift)] };
    expect(checkBooking(unqualified, shift, data)).toBe(BookingRejection.ShiftFull);
  });
});

describe("nextAssignmentId", () => {
  it("continues after the highest numbered id", () => {
    expect(nextAssignmentId(["asg_1", "asg_7"])).toBe("asg_8");
  });

  it("starts at asg_1 when there are no assignments", () => {
    expect(nextAssignmentId([])).toBe("asg_1");
  });

  it("ignores ids that do not follow the asg_<number> pattern", () => {
    expect(nextAssignmentId(["legacy", "asg_2"])).toBe("asg_3");
  });
});
