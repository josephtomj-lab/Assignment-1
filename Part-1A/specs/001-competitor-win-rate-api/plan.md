# Implementation Plan: Competitor Deal Win-Rate API

**Branch**: `001-competitor-win-rate-api` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-competitor-win-rate-api/spec.md`

## Summary

Build a small, single-process REST service for recording and reviewing deal outcomes. Use
Node.js 20+ in CommonJS mode, with application imports limited to native `http` and `fs`.
Keep request routing and validation in `src/server.js` and JSON persistence in
`src/store.js`. Store records in a replace-on-write JSON array; validate all behavior with
an isolated `node:test` integration suite using an ephemeral port and temporary data file.

The user selected the existing constitution's stricter `http`/`fs` module policy over the
initial plan request to include `path`, `crypto`, and `url`. The design therefore avoids
those module imports: it uses string-based path handling, collision-checked process/time
identifiers, and Node's global `URL` for request parsing.

## Technical Context

**Language/Version**: Node.js 20+, CommonJS

**Primary Dependencies**: No external npm dependencies. Application modules: `node:http`
and `node:fs`. Tests use the constitution-mandated `node:test` and `node:assert/strict`.

**Storage**: Synchronous JSON file storage; `DEALS_FILE` overrides the default
`src/../data/deals.json` path.

**Testing**: `node --test test/*.test.js`; HTTP integration tests use a server bound to
port `0` and a temporary JSON file.

**Target Platform**: Node.js 20+ on supported Windows, macOS, and Linux environments.

**Project Type**: Single-project HTTP web service.

**Performance Goals**: No throughput or latency SLA is specified. The 10,240-byte request
limit and correctness of the full collection and summary are the measurable constraints.
Synchronous file operations are intentionally scoped to the small, internal analyst
workload and block the event loop while running.

**Constraints**: No external packages; application imports limited to `http` and `fs`;
CommonJS; maximum request body 10,240 bytes; all responses are JSON; no secrets or
machine-specific paths; no authentication, deal editing/deletion, or external database.
Only one service process writes the JSON file at a time.

**Scale/Scope**: One JSON collection with all matching records returned by `GET /deals`;
pagination and multi-process file coordination are not included.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Research Gate

- **Runtime & Stack Discipline — PASS**: Node.js 20+, CommonJS, and no external packages.
  Application imports are `node:http` and `node:fs` only. Test-only imports
  `node:test` and `node:assert/strict` are explicitly required by the constitution.
- **Modular Service Boundaries — PASS**: HTTP logic stays in `src/server.js`;
  JSON file operations stay in `src/store.js`. Importing the server does not listen.
- **API & Error Contract — PASS**: Contract uses JSON for every response, HTTP 400 for
  validation failures, and the specified error-object shape and reason strings.
- **Security & Payload Hygiene — PASS**: Count actual request bytes and reject bodies
  above 10,240 bytes. Resolve the default path relative to the source directory; do not
  embed secrets or developer-specific paths.
- **Deterministic Quality Gates — PASS**: Each acceptance criterion maps to deterministic
  assertions, including exact status codes and JSON contract checks.

The user resolved the only module-policy conflict by choosing to keep the constitution.
No exception or constitution amendment is needed.

### Post-Design Gate

- **Runtime & Stack Discipline — PASS**: The design uses no application module imports
  beyond `node:http` and `node:fs`; it introduces no package dependencies.
- **Modular Service Boundaries — PASS**: The server/store split and import-safe server
  export are retained.
- **API & Error Contract — PASS**: The contract documents success, validation, unknown
  route, and storage-error responses with JSON content type.
- **Security & Payload Hygiene — PASS**: Streamed-byte enforcement, relative storage
  paths, and isolated test data meet the stated constraints.
- **Deterministic Quality Gates — PASS**: The test matrix covers the success, validation,
  filtering, boundary, persistence, and routing criteria with exact HTTP assertions.

## Project Structure

### Documentation (this feature)

```text
specs/001-competitor-win-rate-api/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── http-api.md
└── tasks.md                 # Created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
package.json                 # Minimal metadata and start/test scripts; no dependencies
src/
├── server.js                # HTTP routing, request parsing, validation, responses
└── store.js                 # JSON reads, initialization, and atomic replacement
test/
└── api.test.js              # node:test integration and acceptance tests
data/
└── deals.json               # Created on demand by the service; not required in source control
```

**Structure Decision**: Use one CommonJS project with the exact server/store boundaries
from the constitution and one integration test file as requested. The `data` directory
and JSON file are created at runtime when the default store is first initialized.

## Test Coverage Plan

Implement the following deterministic acceptance cases in `test/api.test.js`. Keep the
shared exported server's tests sequential, set `DEALS_FILE` to a unique temporary file,
and register cleanup to close the listener, restore the environment, and remove only the
test-created directory.

| Area | Cases and assertions |
|---|---|
| Import and startup | Importing exports `{ server, handleRequest }` and leaves `server.listening` false; start on port `0`, then close cleanly. |
| Storage setup | Missing test file initializes as `[]`; missing parent is created; configured `DEALS_FILE` is used; test the default resolver without writing to the repository's default data file. |
| Create success | Valid record returns exactly HTTP 201 and JSON content type; trimmed name and submitted fields match; `id` is non-empty and unique across records; `recordedAt` parses as ISO-8601 UTC; subsequent GET finds the record. |
| Persistence | A created record remains after closing and restarting the server with the same test file. |
| Name validation | Missing, wrong type, whitespace-only, and 101-character names fail; 1-character and 100-character trimmed names pass; surrounding whitespace is trimmed; an astral Unicode character counts as one code point. |
| Numeric validation | Missing, string, null, zero, negative, and `1e400` values fail; a positive finite number passes without coercion. |
| Enum validation | Missing, wrong-type, unknown, and incorrectly cased `domain` and `status` fail with the specified first-error message. |
| JSON body validation | Malformed JSON and non-object JSON return HTTP 400; additional object properties are ignored and not returned. |
| Body size | A valid body of exactly 10,240 bytes is not rejected for size; a 10,241-byte body returns HTTP 400, including when sent chunked without `Content-Length`; rejected requests do not change the stored collection. |
| Collection summary | Empty, all-Won, all-Lost, and mixed datasets return exact totals; verify `0`, `100`, and a fractional rate rounded to two decimal places. |
| Domain filtering | Each allowed domain returns only matching records and matching summary; a valid domain with no records returns an empty result; an unknown or incorrectly cased value returns HTTP 400. |
| Routing | Unsupported path, unsupported method, and wrong-case path return exactly HTTP 404 and `{ "error": "Not found" }`. |
| Response contract | Every tested success and failure has JSON content type; validation responses assert exact HTTP 400 and exact error JSON. A controlled storage failure returns HTTP 500 and the fixed generic JSON error without a path. |

## Complexity Tracking

No constitution violations or additional projects are proposed. The module restriction
requires small string-based path and identifier helpers; the trade-offs are documented
in [research.md](./research.md).
