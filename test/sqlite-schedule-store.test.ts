import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadScheduleData } from "../src/data/schedule-file.js";
import { SqliteScheduleStore } from "../src/data/sqlite/sqlite-schedule-store.js";
import { makeTempDir, sampleDataPath } from "./support/paths.js";

describe("SqliteScheduleStore", () => {
  it("seeds an empty database once, and not again on the next start", async () => {
    const file = path.join(await makeTempDir(), "schedule.db");
    const seed = await loadScheduleData(sampleDataPath);

    const first = SqliteScheduleStore.open(file);
    expect(first.seedIfEmpty(seed)).toBe(true);
    first.close();

    const second = SqliteScheduleStore.open(file);
    expect(second.seedIfEmpty(seed)).toBe(false);
    expect(second.loadShiftSchedule("shf_1")?.data.assignments).toEqual([{ id: "asg_1", shiftId: "shf_1", agentId: "agt_1" }]);
    second.close();
  });

  it("keeps a booking after a restart", async () => {
    const file = path.join(await makeTempDir(), "schedule.db");
    const before = SqliteScheduleStore.open(file);
    before.seedIfEmpty(await loadScheduleData(sampleDataPath));
    before.addAssignment("shf_2", "agt_3");
    before.close();

    const after = SqliteScheduleStore.open(file);

    expect(after.loadShiftSchedule("shf_2")?.data.assignments).toContainEqual({ id: "asg_2", shiftId: "shf_2", agentId: "agt_3" });
    after.close();
  });

  it("loads the shift, every agent, and only overlapping shifts and their assignments", async () => {
    const store = SqliteScheduleStore.open(":memory:");
    store.seedIfEmpty({
      agents: [{ id: "agt_1", name: "A", qualifications: [{ code: "GUARD_LICENSE", expiresOn: "2027-01-01" }] }],
      shifts: [
        { id: "night", site: "S", start: new Date("2026-09-15T22:00:00Z"), end: new Date("2026-09-16T06:00:00Z"), requiredQualifications: ["GUARD_LICENSE"], headcount: 2 },
        { id: "late", site: "S", start: new Date("2026-09-15T23:00:00Z"), end: new Date("2026-09-16T03:00:00Z"), requiredQualifications: [], headcount: 1 },
        { id: "morning", site: "S", start: new Date("2026-09-16T06:00:00Z"), end: new Date("2026-09-16T14:00:00Z"), requiredQualifications: [], headcount: 1 },
      ],
      assignments: [
        { id: "asg_1", shiftId: "late", agentId: "agt_1" },
        { id: "asg_2", shiftId: "morning", agentId: "agt_1" },
      ],
    });

    const schedule = store.loadShiftSchedule("night");

    expect(schedule?.shift).toEqual({
      id: "night",
      site: "S",
      start: new Date("2026-09-15T22:00:00Z"),
      end: new Date("2026-09-16T06:00:00Z"),
      requiredQualifications: ["GUARD_LICENSE"],
      headcount: 2,
    });
    expect(schedule?.data.agents).toEqual([
      { id: "agt_1", name: "A", qualifications: [{ code: "GUARD_LICENSE", expiresOn: "2027-01-01" }] },
    ]);
    expect(schedule?.data.shifts.map((s) => s.id).sort()).toEqual(["late", "night"]);
    expect(schedule?.data.assignments).toEqual([{ id: "asg_1", shiftId: "late", agentId: "agt_1" }]);
    store.close();
  });

  it("returns undefined for an unknown shift", () => {
    const store = SqliteScheduleStore.open(":memory:");
    expect(store.loadShiftSchedule("nope")).toBeUndefined();
    store.close();
  });

  it("rejects the same agent twice on one shift at the database level", async () => {
    const store = SqliteScheduleStore.open(":memory:");
    store.seedIfEmpty(await loadScheduleData(sampleDataPath));

    expect(() => store.addAssignment("shf_1", "agt_1")).toThrow(/UNIQUE constraint failed/);
    store.close();
  });

  it("rolls back everything an atomic block did when it throws", async () => {
    const store = SqliteScheduleStore.open(":memory:");
    store.seedIfEmpty(await loadScheduleData(sampleDataPath));

    expect(() =>
      store.atomically(() => {
        store.addAssignment("shf_2", "agt_3");
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(store.loadShiftSchedule("shf_2")?.data.assignments.filter((a) => a.shiftId === "shf_2")).toEqual([]);
    store.close();
  });
});
