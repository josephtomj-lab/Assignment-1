# Feature Specification: Competitor Deal Win-Rate API

**Feature Branch**: `not-created`

**Created**: 2026-11-14

**Status**: Draft

**Input**: User description: "Build a Competitor Deal Win-Rate REST API for Market Research Analysts at an IT Services/BPO firm to track competitor deal outcomes."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a Deal Outcome (Priority: P1)

As a market research analyst, I want to record a competitor deal's value, market domain, and outcome so that the firm can build a reliable record of competitive results.

**Why this priority**: Deal records are the source data required for all win-rate reporting.

**Independent Test**: Submit one valid deal and verify the exact HTTP status, returned record fields, generated identifier and timestamp, and persistence by retrieving the deal.

**Acceptance Scenarios**:

1. **Given** a valid deal with all required fields, **When** the analyst submits it to `POST /deals`, **Then** the response is HTTP 201 with a JSON deal object containing the trimmed competitor name, submitted value/domain/status, a unique `id`, and an ISO-8601 `recordedAt`.
2. **Given** a deal was created successfully, **When** the analyst retrieves the collection, **Then** the created deal is present in the returned deals and contributes to the summary.
3. **Given** the data file does not yet exist, **When** the analyst creates a valid deal, **Then** the deal is saved and is available to subsequent reads.

---

### User Story 2 - Review Deals and Win Rate (Priority: P2)

As a market research analyst, I want to retrieve all recorded outcomes or narrow them to one domain so that I can review the relevant competitive results and win rate.

**Why this priority**: Analysts need a consistent view of outcomes and a summary that can inform market research.

**Independent Test**: Seed or create known Won and Lost records, request the full collection and each supported domain, and compare the returned deals and summary with the known records.

**Acceptance Scenarios**:

1. **Given** zero or more saved deals, **When** the analyst requests `GET /deals`, **Then** the response is HTTP 200 with `deals` and `summary` fields, and totals equal the returned records.
2. **Given** saved deals in multiple domains, **When** the analyst requests `GET /deals?domain=BFSI`, **Then** the response is HTTP 200 and both the deals and summary include only BFSI records.
3. **Given** the returned set contains no deals, **When** the analyst requests it, **Then** the response is HTTP 200 with an empty deals array and summary values `total: 0`, `won: 0`, `lost: 0`, and `winRatePercent: 0`.
4. **Given** a returned set has both Won and Lost deals, **When** its summary is calculated, **Then** `winRatePercent` is the Won count divided by total, multiplied by 100 and rounded to two decimal places.

---

### User Story 3 - Receive Clear Rejections for Invalid Requests (Priority: P3)

As an analyst or API client, I want invalid requests to receive a clear, predictable error so that I can correct the request without creating misleading data.

**Why this priority**: Rejecting invalid input protects the integrity of stored outcomes and makes client behavior testable.

**Independent Test**: Send one request for each malformed, invalid, oversized, and unsupported case, and assert the exact status and JSON error object for each.

**Acceptance Scenarios**:

1. **Given** a missing, wrongly typed, or invalid required field, **When** a deal is submitted, **Then** the response is HTTP 400 with a specific JSON error and no deal is persisted.
2. **Given** malformed JSON or a request body larger than 10KB, **When** it is submitted, **Then** the response is HTTP 400 with the corresponding JSON error and no deal is persisted.
3. **Given** a domain query value outside the supported enum, **When** the collection is requested, **Then** the response is HTTP 400 with a JSON error.
4. **Given** a path or method that is not supported, **When** a request is made, **Then** the response is HTTP 404 with exactly `{ "error": "Not found" }`.

### Edge Cases

