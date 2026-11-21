import type { ScheduleStore } from "../../src/data/schedule-store.js";
import type { Assignment, ScheduleData } from "../../src/domain/types.js";

export class InMemoryScheduleStore implements ScheduleStore {
  constructor(private data: ScheduleData) {}

  read(): ScheduleData {
    return this.data;
  }

  addAssignment(assignment: Assignment): void {
    this.data = { ...this.data, assignments: [...this.data.assignments, assignment] };
  }
}
