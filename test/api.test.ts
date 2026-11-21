import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadScheduleData } from "../src/data/load-schedule.js";
import type { ScheduleData } from "../src/domain/types.js";
import { buildApp } from "../src/http/app.js";

const marc = { id: "agt_3", name: "Marc Tremblay" };

describe("GET /api/shifts/:id/available-agents (sample data)", () => {
  let data: ScheduleData;

  beforeAll(async () => {
    data = await loadScheduleData(path.resolve(import.meta.dirname, "../data.json"));
  });

  it("returns only Marc for shf_1 (Priya expired, Jordan already booked)", async () => {
    const response = await buildApp(data).inject({ method: "GET", url: "/api/shifts/shf_1/available-agents" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([marc]);
  });

  it("returns only Marc for shf_2 (Jordan overlaps via shf_1)", async () => {
    const response = await buildApp(data).inject({ method: "GET", url: "/api/shifts/shf_2/available-agents" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([marc]);
  });

  it("returns 404 for an unknown shift", async () => {
    const response = await buildApp(data).inject({ method: "GET", url: "/api/shifts/shf_999/available-agents" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: "Shift shf_999 not found" });
  });
});

describe("GET /api/shifts/:id/available-agents (nobody available)", () => {
  it("returns 200 with an empty array, not 404", async () => {
    const data: ScheduleData = {
      agents: [{ id: "agt_1", name: "Unqualified", qualifications: [] }],
      shifts: [
        {
          id: "shf_1",
          site: "Test site",
          start: new Date("2026-09-15T22:00:00Z"),
          end: new Date("2026-09-16T06:00:00Z"),
          requiredQualifications: ["GUARD_LICENSE"],
          headcount: 1,
        },
      ],
      assignments: [],
    };

    const response = await buildApp(data).inject({ method: "GET", url: "/api/shifts/shf_1/available-agents" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });
});
