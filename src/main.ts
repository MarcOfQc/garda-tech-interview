import { loadScheduleData } from "./data/load-schedule.js";
import { buildApp } from "./http/app.js";

const dataFile = process.env.DATA_FILE ?? "data.json";
const port = Number(process.env.PORT ?? 3000);

const app = buildApp(await loadScheduleData(dataFile), { logger: true });
await app.listen({ port });
