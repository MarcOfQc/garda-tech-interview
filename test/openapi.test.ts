import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SqliteScheduleStore } from "../src/data/sqlite/sqlite-schedule-store.js";
import { buildApp } from "../src/http/app.js";
import { openSeededStore } from "./support/sqlite-store.js";

describe("OpenAPI documentation", () => {
  let store: SqliteScheduleStore;
  let app: ReturnType<typeof buildApp>;

  beforeAll(async () => {
    store = await openSeededStore();
    app = buildApp(store);
    await app.ready();
  });

  afterAll(() => store.close());

  it("serves an OpenAPI 3 spec describing both endpoints", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const spec = response.json();

    expect(response.statusCode).toBe(200);
    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/api/shifts/{id}/assignments",
      "/api/shifts/{id}/available-agents",
    ]);
  });

  it("documents every status code the endpoints can return", async () => {
    const spec = (await app.inject({ method: "GET", url: "/docs/json" })).json();

    expect(Object.keys(spec.paths["/api/shifts/{id}/available-agents"].get.responses).sort()).toEqual(["200", "404"]);
    expect(Object.keys(spec.paths["/api/shifts/{id}/assignments"].post.responses).sort()).toEqual([
      "201",
      "400",
      "404",
      "409",
      "422",
    ]);
  });

  it("documents the booking body from the same Zod schema that validates it", async () => {
    const spec = (await app.inject({ method: "GET", url: "/docs/json" })).json();
    const body = spec.paths["/api/shifts/{id}/assignments"].post.requestBody.content["application/json"].schema;

    expect(body.required).toEqual(["agentId"]);
    expect(body.properties.agentId).toMatchObject({ type: "string", minLength: 1 });
  });

  it("serves the Swagger UI page", async () => {
    const response = await app.inject({ method: "GET", url: "/docs/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
  });
});
