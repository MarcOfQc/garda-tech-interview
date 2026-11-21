import { JsonFileScheduleStore } from "./data/json-file-schedule-store.js";
import { buildApp } from "./http/app.js";

const dataFile = process.env.DATA_FILE ?? "data.json";
const port = Number(process.env.PORT ?? 3000);

const app = buildApp(await JsonFileScheduleStore.open(dataFile), { logger: true });
await app.listen({ port });
