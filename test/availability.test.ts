import { describe, expect, it } from "vitest";
import {
  findAvailableAgents,
  holdsValidQualifications,
  isBookedDuring,
  overlaps,
} from "../src/domain/availability.js";
import type { Agent, Assignment, ScheduleData, Shift } from "../src/domain/types.js";

function makeShift(id: string, start: string, end: string, requiredQualifications: string[] = []): Shift {
  return { id, site: "Test site", start: new Date(start), end: new Date(end), requiredQualifications, headcount: 1 };
}

function makeAgent(id: string, qualifications: Record<string, string> = {}): Agent {
  return {
    id,
    name: `Agent ${id}`,
    qualifications: Object.entries(qualifications).map(([code, expiresOn]) => ({ code, expiresOn })),
  };
}

function book(agent: Agent, shift: Shift): Assignment {
  return { id: `asg_${agent.id}_${shift.id}`, shiftId: shift.id, agentId: agent.id };
}

const overnight = makeShift("night", "2026-09-15T22:00:00Z", "2026-09-16T06:00:00Z");

describe("overlaps", () => {
  it("detects overlap with a shift inside an overnight window", () => {
    expect(overlaps(overnight, makeShift("late", "2026-09-15T23:00:00Z", "2026-09-16T03:00:00Z"))).toBe(true);
  });

  it("detects overlap after midnight", () => {
    expect(overlaps(overnight, makeShift("early", "2026-09-16T05:00:00Z", "2026-09-16T09:00:00Z"))).toBe(true);
  });

  it("treats shifts that only touch as not overlapping, in either order", () => {
    const morning = makeShift("morning", "2026-09-16T06:00:00Z", "2026-09-16T14:00:00Z");
    expect(overlaps(overnight, morning)).toBe(false);
    expect(overlaps(morning, overnight)).toBe(false);
  });

  it("treats two different shifts with identical times as overlapping", () => {
    const otherSite = makeShift("other-site", "2026-09-15T22:00:00Z", "2026-09-16T06:00:00Z");
    expect(overlaps(overnight, otherSite)).toBe(true);
  });

  it("treats back-to-back nights with the same hours as not overlapping", () => {
    const nextNight = makeShift("next-night", "2026-09-16T22:00:00Z", "2026-09-17T06:00:00Z");
    expect(overlaps(overnight, nextNight)).toBe(false);
    expect(overlaps(nextNight, overnight)).toBe(false);
  });

  it("treats disjoint shifts as not overlapping", () => {
    expect(overlaps(overnight, makeShift("next", "2026-09-17T22:00:00Z", "2026-09-18T06:00:00Z"))).toBe(false);
  });
});

describe("holdsValidQualifications", () => {
  const shift = makeShift("s", "2026-09-15T22:00:00Z", "2026-09-16T06:00:00Z", ["GUARD_LICENSE", "CROWD_CONTROL"]);

  it("passes when every required qualification is held and current", () => {
    const agent = makeAgent("a", { GUARD_LICENSE: "2027-01-01", CROWD_CONTROL: "2027-01-01" });
    expect(holdsValidQualifications(agent, shift)).toBe(true);
  });

  it("fails when a required qualification is missing", () => {
    expect(holdsValidQualifications(makeAgent("a", { GUARD_LICENSE: "2027-01-01" }), shift)).toBe(false);
  });

  it("fails when a required qualification expired before the shift starts", () => {
    const agent = makeAgent("a", { GUARD_LICENSE: "2026-09-14", CROWD_CONTROL: "2027-01-01" });
    expect(holdsValidQualifications(agent, shift)).toBe(false);
  });

  it("passes when a qualification expires on the shift's start date", () => {
    const agent = makeAgent("a", { GUARD_LICENSE: "2026-09-15", CROWD_CONTROL: "2027-01-01" });
    expect(holdsValidQualifications(agent, shift)).toBe(true);
  });

  it("ignores expired qualifications the shift does not require", () => {
    const agent = makeAgent("a", { GUARD_LICENSE: "2027-01-01", CROWD_CONTROL: "2027-01-01", FIRST_AID: "2020-01-01" });
    expect(holdsValidQualifications(agent, shift)).toBe(true);
  });

  it("passes for everyone when the shift requires nothing", () => {
    expect(holdsValidQualifications(makeAgent("a"), makeShift("open", "2026-09-15T08:00:00Z", "2026-09-15T16:00:00Z"))).toBe(true);
  });
});

describe("isBookedDuring", () => {
  const agent = makeAgent("a");

  it("is true when the agent is already on this very shift", () => {
    const data: ScheduleData = { agents: [agent], shifts: [overnight], assignments: [book(agent, overnight)] };
    expect(isBookedDuring(agent, overnight, data)).toBe(true);
  });

  it("is false when the agent's other booking only touches this shift", () => {
    const morning = makeShift("morning", "2026-09-16T06:00:00Z", "2026-09-16T14:00:00Z");
    const data: ScheduleData = { agents: [agent], shifts: [overnight, morning], assignments: [book(agent, morning)] };
    expect(isBookedDuring(agent, overnight, data)).toBe(false);
  });

  it("ignores assignments that point to an unknown shift", () => {
    const data: ScheduleData = {
      agents: [agent],
      shifts: [overnight],
      assignments: [{ id: "asg_x", shiftId: "missing", agentId: agent.id }],
    };
    expect(isBookedDuring(agent, overnight, data)).toBe(false);
  });
});

describe("findAvailableAgents", () => {
  it("still excludes double-booked agents when the shift requires nothing", () => {
    const busy = makeAgent("busy");
    const free = makeAgent("free");
    const open = makeShift("open", "2026-09-15T23:00:00Z", "2026-09-16T03:00:00Z");
    const data: ScheduleData = { agents: [busy, free], shifts: [overnight, open], assignments: [book(busy, overnight)] };

    expect(findAvailableAgents(open, data)).toEqual([free]);
  });

  it("returns an empty list when nobody qualifies", () => {
    const shift = makeShift("s", "2026-09-15T08:00:00Z", "2026-09-15T16:00:00Z", ["FIRST_AID"]);
    const data: ScheduleData = { agents: [makeAgent("a")], shifts: [shift], assignments: [] };

    expect(findAvailableAgents(shift, data)).toEqual([]);
  });
});
