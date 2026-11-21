import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/data/sqlite/schema.ts",
  out: "./drizzle",
});
