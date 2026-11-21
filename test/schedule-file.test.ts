import { describe, expect, it } from "vitest";
import { parseScheduleData } from "../src/data/schedule-file.js";

const shift = {
  id: "shf_1",
  site: "Test site",
  start: "2026-09-15T22:00:00Z",
  end: "2026-09-16T06:00:00Z",
  requiredQualifications: [],
  headcount: 1,
};

describe("parseScheduleData", () => {
  it("parses shift times into Date instances", () => {
    const data = parseScheduleData({ agents: [], shifts: [shift], assignments: [] });

    expect(data.shifts[0]?.start).toEqual(new Date("2026-09-15T22:00:00Z"));
  });

  it("rejects a shift that does not end after it starts", () => {
    const backwards = { ...shift, end: "2026-09-15T06:00:00Z" };

    expect(() => parseScheduleData({ agents: [], shifts: [backwards], assignments: [] })).toThrow(
      "Shift must end after it starts",
    );
  });

  it("rejects times that are not UTC ISO-8601", () => {
    const local = { ...shift, start: "2026-09-15T22:00:00-04:00" };

    expect(() => parseScheduleData({ agents: [], shifts: [local], assignments: [] })).toThrow();
  });
});
