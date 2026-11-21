import type { Agent, ScheduleData, Shift } from "./types.js";

type TimeWindow = Pick<Shift, "start" | "end">;

/** Half-open windows: shifts that only touch (one ends as the next starts) do not overlap. */
export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

export function holdsValidQualifications(agent: Agent, shift: Shift): boolean {
  const shiftStartDate = shift.start.toISOString().slice(0, 10);

  return shift.requiredQualifications.every((code) =>
    agent.qualifications.some(
      // YYYY-MM-DD strings sort chronologically, so string comparison is a date comparison.
      (qualification) => qualification.code === code && qualification.expiresOn >= shiftStartDate,
    ),
  );
}

export function isBookedDuring(agent: Agent, shift: Shift, data: ScheduleData): boolean {
  return data.assignments
    .filter((assignment) => assignment.agentId === agent.id)
    .map((assignment) => data.shifts.find((s) => s.id === assignment.shiftId))
    .some((bookedShift) => bookedShift !== undefined && overlaps(bookedShift, shift));
}

export function findAvailableAgents(shift: Shift, data: ScheduleData): Agent[] {
  return data.agents.filter(
    (agent) => holdsValidQualifications(agent, shift) && !isBookedDuring(agent, shift, data),
  );
}
