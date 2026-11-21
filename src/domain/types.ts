export interface Qualification {
  code: string;
  /** Calendar date (YYYY-MM-DD); the qualification is valid through the end of that day, UTC. */
  expiresOn: string;
}

export interface Agent {
  id: string;
  name: string;
  qualifications: Qualification[];
}

export interface Shift {
  id: string;
  site: string;
  start: Date;
  end: Date;
  requiredQualifications: string[];
  headcount: number;
}

export interface Assignment {
  id: string;
  shiftId: string;
  agentId: string;
}

export interface ScheduleData {
  agents: Agent[];
  shifts: Shift[];
  assignments: Assignment[];
}
