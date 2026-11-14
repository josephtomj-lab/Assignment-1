---

description: "Ordered implementation tasks for the Competitor Deal Win-Rate API"
---

# Tasks: Competitor Deal Win-Rate API

**Input**: Design documents from `specs/001-competitor-win-rate-api/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Tests are included because the feature request explicitly requires deterministic binary tests using `node:test` and `node:assert/strict`. Write each story's tests first, verify they fail for the missing behavior, then implement.

**Organization**: Tasks are grouped by the prioritized user stories in `spec.md`. The project-level `.gitignore` is one directory above this project at `../.gitignore`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: The task can run in parallel with other marked tasks because it edits a separate file and has no unfinished dependency.
- **[Story]**: User-story label for tasks in story phases: `[US1]`, `[US2]`, or `[US3]`.
- Every task names the file or files to create, edit, or validate.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish the dependency-free Node.js project and keep generated deal data out of version control.

- [X] T001 [P] Create `package.json` with `"type": "commonjs"`, `"start": "node src/server.js"`, and `"test": "node --test test/*.test.js"`; declare no external dependencies.
- [X] T002 [P] Add `data/` to `../.gitignore` while preserving existing ignore rules, so the runtime JSON data file is not tracked.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Implement the shared persistence layer required by deal creation and collection reads.

- [X] T003 Implement synchronous JSON collection reads and writes in `src/store.js` using only `fs`; provide `resolveDataFile()` for the `process.env.DEALS_FILE` override or project-root `./data/deals.json` default, create missing parent folders, initialize a missing file as `[]`, and replace existing JSON through a same-directory temporary file and rename without deleting the old file first.

**Checkpoint**: Storage is available to the user-story work; no story can use persistent records until T003 is complete.

---

## Phase 3: User Story 1 - Record a Deal Outcome (Priority: P1) 🎯 MVP

**Goal**: Accept a valid deal, persist it, return its generated fields, and make it available in the collection.

**Independent Test**: With `DEALS_FILE` pointing to an isolated temporary file, start the imported server on port `0`, POST a valid record, assert HTTP 201 and the returned deal fields, then GET the collection and verify persistence. Restart the server against the same file and verify the record remains.

### Tests for User Story 1

> Write these tests first and confirm they fail before implementing the behavior.

- [X] T004 [US1] Create the `test/api.test.js` HTTP harness and valid-create tests using `node:test`, `node:assert/strict`, an isolated `DEALS_FILE`, port `0`, and cleanup hooks; assert import does not listen, `resolveDataFile()` selects the default and override without touching the default file, a missing configured file and parent initialize correctly, `POST /deals` returns 201 with trimmed fields, unique non-empty `id`, ISO-8601 UTC `recordedAt`, and JSON content type, `GET /deals` returns the created deal and summary, and the record survives a server restart.

### Implementation for User Story 1

- [X] T005 [US1] Implement the import-safe HTTP server in `src/server.js`, export `{ server, handleRequest }`, and call `server.listen(process.env.PORT || 3000)` only under `require.main === module`; add valid `POST /deals` creation and baseline `GET /deals` read-back with the required response shape and summary. Enforce the Deal rules verbatim: `competitorName` — “Trim whitespace; count Unicode code points; length 1–100 after trimming.”; `dealValueUSD` — “Finite and strictly greater than zero; no string coercion.”; `domain` — “Exact, case-sensitive enum: `BFSI`, `Healthcare`, `Retail`.”; `status` — “Exact, case-sensitive enum: `Won`, `Lost`.” Generate IDs from a timestamp, process ID, and increasing counter, checking stored IDs for collisions; generate `recordedAt` as ISO-8601 UTC and persist before returning 201. Use only `http` and `fs` module imports across `src/server.js` and `src/store.js`.

**Checkpoint**: User Story 1 works independently: a valid deal is persisted, returned, and visible in a subsequent collection read.

---

## Phase 4: User Story 2 - Review Deals and Win Rate (Priority: P2)

**Goal**: Return accurate collection summaries and support the case-sensitive domain filter.

**Independent Test**: Use a known dataset containing Won and Lost records across all three domains; assert the returned records and summary for unfiltered, filtered, empty, all-Won, all-Lost, and fractional-rate cases.

### Tests for User Story 2

> Add tests first and confirm the filter or summary case fails before implementation.

- [X] T006 [US2] Extend `test/api.test.js` with GET acceptance tests asserting HTTP 200, `total` equals returned record count, `won` and `lost` equal their respective status counts, `winRatePercent` is `0` for an empty set or `won / total * 100` rounded to two decimals, and each exact `domain` filter returns only matching deals with a recomputed summary.

### Implementation for User Story 2

- [X] T007 [US2] Complete `GET /deals` query handling and summary calculation in `src/server.js`; accept only the case-sensitive domains `BFSI`, `Healthcare`, and `Retail`, return HTTP 400 with the contract's exact error for an unknown domain, compute summary from the filtered result, round `winRatePercent` to two decimal places, and return zero when `total` is zero.

**Checkpoint**: User Story 2 returns correct unfiltered and filtered summaries, including empty and all-Won/all-Lost collections.

---

## Phase 5: User Story 3 - Receive Clear Rejections for Invalid Requests (Priority: P3)

**Goal**: Reject malformed or invalid input without changing stored data and return predictable JSON errors for unsupported requests.

**Independent Test**: Send each invalid, oversized, and unsupported request against an isolated store; assert exact HTTP status, exact error JSON, JSON content type, and no mutation for rejected deal submissions.

### Tests for User Story 3

> Add tests first and confirm they fail before implementing the corresponding rejection behavior.

- [X] T008 [US3] Extend `test/api.test.js` with exact HTTP status, JSON content-type, and error-body assertions using the messages in `contracts/http-api.md` for missing fields and validation precedence, wrong types, whitespace-only and over-100-code-point names, accepted 1- and 100-code-point names (including an astral character), ignored unknown properties, zero, negative, string, null, and `1e400` values, case-sensitive enum violations, non-object JSON, malformed JSON, unknown query domains, unsupported paths/methods, and storage failure; test a valid 10,240-byte POST and rejection at 10,241 bytes both with and without `Content-Length`, including GET and unsupported-method requests, and verify rejected POSTs do not alter the collection.

### Implementation for User Story 3

- [X] T009 [US3] Complete request validation, streamed-byte limiting for every request, and error mapping in `src/server.js`: reject bodies over 10,240 bytes with HTTP 400 before parsing; return HTTP 400 and the exact message for each validation case in [contracts/http-api.md](./contracts/http-api.md); validate fields in `competitorName`, `dealValueUSD`, `domain`, `status` order; return HTTP 404 with exactly `{ "error": "Not found" }` for unsupported paths or methods; ensure every response has `Content-Type: application/json`; and map storage failures to HTTP 500 with `{ "error": "Internal server error" }` without exposing file paths. Preserve the data-model rules verbatim: `competitorName` — “Trim whitespace; count Unicode code points; length 1–100 after trimming.”; `dealValueUSD` — “Finite and strictly greater than zero; no string coercion.”; `domain` — “Exact, case-sensitive enum: `BFSI`, `Healthcare`, `Retail`.”; `status` — “Exact, case-sensitive enum: `Won`, `Lost`.”

**Checkpoint**: All user stories pass independently and invalid requests never create or modify a deal.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verify the full implementation against the documented contract and runnable guide.

- [X] T010 Run `npm test` and resolve failures in `test/api.test.js`; verify `npm start` and the manual scenarios in `specs/001-competitor-win-rate-api/quickstart.md`, confirm `data/` is ignored by `../.gitignore`, and confirm no external dependency or prohibited `node:path`, `node:crypto`, or `node:url` import was introduced.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 and T002 are independent and can start immediately.
- **Foundational (Phase 2)**: T003 follows project setup and blocks all user stories.
- **User Stories (Phases 3–5)**: Complete in priority order because all story tests extend `test/api.test.js` and the API behavior is implemented in the shared `src/server.js`.
- **Polish (Phase 6)**: T010 depends on all story tasks being complete.

### User Story Dependencies

- **User Story 1 (P1)**: Starts after T003. It establishes deal creation and collection read-back.
- **User Story 2 (P2)**: Starts after T005; it extends the collection response with filtering and full summary cases.
- **User Story 3 (P3)**: Starts after T007; it completes validation, body-size, and rejection behavior across the shared API.

### Task Dependency Graph

```text
T001 -> T003 -> T004 -> T005 -> T006 -> T007 -> T008 -> T009 -> T010
T002 -----------------------------------------------> T010
```

### Within Each User Story

- Write and run the story tests before its implementation task.
- Keep each story independently testable at its checkpoint.
- Do not parallelize story test and implementation tasks; tests must fail first and both edit shared API/test files.

### Parallel Opportunities

- **Setup**: T001 and T002 can run in parallel because they edit `package.json` and `../.gitignore`, respectively.
- **User Story 1**: No safe intra-story parallel pair; T004 must precede T005.
- **User Story 2**: No safe intra-story parallel pair; T006 must precede T007.
- **User Story 3**: No safe intra-story parallel pair; T008 must precede T009.
- **Across stories**: No safe parallel story execution because they extend the same `src/server.js` and `test/api.test.js` files.

## Parallel Execution Examples

```text
Setup:       T001 || T002
User Story 1: T004 -> T005
User Story 2: T006 -> T007
User Story 3: T008 -> T009
Polish:       T010 after all story tasks
```

The story sequences are intentionally serial: each test task must demonstrate the missing behavior before its implementation task changes the shared files.

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete T001–T003 for the project setup and shared JSON storage.
2. Complete T004–T005 for valid deal creation, persistence, and collection read-back.
3. Stop and validate User Story 1 with `node --test test/api.test.js`.
4. The P1 increment is the MVP; filtering and complete rejection coverage follow in later phases.

### Incremental Delivery

1. Setup and storage → foundation ready.
2. User Story 1 → persisted deal creation and read-back.
3. User Story 2 → filtered collection and summary reporting.
4. User Story 3 → full validation and predictable error responses.
5. Run T010 after the desired stories are complete.

## Notes

- Every task uses the required `- [ ] T### [P?] [US?] ...` checklist form and names its target file.
- `[P]` is used only for the independent setup tasks.
- The default `./data/deals.json` is relative to the project root when the package scripts are run there; `DEALS_FILE` overrides it for tests.
- Storage and server code remain limited to `fs` and `http` module imports, consistent with the project constitution and the user's resolved module-policy choice.
