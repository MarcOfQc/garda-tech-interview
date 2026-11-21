import type { Agent, Assignment, Shift } from "../../src/domain/types.js";

export function makeShift(
  id: string,
  start: string,
  end: string,
  requiredQualifications: string[] = [],
  headcount = 1,
): Shift {
  return { id, site: "Test site", start: new Date(start), end: new Date(end), requiredQualifications, headcount };
}

export function makeAgent(id: string, qualifications: Record<string, string> = {}): Agent {
  return {
    id,
    name: `Agent ${id}`,
    qualifications: Object.entries(qualifications).map(([code, expiresOn]) => ({ code, expiresOn })),
  };
}

export function book(agent: Agent, shift: Shift): Assignment {
  return { id: `asg_${agent.id}_${shift.id}`, shiftId: shift.id, agentId: agent.id };
}
