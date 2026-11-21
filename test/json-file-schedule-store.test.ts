import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { JsonFileScheduleStore } from "../src/data/json-file-schedule-store.js";
import { copySampleData } from "./support/sample-data-copy.js";

const assignment = { id: "asg_2", shiftId: "shf_2", agentId: "agt_3" };

describe("JsonFileScheduleStore", () => {
  it("writes a new assignment to the file and serves it from memory", async () => {
    const filePath = await copySampleData();
    const store = await JsonFileScheduleStore.open(filePath);

    store.addAssignment(assignment);

    expect(store.read().assignments).toContainEqual(assignment);
    expect(JSON.parse(await readFile(filePath, "utf8")).assignments).toContainEqual(assignment);
  });

  it("keeps the assignment after reopening the file", async () => {
    const filePath = await copySampleData();
    (await JsonFileScheduleStore.open(filePath)).addAssignment(assignment);

    const reopened = await JsonFileScheduleStore.open(filePath);

    expect(reopened.read().assignments).toContainEqual(assignment);
  });

  it("leaves its data unchanged when the write fails", async () => {
    const filePath = await copySampleData();
    const store = await JsonFileScheduleStore.open(filePath);
    const before = store.read();
    await rm(path.dirname(filePath), { recursive: true });

    expect(() => store.addAssignment(assignment)).toThrow();
    expect(store.read()).toBe(before);
  });
});
