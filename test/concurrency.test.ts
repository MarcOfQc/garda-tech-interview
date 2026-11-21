import { type ChildProcess, spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SqliteScheduleStore } from "../src/data/sqlite/sqlite-schedule-store.js";
import { makeTempDir } from "./support/paths.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const ports = [3201, 3202];
const agentIds = ["agt_1", "agt_2", "agt_3", "agt_4", "agt_5", "agt_6"];

const seed = {
  agents: agentIds.map((id) => ({ id, name: id, qualifications: [] })),
  shifts: [
    { id: "shf_1", site: "S", start: "2026-09-15T22:00:00Z", end: "2026-09-16T06:00:00Z", requiredQualifications: [], headcount: 1 },
  ],
  assignments: [],
};

function startServer(port: number, env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: projectRoot,
    env: { ...process.env, ...env, PORT: String(port) },
  });
  return new Promise((resolve, reject) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      if (chunk.toString().includes("Server listening")) resolve(child);
    });
    child.on("exit", (code) => reject(new Error(`Server on ${port} exited with ${code}`)));
  });
}

// Two separate processes share one database file, so the guarantee must come from SQLite, not from Node's event loop.
describe("two server processes booking the last spot at the same time", () => {
  let servers: ChildProcess[] = [];
  let databaseFile: string;

  beforeAll(async () => {
    const dir = await makeTempDir();
    databaseFile = path.join(dir, "schedule.db");
    const seedFile = path.join(dir, "seed.json");
    await writeFile(seedFile, JSON.stringify(seed));

    const env = { DATABASE_FILE: databaseFile, SEED_FILE: seedFile };
    for (const port of ports) servers.push(await startServer(port, env));
  }, 30_000);

  afterAll(() => {
    for (const server of servers) server.kill();
    servers = [];
  });

  it("lets exactly one booking win; the rest get 409", async () => {
    const responses = await Promise.all(
      agentIds.map((agentId, i) =>
        fetch(`http://localhost:${ports[i % ports.length]}/api/shifts/shf_1/assignments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId }),
        }),
      ),
    );

    const statuses = responses.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);

    const store = SqliteScheduleStore.open(databaseFile);
    expect(store.loadShiftSchedule("shf_1")?.data.assignments).toHaveLength(1);
    store.close();
  });
});
