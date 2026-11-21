import { renameSync, writeFileSync } from "node:fs";
import type { Assignment, ScheduleData } from "../domain/types.js";
import { loadScheduleData, serializeScheduleData } from "./schedule-file.js";
import type { ScheduleStore } from "./schedule-store.js";

export class JsonFileScheduleStore implements ScheduleStore {
  private constructor(
    private readonly filePath: string,
    private data: ScheduleData,
  ) {}

  static async open(filePath: string): Promise<JsonFileScheduleStore> {
    return new JsonFileScheduleStore(filePath, await loadScheduleData(filePath));
  }

  read(): ScheduleData {
    return this.data;
  }

  // Synchronous on purpose: a request's check-then-write can't interleave with another request's.
  addAssignment(assignment: Assignment): void {
    const next = { ...this.data, assignments: [...this.data.assignments, assignment] };
    writeFileAtomically(this.filePath, serializeScheduleData(next));
    this.data = next;
  }
}

function writeFileAtomically(filePath: string, content: string): void {
  const tempPath = `${filePath}.tmp`;
  writeFileSync(tempPath, content);
  renameSync(tempPath, filePath);
}
