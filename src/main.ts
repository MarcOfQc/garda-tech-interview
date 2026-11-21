import { loadScheduleData } from "./data/schedule-file.js";
import { SqliteScheduleStore } from "./data/sqlite/sqlite-schedule-store.js";
import { buildApp } from "./http/app.js";

const databaseFile = process.env.DATABASE_FILE ?? "schedule.db";
const seedFile = process.env.SEED_FILE ?? "data.json";
const port = Number(process.env.PORT ?? 3000);

const store = SqliteScheduleStore.open(databaseFile);
const app = buildApp(store, { logger: true });

if (store.seedIfEmpty(await loadScheduleData(seedFile))) {
  app.log.info(`Seeded ${databaseFile} from ${seedFile}`);
}

app.addHook("onClose", () => store.close());
await app.listen({ port });
