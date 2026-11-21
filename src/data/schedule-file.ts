import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ScheduleData } from "../domain/types.js";

const utcInstant = z.iso.datetime().transform((value) => new Date(value));

const scheduleFileSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      qualifications: z.array(z.object({ code: z.string(), expiresOn: z.iso.date() })),
    }),
  ),
  shifts: z.array(
    z
      .object({
        id: z.string(),
        site: z.string(),
        start: utcInstant,
        end: utcInstant,
        requiredQualifications: z.array(z.string()),
        headcount: z.int().positive(),
      })
      .refine((shift) => shift.end > shift.start, { message: "Shift must end after it starts" }),
  ),
  assignments: z.array(z.object({ id: z.string(), shiftId: z.string(), agentId: z.string() })),
});

export function parseScheduleData(json: unknown): ScheduleData {
  return scheduleFileSchema.parse(json);
}

export async function loadScheduleData(filePath: string): Promise<ScheduleData> {
  return parseScheduleData(JSON.parse(await readFile(filePath, "utf8")));
}

const toUtcString = (instant: Date) => instant.toISOString().replace(".000Z", "Z");

export function serializeScheduleData(data: ScheduleData): string {
  const shifts = data.shifts.map((shift) => ({
    ...shift,
    start: toUtcString(shift.start),
    end: toUtcString(shift.end),
  }));
  return `${JSON.stringify({ ...data, shifts }, null, 2)}\n`;
}
