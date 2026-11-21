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
| `DATA_FILE` | `data.json` | Schedule data: loaded at startup, written on each booking |

```sh
curl http://localhost:3000/api/shifts/shf_2/available-agents
# [{"id":"agt_3","name":"Marc Tremblay"}]

curl -X POST http://localhost:3000/api/shifts/shf_2/assignments \
  -H "Content-Type: application/json" -d '{"agentId":"agt_3"}'
# 201 {"id":"asg_2","shiftId":"shf_2","agentId":"agt_3"}
```

Bookings are written to `data.json`. Run `git checkout data.json` to reset the sample data.

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

### `POST /api/shifts/{id}/assignments`

Books an agent onto a shift. Body: `{ "agentId": "agt_3" }`.

| Case | Response |
|---|---|
| Booked | `201 { "id", "shiftId", "agentId" }`, saved to `data.json` |
| Missing or empty `agentId` | `400` |
| Unknown shift, then unknown agent | `404 { "message" }` |
| Shift already at `headcount` | `409 { "message": "Shift {id} is full" }` |
| Agent not available (same rules as the GET) | `422 { "message" }` |

A rejected booking changes nothing, in memory or on disk.

## Project layout

```text
src/
  domain/              pure scheduling rules, no I/O or framework code
    types.ts
    availability.ts    the three availability rules; isAvailable() is shared by GET and POST
    booking.ts         full-shift check, booking decision, next assignment id
  data/
    schedule-file.ts   data.json format: parse/validate on read, serialize on write
    schedule-store.ts  ScheduleStore interface: read the data, add an assignment
    json-file-schedule-store.ts   ScheduleStore backed by data.json
  http/
    app.ts             Fastify app and routes; request/response contracts as Zod schemas
  main.ts              entry point: open the store, start the server
test/                  unit tests for the rules, store tests, HTTP tests via fastify.inject()
```

The availability and booking rules are plain functions that take the schedule data. They can be tested without starting a server or touching a file. `buildApp(store)` receives a `ScheduleStore`, so the HTTP tests run against a temporary copy of `data.json` or an in-memory store.

## Assumptions

### Availability

- **Expiry is inclusive for the whole day (UTC).** `expiresOn` is a calendar date, but a shift start is an instant. A qualification expiring `2026-09-15` is still valid for a shift starting `2026-09-15T22:00:00Z`. Only the shift's start is checked, as the brief specifies, not its end.
- **Overlap uses half-open windows.** `[start, end)`: two shifts overlap when `a.start < b.end && b.start < a.end`. Shifts that only touch don't overlap. Because times are full ISO instants, overnight shifts need no special handling.
- **An agent already on the shift is not "available" for it.** This falls out of the overlap rule, since a shift overlaps itself. Booking the same agent onto the same shift twice is therefore a `422`.
- **`headcount` doesn't affect availability.** The GET lists who *could* work the shift. A full shift is a booking concern, reported as `409`.
- **The data file is validated at startup.** Times must be UTC ISO-8601 (`Z` suffix), dates must be `YYYY-MM-DD`, and a shift must end after it starts. Invalid data fails fast at boot rather than producing wrong answers.
- **Assignments that reference an unknown shift are ignored** when checking double-booking.

### Booking

- **Check order: 400 → 404 (shift, then agent) → 409 → 422.** When a shift is full *and* the agent is unavailable, `409` wins: no agent could take that spot, whoever asks.
- **Assignment ids continue the `asg_<n>` sequence** after the highest existing number. Ids that don't follow the pattern are ignored.
- **Writes are atomic on disk.** The file is written to `data.json.tmp`, then renamed over `data.json`, so a crash mid-write can't leave a truncated file. The in-memory data is only updated after the write succeeds, so a failed write changes nothing.
- **Writes are synchronous on purpose.** The booking handler reads, checks and writes without yielding to the event loop, so two requests in this single Node process can't both take the last spot. This holds for one process only; it isn't a substitute for real transactions.
- **The file is rewritten in a normalized format** (2-space indentation). The data is unchanged, but the first booking reformats the assignments list.
