import { SqliteScheduleStore } from "../../src/data/sqlite/sqlite-schedule-store.js";
import { loadScheduleData } from "../../src/data/schedule-file.js";
import type { ScheduleData } from "../../src/domain/types.js";
import { sampleDataPath } from "./paths.js";

/** A fresh in-memory SQLite database, migrated and seeded (with the sample data by default). */
export async function openSeededStore(data?: ScheduleData): Promise<SqliteScheduleStore> {
  const store = SqliteScheduleStore.open(":memory:");
  store.seedIfEmpty(data ?? (await loadScheduleData(sampleDataPath)));
  return store;
}
