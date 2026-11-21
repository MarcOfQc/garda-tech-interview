import type { Assignment, ScheduleData, Shift } from "../domain/types.js";

/** A shift plus everything its availability depends on: agents, and assignments on overlapping shifts. */
export interface ShiftSchedule {
  shift: Shift;
  data: ScheduleData;
}

export interface ScheduleStore {
  /** Loads all agents, or only `agentId` when given; undefined when the shift doesn't exist. */
  loadShiftSchedule(shiftId: string, agentId?: string): ShiftSchedule | undefined;
  addAssignment(shiftId: string, agentId: string): Assignment;
  /** Runs `work` so that no other booking can change what it reads until it returns. */
  atomically<T>(work: () => T): T;
}
