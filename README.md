# Shift Scheduling API

A small REST API for scheduling security agents onto shifts. It's built with TypeScript, [Fastify](https://fastify.dev) and [Zod](https://zod.dev).

## Running it

Requires Node.js 22 or later.

```sh
npm install
npm start          # builds, then serves on http://localhost:3000
npm run dev        # watch mode, no build step
npm test           # unit + HTTP tests
npm run typecheck
```

Environment variables (optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_FILE` | `data.json` | Schedule data loaded at startup |

```sh
curl http://localhost:3000/api/shifts/shf_2/available-agents
# [{"id":"agt_3","name":"Marc Tremblay"}]
```

## Endpoints

### `GET /api/shifts/{id}/available-agents`

Returns the agents who can work the shift, as `[{ "id", "name" }]`.

| Case | Response |
|---|---|
| Shift exists | `200` with an array (empty if nobody is available) |
| Unknown shift | `404 { "message": "Shift {id} not found" }` |

An agent is available when they:
1. hold every qualification in `requiredQualifications`,
2. each of those has `expiresOn` on or after the shift's start date, and
3. have no assignment on a shift whose time window overlaps this one.

## Project layout

```text
src/
  domain/          pure scheduling rules, no I/O or framework code
    types.ts
    availability.ts
  data/
    load-schedule.ts   reads and validates data.json at startup
  http/
    app.ts         Fastify app and routes; request/response contracts as Zod schemas
  main.ts          entry point: load data, start server
test/              unit tests for the rules, HTTP tests via fastify.inject()
```

The availability rules are plain functions that take the shift and the schedule data. They can be tested without starting a server or reading a file. `buildApp(data)` receives its data as a parameter, so tests can inject their own.

## Assumptions

- **Expiry is inclusive for the whole day (UTC).** `expiresOn` is a calendar date, but a shift start is an instant. A qualification expiring `2026-09-15` is still valid for a shift starting `2026-09-15T22:00:00Z`. Only the shift's start is checked, as the brief specifies, not its end.
- **Overlap uses half-open windows.** `[start, end)`: two shifts overlap when `a.start < b.end && b.start < a.end`. Shifts that only touch don't overlap. Because times are full ISO instants, overnight shifts need no special handling.
- **An agent already on the shift is not "available" for it.** This falls out of the overlap rule, since a shift overlaps itself.
- **`headcount` doesn't affect availability.** It isn't one of the three availability rules.
- **The data file is validated at startup.** Times must be UTC ISO-8601 (`Z` suffix), dates must be `YYYY-MM-DD`, and a shift must end after it starts. Invalid data fails fast at boot rather than producing wrong answers.
- **Assignments that reference an unknown shift are ignored** when checking double-booking.