- A competitor name containing only whitespace is rejected; surrounding whitespace on a valid name is trimmed before it is returned and stored.
- A name of exactly 1 or 100 characters after trimming is accepted; a name of 0 or more than 100 characters is rejected.
- `dealValueUSD` must be a JSON number that is finite and greater than zero; zero, negative values, strings, `null`, and non-finite numeric values are rejected.
- Domain and status values are case-sensitive; values such as `bfsi`, `won`, or unlisted strings are rejected.
- Each required field is checked in this order: `competitorName`, `dealValueUSD`, `domain`, `status`. The first invalid field determines the response error.
- A JSON value that is not an object is rejected as an invalid request body. Unrecognized object properties do not become deal fields.
- A body of exactly 10,240 bytes is not rejected for size; any body larger than 10,240 bytes is rejected before JSON parsing.
- An unknown or incorrectly cased `domain` query value is rejected. A valid domain with no matching records returns an empty deals array and a zero summary.
- Win-rate calculation for all-Lost deals is 0; for all-Won deals it is 100; fractional percentages are rounded to two decimal places.
- Missing data files are treated as an empty collection until a valid deal is created. Invalid requests do not change persisted data.
- Storage failures return HTTP 500 with a JSON error that does not expose credentials or machine-specific paths.
- Every response, including errors, has `Content-Type: application/json`.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST accept `POST /deals` with a JSON object containing `competitorName`, `dealValueUSD`, `domain`, and `status`.
- **FR-002**: The service MUST require `competitorName` to be a string whose trimmed value is 1 to 100 Unicode code points; it MUST store and return the trimmed value.
- **FR-003**: The service MUST require `dealValueUSD` to be a finite JSON number greater than zero; it MUST NOT coerce strings or other JSON types into numbers.
- **FR-004**: The service MUST accept `domain` only as one of the case-sensitive values `BFSI`, `Healthcare`, or `Retail`, and `status` only as the case-sensitive value `Won` or `Lost`.
- **FR-005**: For a valid submission, the service MUST generate an identifier unique among persisted deal records and an ISO-8601 `recordedAt` timestamp, persist the record, and return HTTP 201 with the created deal object.
- **FR-006**: Deal records MUST be persisted in a JSON data file. The default file MUST be `data/deals.json`; the `DEALS_FILE` environment variable MUST allow a different file to be selected for isolated testing.
- **FR-007**: The service MUST accept `GET /deals` and return HTTP 200 with `{ "deals": [...], "summary": { "total": number, "won": number, "lost": number, "winRatePercent": number } }`.
- **FR-008**: The summary MUST describe the deals returned in the response: `total` is their count, `won` and `lost` are their respective status counts, and `winRatePercent` is `won / total * 100`, rounded to two decimal places, or zero when `total` is zero.
- **FR-009**: `GET /deals` MUST support the optional, case-sensitive `domain` query filter for the three allowed domains. An unknown value MUST return HTTP 400.
- **FR-010**: Missing required fields, invalid field values or types, a non-object request body, malformed JSON, and bodies larger than 10,240 bytes MUST return HTTP 400 with a JSON object containing a specific `error` reason. Invalid submissions MUST NOT create or alter deal records.
- **FR-011**: Validation errors MUST use these exact messages: `Malformed JSON`; `Payload exceeds 10KB`; `Body must be a JSON object`; `competitorName is required`; `competitorName must be a string`; `competitorName must contain 1 to 100 characters`; `dealValueUSD is required`; `dealValueUSD must be a finite number greater than 0`; `domain is required`; `domain must be BFSI, Healthcare, or Retail`; `status is required`; and `status must be Won or Lost`. For an invalid domain query, the error MUST be `domain must be BFSI, Healthcare, or Retail`.
- **FR-012**: For requests to unsupported paths or methods, the service MUST return HTTP 404 with exactly `{ "error": "Not found" }`.
- **FR-013**: Every response MUST have `Content-Type: application/json`. Storage failures MUST return HTTP 500 with a JSON error that does not disclose machine-specific paths or secrets.
- **FR-014**: All design and delivery decisions MUST comply with the [project constitution](../../.specify/memory/constitution.md).
- **FR-015**: Every acceptance criterion MUST map to a deterministic binary test, including an exact HTTP status assertion for successful, validation-error, oversized, filtered, and unsupported requests.

### Key Entities *(include if feature involves data)*

- **Deal**: A recorded competitor outcome containing `id`, `competitorName`, `dealValueUSD`, `domain`, `status`, and `recordedAt`.
- **Deal Summary**: Aggregate counts and win-rate percentage calculated from the deals returned by the requested collection view.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of valid deal submissions return HTTP 201 and a record whose fields match the submitted valid values after name trimming.
- **SC-002**: 100% of successfully created deals remain available in subsequent collection reads, including after the service is restarted.
- **SC-003**: For every test dataset, returned total, won, lost, and win-rate values exactly match independently calculated results, including the empty, all-Won, all-Lost, and filtered cases.
- **SC-004**: 100% of invalid and oversized request cases return HTTP 400 with the specified JSON error object and leave the deal collection unchanged.
- **SC-005**: 100% of unsupported path or method cases return HTTP 404 with `{ "error": "Not found" }`; all tested success and error responses identify JSON content.
- **SC-006**: Every acceptance criterion is mapped to a deterministic pass/fail test with an exact asserted HTTP status.

## Assumptions

- The 10KB request-body limit is 10,240 bytes.
- The summary is calculated after applying the optional domain filter, and the response includes all matching deals because pagination was not requested.
- Missing data files represent an empty collection. A valid first submission initializes persistence.
- Unknown JSON object properties are ignored and are not included in the persisted or returned deal object.
- Storage or data-file failures use HTTP 500 with a generic JSON error; internal path details are not returned.
- Authentication, frontend UI, deal editing or deletion, and external databases are excluded from this feature.
- Implementation remains subject to all applicable constraints in the project constitution.
