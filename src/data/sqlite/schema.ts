import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

export const qualifications = sqliteTable("qualifications", {
  code: text().primaryKey(),
});

export const agents = sqliteTable("agents", {
  id: text().primaryKey(),
  name: text().notNull(),
});

export const agentQualifications = sqliteTable(
  "agent_qualifications",
  {
    agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
    code: text().notNull().references(() => qualifications.code),
    /** YYYY-MM-DD; text so it compares chronologically, like the domain does. */
    expiresOn: text("expires_on").notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.code] })],
);

export const shifts = sqliteTable(
  "shifts",
  {
    id: text().primaryKey(),
    site: text().notNull(),
    startAt: integer("start_at", { mode: "timestamp_ms" }).notNull(),
    endAt: integer("end_at", { mode: "timestamp_ms" }).notNull(),
    headcount: integer().notNull(),
  },
  (table) => [
    check("shift_ends_after_start", sql`${table.endAt} > ${table.startAt}`),
    check("shift_headcount_positive", sql`${table.headcount} > 0`),
    index("shifts_window_idx").on(table.startAt, table.endAt),
  ],
);

export const shiftRequirements = sqliteTable(
  "shift_requirements",
  {
    shiftId: text("shift_id").notNull().references(() => shifts.id, { onDelete: "cascade" }),
    code: text().notNull().references(() => qualifications.code),
  },
  (table) => [primaryKey({ columns: [table.shiftId, table.code] })],
);

export const assignments = sqliteTable(
  "assignments",
  {
    id: text().primaryKey(),
    shiftId: text("shift_id").notNull().references(() => shifts.id),
    agentId: text("agent_id").notNull().references(() => agents.id),
  },
  (table) => [
    unique("assignments_shift_agent_unique").on(table.shiftId, table.agentId),
    index("assignments_agent_idx").on(table.agentId),
  ],
);
