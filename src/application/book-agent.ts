import { BookingRejection, checkBooking } from "../domain/booking.js";
import type { Assignment } from "../domain/types.js";
import type { ScheduleStore } from "./schedule-store.js";

export const BookingFailure = {
  ShiftNotFound: "shift_not_found",
  AgentNotFound: "agent_not_found",
  ...BookingRejection,
} as const;

export type BookingFailure = (typeof BookingFailure)[keyof typeof BookingFailure];

export type BookingResult =
  | { ok: true; assignment: Assignment }
  | { ok: false; reason: BookingFailure };

export function bookAgent(store: ScheduleStore, shiftId: string, agentId: string): BookingResult {
  return store.atomically(() => {
    const schedule = store.loadShiftSchedule(shiftId, agentId);
    if (!schedule) return { ok: false, reason: BookingFailure.ShiftNotFound };

    const agent = schedule.data.agents.find((a) => a.id === agentId);
    if (!agent) return { ok: false, reason: BookingFailure.AgentNotFound };

    const rejection = checkBooking(agent, schedule.shift, schedule.data);
    if (rejection) return { ok: false, reason: rejection };

    return { ok: true, assignment: store.addAssignment(shiftId, agentId) };
  });
}
