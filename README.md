# Shift Scheduling API

A small REST API for scheduling security agents onto shifts. It's built with TypeScript, [Fastify](https://fastify.dev), [Zod](https://zod.dev), SQLite and [Drizzle ORM](https://orm.drizzle.team).

## Running it

Requires Node.js 22 or later. Nothing else: SQLite runs inside the process, so there's no database server to install or start.

```sh
npm install
npm start          # builds, then serves on http://localhost:3000
npm run dev        # watch mode, no build step
npm test           # unit, database, HTTP and concurrency tests
npm run typecheck
```

On first start, the app creates `schedule.db`, applies the migrations in `drizzle/`, and loads `data.json` into it. Later starts reuse the database as it is, so bookings survive restarts. To start over from the seed, stop the app and delete `schedule.db` together with `schedule.db-wal` and `schedule.db-shm` if present. The database runs in WAL mode, and the `-wal` file can hold committed changes that aren't in `schedule.db` yet.

```sh
rm -f schedule.db schedule.db-wal schedule.db-shm                                 # macOS / Linux
Remove-Item schedule.db, schedule.db-wal, schedule.db-shm -ErrorAction Ignore     # Windows PowerShell
```

Environment variables (optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_FILE` | `schedule.db` | SQLite database file (created if missing) |
| `SEED_FILE` | `data.json` | Data loaded into an empty database at startup; never read at request time |

```sh
curl http://localhost:3000/api/shifts/shf_2/available-agents
# [{"id":"agt_3","name":"Marc Tremblay"}]

curl -X POST http://localhost:3000/api/shifts/shf_2/assignments \
  -H "Content-Type: application/json" -d '{"agentId":"agt_3"}'
# 201 {"id":"asg_2","shiftId":"shf_2","agentId":"agt_3"}
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

### `POST /api/shifts/{id}/assignments`

Books an agent onto a shift. Body: `{ "agentId": "agt_3" }`.

| Case | Response |
|---|---|
| Booked | `201 { "id", "shiftId", "agentId" }`, stored in the database |
| Missing or empty `agentId` | `400` |
| Unknown shift, then unknown agent | `404 { "message" }` |
| Shift already at `headcount` | `409 { "message": "Shift {id} is full" }` |
| Agent not available (same rules as the GET) | `422 { "message" }` |

A rejected booking changes nothing.

## Project layout

```text
src/
  domain/              pure scheduling rules, no I/O or framework code
    types.ts
    availability.ts    the three availability rules; isAvailable() is shared by GET and POST
    booking.ts         full-shift check, booking decision, next assignment id
  application/
    schedule-store.ts  ScheduleStore port: what the app needs from storage
    book-agent.ts      booking use case: load, decide, insert, all inside one atomic block
  data/
    schedule-file.ts   reads and validates the seed file (data.json)
    sqlite/
      schema.ts        Drizzle schema (source of the migrations)
      sqlite-schedule-store.ts   ScheduleStore backed by SQLite
  http/
    app.ts             Fastify app and routes; request/response contracts as Zod schemas
  main.ts              entry point: open and seed the database, start the server
drizzle/               generated SQL migrations (npm run db:generate after a schema change)
test/
```

The domain rules didn't change when the storage moved from a JSON file to SQLite. The store loads the slice of data a shift needs, and the same pure functions decide availability and bookings. `buildApp(store)` receives a `ScheduleStore`, so the HTTP tests run against a fresh in-memory SQLite database.

## Why SQLite

The brief asks for a production choice. The deciding factor here was that the full scope of the system isn't known, so I kept it simple:

- **No setup for whoever runs it.** `npm install && npm start` is still all it takes. Postgres would need Docker (or a local install) and a running container before the first request.
- **It does what this service needs.** Real transactions, foreign keys, check constraints, and safe concurrent writers across processes (see below).
- **Its limit is known.** SQLite is a single file on one machine. It fits one server instance, or several processes on the same host. It doesn't fit several app servers on different machines sharing one database.

**When to move to Postgres:** once the API has to run on more than one machine, or other services need the same data. The move is contained: the schema is Drizzle code, `SqliteScheduleStore` is the only class that talks to the database, and in Postgres the atomic block would become `SELECT … FOR UPDATE` on the shift and agent rows. The domain, the use case and the routes wouldn't change.

## Schema

```text
qualifications        (code PK)
agents                (id PK, name)
agent_qualifications  (agent_id FK → agents, code FK → qualifications, expires_on)   PK(agent_id, code)
shifts                (id PK, site, start_at, end_at, headcount)   CHECK end_at > start_at, CHECK headcount > 0
shift_requirements    (shift_id FK → shifts, code FK → qualifications)              PK(shift_id, code)
assignments           (id PK, shift_id FK → shifts, agent_id FK → agents)            UNIQUE(shift_id, agent_id)
```

- **Qualifications are normalized.** The `qualifications` table is the list of known codes. An agent's qualification (with its own expiry) and a shift's requirement both reference it, so a misspelled code can't sneak in.
- **Times are stored as integer milliseconds (UTC)**, so overlap checks are numeric comparisons. Indexes: `shifts(start_at, end_at)` for the overlap lookup, `assignments(agent_id)`, and the unique `(shift_id, agent_id)`.
- **`expires_on` is `YYYY-MM-DD` text**, which sorts chronologically and matches the domain type.
- **The unique `(shift_id, agent_id)` constraint is a backstop:** even a bug in the code can't book one agent twice onto the same shift.

## Keeping bookings safe under concurrency

The booking use case runs **load → check → insert inside one `BEGIN IMMEDIATE` transaction**:

```ts
store.atomically(() => {
  const schedule = store.loadShiftSchedule(shiftId, agentId);  // read inside the transaction
  // … the same pure checks: shift full? agent available?
  return store.addAssignment(shiftId, agentId);
});
```

- `BEGIN IMMEDIATE` takes SQLite's write lock **at the start** of the transaction, not at the first write. A second booking waits (up to 5 s) for the first to commit, then reads the updated data and gets a `409`.
- With a plain `BEGIN` (deferred), two transactions can read the same "1 spot left" state, and the second one then fails when it tries to write. SQLite still prevents the double booking, but that request gets a `500` instead of a clean `409`. `test/concurrency.test.ts` showed exactly that when I switched to deferred.
- **The test:** it starts **two separate server processes** on one database file and fires six bookings for a one-spot shift at the same time. Exactly one gets `201`; the other five get `409`. Separate processes matter: inside one Node process, synchronous code can't interleave anyway, so a single-process test wouldn't prove anything about the database.

## Assumptions

### Availability

- **Expiry is inclusive for the whole day (UTC).** `expiresOn` is a calendar date, but a shift start is an instant. A qualification expiring `2026-09-15` is still valid for a shift starting `2026-09-15T22:00:00Z`. Only the shift's start is checked, as the brief specifies, not its end.
- **Overlap uses half-open windows.** `[start, end)`: two shifts overlap when `a.start < b.end && b.start < a.end`. Shifts that only touch don't overlap. Because times are full instants, overnight shifts need no special handling.
- **An agent already on the shift is not "available" for it.** This falls out of the overlap rule, since a shift overlaps itself. Booking the same agent onto the same shift twice is therefore a `422`.
- **`headcount` doesn't affect availability.** The GET lists who *could* work the shift. A full shift is a booking concern, reported as `409`.
- **The seed file is validated before loading.** Times must be UTC ISO-8601 (`Z` suffix), dates must be `YYYY-MM-DD`, and a shift must end after it starts. Invalid data fails at startup.

### Booking

- **Check order: 400 → 404 (shift, then agent) → 409 → 422.** When a shift is full *and* the agent is unavailable, `409` wins: no agent could take that spot, whoever asks.
- **Assignment ids continue the `asg_<n>` sequence** after the highest existing number, computed inside the booking transaction.
- **Seeding happens once.** The seed is loaded only when the database has no agents and no shifts, inside a transaction, so two processes starting at the same time can't both seed it.
