import { isAvailable } from "./availability.js";
import type { Agent, Assignment, ScheduleData, Shift } from "./types.js";

export const BookingRejection = {
  ShiftFull: "shift_full",
  AgentUnavailable: "agent_unavailable",
} as const;

export type BookingRejection = (typeof BookingRejection)[keyof typeof BookingRejection];

export function isFull(shift: Shift, data: ScheduleData): boolean {
  const booked = data.assignments.filter((assignment) => assignment.shiftId === shift.id).length;
  return booked >= shift.headcount;
}

/** A full shift is reported first: no agent could take it, whoever asks. */
export function checkBooking(agent: Agent, shift: Shift, data: ScheduleData): BookingRejection | undefined {
  if (isFull(shift, data)) return BookingRejection.ShiftFull;
  if (!isAvailable(agent, shift, data)) return BookingRejection.AgentUnavailable;
  return undefined;
}

export function nextAssignmentId(assignments: Assignment[]): string {
  const highest = Math.max(
    0,
    ...assignments.map((assignment) => Number(/^asg_(\d+)$/.exec(assignment.id)?.[1] ?? 0)),
  );
  return `asg_${highest + 1}`;
}
