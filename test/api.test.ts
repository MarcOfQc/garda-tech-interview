import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqliteScheduleStore } from "../src/data/sqlite/sqlite-schedule-store.js";
import { buildApp } from "../src/http/app.js";
import { book, makeAgent, makeShift } from "./support/builders.js";
import { openSeededStore } from "./support/sqlite-store.js";

const marc = { id: "agt_3", name: "Marc Tremblay" };

describe("with the sample data", () => {
  let store: SqliteScheduleStore;
  let app: ReturnType<typeof buildApp>;

  beforeEach(async () => {
    store = await openSeededStore();
    app = buildApp(store);
  });

  afterEach(() => store.close());

  const availableFor = (shiftId: string) =>
    app.inject({ method: "GET", url: `/api/shifts/${shiftId}/available-agents` });

  const bookOnto = (shiftId: string, body: object) =>
    app.inject({ method: "POST", url: `/api/shifts/${shiftId}/assignments`, payload: body });

  const assignmentsOn = (shiftId: string) =>
    store.loadShiftSchedule(shiftId)?.data.assignments.filter((a) => a.shiftId === shiftId);

  describe("GET /api/shifts/:id/available-agents", () => {
    it("returns only Marc for shf_1 (Priya expired, Jordan already booked)", async () => {
      const response = await availableFor("shf_1");

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([marc]);
    });

    it("returns only Marc for shf_2 (Jordan overlaps via shf_1)", async () => {
      const response = await availableFor("shf_2");

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([marc]);
    });

    it("returns 404 for an unknown shift", async () => {
      const response = await availableFor("shf_999");

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: "Shift shf_999 not found" });
    });
  });

  describe("POST /api/shifts/:id/assignments", () => {
    it("books Marc onto shf_2, returns 201 and stores it", async () => {
      const response = await bookOnto("shf_2", { agentId: "agt_3" });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({ id: "asg_2", shiftId: "shf_2", agentId: "agt_3" });
      expect(assignmentsOn("shf_2")).toEqual([{ id: "asg_2", shiftId: "shf_2", agentId: "agt_3" }]);
    });

    it("changes what GET returns straight away, for this shift and overlapping ones", async () => {
      await bookOnto("shf_2", { agentId: "agt_3" });

      expect((await availableFor("shf_2")).json()).toEqual([]);
      expect((await availableFor("shf_1")).json()).toEqual([]);
    });

    it("rejects an unqualified agent with 422 and stores nothing", async () => {
      const response = await bookOnto("shf_1", { agentId: "agt_2" });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ message: "Agent agt_2 is not available for shift shf_1" });
      expect(assignmentsOn("shf_1")).toEqual([{ id: "asg_1", shiftId: "shf_1", agentId: "agt_1" }]);
    });

    it("rejects a double-booked agent with 422 and stores nothing", async () => {
      const response = await bookOnto("shf_2", { agentId: "agt_1" });

      expect(response.statusCode).toBe(422);
      expect(assignmentsOn("shf_2")).toEqual([]);
    });

    it("returns 409 once the shift is full", async () => {
      await bookOnto("shf_2", { agentId: "agt_3" });

      const response = await bookOnto("shf_2", { agentId: "agt_1" });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toEqual({ message: "Shift shf_2 is full" });
      expect(assignmentsOn("shf_2")).toHaveLength(1);
    });

    it("returns 404 for an unknown shift", async () => {
      const response = await bookOnto("shf_999", { agentId: "agt_3" });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: "Shift shf_999 not found" });
    });

    it("returns 404 for an unknown agent", async () => {
      const response = await bookOnto("shf_2", { agentId: "agt_999" });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ message: "Agent agt_999 not found" });
    });

    it("returns 400 when agentId is missing", async () => {
      const response = await bookOnto("shf_2", {});

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ statusCode: 400, code: "FST_ERR_VALIDATION", error: "Bad Request" });
    });
  });
});

describe("with custom data", () => {
  it("returns 200 with an empty array when nobody is available, not 404", async () => {
    const shift = makeShift("shf_1", "2026-09-15T22:00:00Z", "2026-09-16T06:00:00Z", ["GUARD_LICENSE"]);
    const store = await openSeededStore({ agents: [makeAgent("agt_1")], shifts: [shift], assignments: [] });

    const response = await buildApp(store).inject({ method: "GET", url: "/api/shifts/shf_1/available-agents" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    store.close();
  });

  it("returns 409 for an otherwise available agent when the shift is full", async () => {
    const shift = makeShift("shf_1", "2026-09-15T22:00:00Z", "2026-09-16T06:00:00Z", [], 1);
    const booked = makeAgent("agt_1");
    const free = makeAgent("agt_2");
    const store = await openSeededStore({ agents: [booked, free], shifts: [shift], assignments: [book(booked, shift)] });

    const response = await buildApp(store).inject({
      method: "POST",
      url: "/api/shifts/shf_1/assignments",
      payload: { agentId: "agt_2" },
    });

    expect(response.statusCode).toBe(409);
    store.close();
  });
});
