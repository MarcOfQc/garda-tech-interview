import path from "node:path";
import Database from "better-sqlite3";
import { and, asc, eq, gt, inArray, lt } from "drizzle-orm";
import { type BetterSQLite3Database, drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { ScheduleStore, ShiftSchedule } from "../../application/schedule-store.js";
import { nextAssignmentId } from "../../domain/booking.js";
import type { Assignment, ScheduleData, Shift } from "../../domain/types.js";
import * as schema from "./schema.js";

const { agentQualifications, agents, assignments, qualifications, shiftRequirements, shifts } = schema;

const migrationsFolder = path.resolve(import.meta.dirname, "../../../drizzle");

export class SqliteScheduleStore implements ScheduleStore {
  private constructor(
    private readonly sqlite: Database.Database,
    private readonly db: BetterSQLite3Database<typeof schema>,
  ) {}

  /** Opens (or creates) the database file and applies pending migrations. */
  static open(filename: string): SqliteScheduleStore {
    const sqlite = new Database(filename, { timeout: 5000 });
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");

    const db = drizzle({ client: sqlite, schema });
    migrate(db, { migrationsFolder });
    return new SqliteScheduleStore(sqlite, db);
  }

  close(): void {
    this.sqlite.close();
  }

  // BEGIN IMMEDIATE takes the write lock up front, so a second booking waits instead of reading stale data.
  atomically<T>(work: () => T): T {
    return this.sqlite.transaction(work).immediate();
  }

  loadShiftSchedule(shiftId: string, agentId?: string): ShiftSchedule | undefined {
    const target = this.db.select().from(shifts).where(eq(shifts.id, shiftId)).get();
    if (!target) return undefined;

    const overlappingShifts = this.db
      .select()
      .from(shifts)
      .where(and(lt(shifts.startAt, target.endAt), gt(shifts.endAt, target.startAt)))
      .all();
    const shiftIds = overlappingShifts.map((s) => s.id);

    const requirements = this.db.select().from(shiftRequirements).where(inArray(shiftRequirements.shiftId, shiftIds)).all();
    const bookings = this.db.select().from(assignments).where(inArray(assignments.shiftId, shiftIds)).all();
    const agentRows = this.db
      .select()
      .from(agents)
      .where(agentId === undefined ? undefined : eq(agents.id, agentId))
      .orderBy(asc(agents.id))
      .all();
    const heldQualifications = this.db
      .select()
      .from(agentQualifications)
      .where(agentId === undefined ? undefined : eq(agentQualifications.agentId, agentId))
      .all();

    const toShift = (row: typeof shifts.$inferSelect): Shift => ({
      id: row.id,
      site: row.site,
      start: row.startAt,
      end: row.endAt,
      headcount: row.headcount,
      requiredQualifications: requirements.filter((r) => r.shiftId === row.id).map((r) => r.code),
    });

    return {
      shift: toShift(target),
      data: {
        shifts: overlappingShifts.map(toShift),
        assignments: bookings,
        agents: agentRows.map((agent) => ({
          ...agent,
          qualifications: heldQualifications
            .filter((q) => q.agentId === agent.id)
            .map(({ code, expiresOn }) => ({ code, expiresOn })),
        })),
      },
    };
  }

  addAssignment(shiftId: string, agentId: string): Assignment {
    const existingIds = this.db.select({ id: assignments.id }).from(assignments).all();
    const assignment = { id: nextAssignmentId(existingIds.map((row) => row.id)), shiftId, agentId };
    this.db.insert(assignments).values(assignment).run();
    return assignment;
  }

  /** Loads `data` only into an empty database; returns whether it did. */
  seedIfEmpty(data: ScheduleData): boolean {
    return this.atomically(() => {
      const hasAgents = this.db.select({ id: agents.id }).from(agents).limit(1).get();
      const hasShifts = this.db.select({ id: shifts.id }).from(shifts).limit(1).get();
      if (hasAgents || hasShifts) return false;

      const codes = new Set([
        ...data.agents.flatMap((agent) => agent.qualifications.map((q) => q.code)),
        ...data.shifts.flatMap((shift) => shift.requiredQualifications),
      ]);

      this.insertAll(qualifications, [...codes].map((code) => ({ code })));
      this.insertAll(agents, data.agents.map(({ id, name }) => ({ id, name })));
      this.insertAll(
        agentQualifications,
        data.agents.flatMap((agent) => agent.qualifications.map((q) => ({ agentId: agent.id, ...q }))),
      );
      this.insertAll(
        shifts,
        data.shifts.map((s) => ({ id: s.id, site: s.site, startAt: s.start, endAt: s.end, headcount: s.headcount })),
      );
      this.insertAll(
        shiftRequirements,
        data.shifts.flatMap((s) => s.requiredQualifications.map((code) => ({ shiftId: s.id, code }))),
      );
      this.insertAll(assignments, data.assignments);
      return true;
    });
  }

  private insertAll<T extends (typeof schema)[keyof typeof schema]>(table: T, rows: T["$inferInsert"][]): void {
    if (rows.length > 0) this.db.insert(table).values(rows).run();
  }
}
