---
description: "Ordered implementation tasks for the RFP pain-point service and evaluation harness"
---

# Tasks: RFP Pain-Point Extraction and Evaluation Harness

**Input**: Design documents in `specs/001-rfp-pain-point-harness/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, and
`contracts/openapi.yaml`

**Tests**: Tests are explicitly requested. Each story writes its focused tests
before its implementation tasks; provider tests use stubs and never require
paid credentials.

**Organization**: Tasks are grouped by the three prioritized user stories.

## Format

Every implementation task uses `- [ ] Tnnn [P?] [USn?] Description with file
path`. `[P]` means the task can run in parallel with another task touching a
different file and having no incomplete dependencies. Story labels appear only
in user-story phases.

## Phase 1: Setup

**Purpose**: Establish the dependency-free Node project and generated-file
ignore rules.

- [X] T001 [P] Create `package.json` with `"start": "node src/server.js"`, `"test": "node --test test/*.test.js"`, and `"eval": "node eval/harness.js"`; leave dependencies and devDependencies empty.
- [X] T002 [P] Add `/eval/report.json` to `Part-1B/.gitignore` so generated evaluation output is not committed.

## Phase 2: Foundational

**Purpose**: Add shared contracts and an import-safe HTTP shell required by
the user stories.

- [X] T003 [P] Define and export canonical domain, category, severity, and summary helpers in `src/extractor.js`; use the exact domain values `BFSI`, `Healthcare`, `Retail`, and `General`, categories `Legacy Modernization`, `Cost & Operational Efficiency`, `Compliance & Security`, `Customer Experience`, and `Data & Analytics`, and severities `High`, `Medium`, and `Low`.
- [X] T004 [P] Create an import-safe `createServer` factory and JSON response helper in `src/server.js`; set `Content-Type: application/json` on every response, return `{"error":"Not found"}` for unhandled paths, and listen on `process.env.PORT || 3000` only when `require.main === module`.

**Checkpoint**: Project scripts, shared vocabularies, and the server entry point
are ready; no external packages are installed.

## Phase 3: User Story 1 - Extract Client Pain Points (Priority: P1)

**Goal**: Accept valid RFP requests and return structured pain points using a
live provider or deterministic offline extraction.

**Independent Test**: Start the server on an ephemeral port and submit valid
RFP text with each supported domain and with no domain. Verify HTTP 200,
`mode`, exact category/severity values, evidence substrings, and consistent
summary counts; repeat offline input to confirm identical output.

### Tests for User Story 1

- [X] T005 [US1] Add `node:test` cases in `test/api.test.js` for successful fallback and stubbed live-provider requests, all four domains plus the omitted-domain default, structured pain-point fields, `Non-empty substring of the trimmed source text, matched case-insensitively` evidence, and exact summary counts; use port `0` and no real network calls.

### Implementation for User Story 1

- [X] T006 [US1] Implement the deterministic sentence-based fallback in `src/extractor.js` with shared and domain-specific rules, severity indicators, actionable summaries, and repeatable IDs; preserve the data-model constraints `Non-empty and stable within the result; fallback IDs are repeatable`, `Non-empty, actionable description`, and `Non-empty substring of the trimmed source text, matched case-insensitively`.
- [X] T007 [US1] Implement live OpenAI-compatible extraction in `src/extractor.js` using global `fetch`, `LLM_API_KEY`, `LLM_BASE_URL || 'https://api.openai.com/v1'`, and `LLM_MODEL || 'gpt-4o-mini'`; parse and validate each pain point's `Non-empty and stable within the result; fallback IDs are repeatable` ID, exact category values `Legacy Modernization`, `Cost & Operational Efficiency`, `Compliance & Security`, `Customer Experience`, `Data & Analytics`, exact severity values `High`, `Medium`, `Low`, `Non-empty, actionable description` summary, and `Non-empty substring of the trimmed source text, matched case-insensitively` evidence; do not silently fall back after provider errors.
- [X] T008 [US1] Implement the successful `POST /extract-pain-points` response in `src/server.js`; accept `rfpText` and optional `clientDomain` (`BFSI`, `Healthcare`, `Retail`, or `General`; omitted domain defaults to `General`), return `mode`, `clientDomain`, `painPoints`, and `summary`, and enforce `summary.totalPainPoints` using “Exactly the number of items in `painPoints`” and `summary.highSeverityCount` using “Exactly the number of points with `High` severity”.

**Checkpoint**: The valid-request journey is usable independently in fallback
mode and can use a stubbed live provider without external credentials.

## Phase 4: User Story 2 - Receive Clear Request Errors (Priority: P2)

**Goal**: Reject malformed, invalid, and oversized requests consistently and
return the specified JSON errors for unsupported paths.

**Independent Test**: Exercise every invalid-input class and unknown path
against the running service; verify the exact status, JSON content type, and
request-specific error body.

### Tests for User Story 2

- [X] T009 [US2] Add `node:test` cases in `test/api.test.js` for missing, null, wrong-type, blank, 19-code-point, 20-code-point, 50,000-code-point, and 50,001-code-point `rfpText`; invalid or wrong-type `clientDomain`; malformed and non-object JSON; bodies at and above 51,200 encoded bytes; unknown paths; and configured-provider errors, asserting HTTP status and JSON content type.

### Implementation for User Story 2

- [X] T010 [US2] Implement request parsing and validation in `src/server.js`: trim `rfpText` and enforce `20-50,000 Unicode code points`; enforce the `51,200 encoded bytes` full-body cap while reading the stream; reject missing, blank, wrong-type, malformed, non-object, or invalid-domain requests with HTTP 400 and a specific JSON `error`; and return HTTP 404 with `{"error":"Not found"}` for unknown routes.

**Checkpoint**: Invalid input and unsupported-route scenarios have stable,
measurable responses, and every response remains JSON.

## Phase 5: User Story 3 - Assess Extraction Quality (Priority: P3)

**Goal**: Evaluate extraction against a curated benchmark using all three
layers and emit a deterministic offline report.

**Independent Test**: Run `node eval/harness.js` without credentials and verify
at least five gold cases, per-case Layer 1/2/3 results, all five category
metrics, rubric means, thresholded overall status, console output, and
`eval/report.json`.

### Tests for User Story 3

- [X] T011 [P] [US3] Add `node:test` cases in `test/api.test.js` for binary Layer 1 structure/count checks, case-insensitive quote grounding, per-category precision/recall/F1 and zero-denominator behavior, rubric scores constrained to 1-5, deterministic offline scores, and report pass/fail thresholds; stub judge calls so tests never access the network.

### Implementation for User Story 3

- [X] T012 [P] [US3] Create `eval/gold-dataset.json` with `at least five cases and collectively cover all five categories`; give each case a stable ID, supported domain, realistic IT Services/BPO `rfpText`, and ground-truth pain points with categories and source evidence.
- [X] T013 [US3] Implement Layers 1 and 2 in `eval/harness.js`: Layer 1 reports `Binary pass/fail plus structural validation findings` for required fields, exact categories/severities, non-empty summaries, and exact total/high-severity counts; Layer 2 reports `Evidence-grounding status and matched/unmatched quote counts`, verifies each non-empty quote as a case-insensitive source substring, and calculates per-category TP/FP/FN, precision, recall, F1, and five-category macro F1 with zero denominators scored as zero.
- [X] T014 [US3] Implement Layer 3 and report generation in `eval/harness.js`: score actionability, specificity, and domain relevance from 1-5 using an LLM judge when `LLM_API_KEY` is configured and a deterministic rubric otherwise; write stable, ordered results and thresholds to `eval/report.json`, print a human-readable report, and pass only when Layer 1 all passes, all quotes are grounded, macro F1 is at least 0.70, overall mean is at least 3.5, and each dimension mean is at least 3.0.

**Checkpoint**: The evaluation command runs offline without credentials and
produces all three layer results and an aggregate pass/fail report.

## Phase 6: Polish and Cross-Cutting Validation

**Purpose**: Validate the complete quickstart and preserve the project gates.

- [X] T015 Run `npm test` and `npm run eval` from `Part-1B`; follow `specs/001-rfp-pain-point-harness/quickstart.md`, verify `eval/report.json` is generated and ignored, and confirm the fallback remains deterministic without network access or paid credentials.

## Dependencies and Execution Order

### Phase Dependencies

- **Setup**: T001 and T002 are independent and may run in parallel.
- **Foundational**: T003 and T004 depend on setup completion, are independent
  files, and may run in parallel. Both block the user stories.
- **User Story 1**: Starts after the foundation; establishes the extractor and
  success route required by later work.
- **User Story 2**: Follows User Story 1 because it extends and validates the
  same HTTP route and test file.
- **User Story 3**: Requires the User Story 1 extractor. Its test and gold
  dataset tasks can run in parallel; the harness implementation depends on the
  dataset and extractor. It does not depend on the User Story 2 behavior, but
  changes to the shared `test/api.test.js` should be serialized with T009.
- **Polish**: T015 depends on all three user stories.

### User Story Dependencies

- **User Story 1 (P1)**: Depends on Setup and Foundational phases; no other
  story dependency. This is the MVP.
- **User Story 2 (P2)**: Depends on User Story 1's route and response path.
- **User Story 3 (P3)**: Depends on User Story 1's extractor and the foundation;
  it can proceed independently of the P2 error-handling implementation if
  shared test-file edits are coordinated.

### Parallel Opportunities

- Run T001 with T002; they modify `package.json` and `Part-1B/.gitignore`.
- Run T003 with T004; they establish shared extraction contracts and the
  import-safe HTTP shell in different files.
- Within User Story 3, run T011 with T012; test authoring and gold data creation
  touch different files and can proceed from the documented schema.
- Do not parallelize tasks that edit `src/extractor.js`, `src/server.js`, or
  `test/api.test.js` concurrently.

## Parallel Examples

### Setup

```text
Task T001: Create package.json scripts and keep dependencies empty.
Task T002: Ignore eval/report.json in Part-1B/.gitignore.
```

### User Story 3

```text
Task T011: Write offline evaluation tests in test/api.test.js.
Task T012: Create the labeled benchmark in eval/gold-dataset.json.
```

## Implementation Strategy

### MVP First (User Story 1)

1. Complete Setup and Foundational phases.
2. Complete User Story 1 tests and implementation.
3. Validate the valid request journey using offline mode and stubbed live
   provider calls.
4. Stop at the checkpoint; only then add request error cases and evaluation.

### Incremental Delivery

1. Add User Story 2 and validate all boundary/error cases without changing the
   success response.
2. Add User Story 3 and verify every gold case through all three layers.
3. Run the final quickstart validation and verify the generated report is
   excluded from version control.

## Notes

- Every task is a checkbox with a sequential ID and a concrete file path.
- `[P]` tasks touch different files and have no incomplete prerequisites.
- User-story labels map directly to priorities and scenarios in `spec.md`.
- The request-size interpretation is 51,200 encoded bytes per the spec and
  constitution; oversized bodies use HTTP 400 as required by the constitution.
- Live-provider test cases use an injected stub; no test requires paid access.
