import type { Assignment, ScheduleData } from "../domain/types.js";

export interface ScheduleStore {
  read(): ScheduleData;
  addAssignment(assignment: Assignment): void;
}
