# Feature Specification: RFP Pain-Point Extraction and Evaluation Harness

**Feature Branch**: Not created

**Created**: 2026-11-14

**Status**: Draft

**Input**: Build an RFP pain-point REST service with offline fallback and layered evaluation for market research analysts at an IT Services/BPO firm.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Extract Client Pain Points (Priority: P1)

As a market research analyst, I submit RFP text and an optional client domain
and receive a structured list of the client's pain points, their severity,
source evidence, and a concise overall count.

**Why this priority**: Identifying and organizing client needs is the core
business value of the feature.

**Independent Test**: Submit a valid RFP excerpt with each supported domain and
confirm that the response contains categorized pain points and consistent
summary counts.

**Acceptance Scenarios**:

1. **Given** a valid RFP text and a supported client domain, **When** I submit
   the request, **Then** I receive HTTP 200 with the selected domain, an
   extraction mode, pain points, and a summary whose counts match the results.
2. **Given** valid RFP text without a client domain, **When** I submit the
   request, **Then** the response uses the General domain.
3. **Given** RFP text with no detectable pain points, **When** I submit the
   request, **Then** the response contains an empty pain-point list and zero
   summary counts.

---

### User Story 2 - Receive Clear Request Errors (Priority: P2)

As an analyst or API client, I need invalid submissions and unsupported routes
to produce predictable, specific errors so I can correct the request.

**Why this priority**: Clear validation feedback prevents malformed or
oversized client content from being mistaken for a successful extraction.

**Independent Test**: Submit each invalid input class and an unsupported route;
verify its status code, JSON content type, and error response.

**Acceptance Scenarios**:

1. **Given** a missing, blank, too-short, or wrong-type RFP text, **When** I
   submit the request, **Then** I receive HTTP 400 with a specific JSON error.
2. **Given** a malformed JSON body, invalid domain, or body over 50 KB,
   **When** I submit the request, **Then** I receive HTTP 400 with a specific
   JSON error.
3. **Given** a route that is not supported, **When** I submit a request,
   **Then** I receive HTTP 404 with `{"error":"Not found"}`.

---

### User Story 3 - Assess Extraction Quality (Priority: P3)

As an evaluation owner, I run a repeatable assessment against representative
RFP excerpts and see whether structure, evidence grounding, and semantic quality
meet the agreed thresholds.

**Why this priority**: Evaluation evidence is necessary to trust and improve
the extraction results before analysts rely on them.

**Independent Test**: Run the evaluation with no external credentials and
confirm that at least five gold cases produce per-layer results, aggregate
metrics, and a final pass/fail outcome.

**Acceptance Scenarios**:

1. **Given** a gold dataset with at least five labeled RFP excerpts, **When**
   I run the evaluation, **Then** each case receives a binary schema result,
   groundedness results, and semantic rubric scores.
2. **Given** an evidence quote absent from its source excerpt, **When** the
   evaluation runs, **Then** groundedness fails for that output.
3. **Given** no configured LLM credentials, **When** I run extraction and
   evaluation repeatedly with the same inputs, **Then** the local fallback
   produces identical results and the report is generated without network
   access or paid credentials.

---

### Edge Cases

- RFP text is missing, null, non-string, empty after trimming, fewer than 20
  characters, or more than 50,000 characters after trimming.
- The JSON request body exceeds 50 KB even if the RFP text itself is within its
  character limit.
- The client domain is null, a non-string value, or a string outside the
  supported domain values.
- A request body is malformed JSON, is not a JSON object, or contains extra
  fields.
- The RFP contains no identifiable pain points, repeated evidence, or Unicode
  text whose encoded body size is larger than its character count.
- A model response is malformed, contains a disallowed category or severity,
  has inconsistent summary counts, or includes an evidence quote not found in
  the source.
- A live provider is configured but unavailable or returns an unusable result;
  this is reported as an error rather than silently switching extraction mode.
- A gold dataset has no examples for a category, a prediction has no points,
  or a rubric dimension receives the lowest or highest possible score.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The service MUST accept `POST /extract-pain-points` with a JSON
  object containing required `rfpText` and optional `clientDomain`.
- **FR-002**: The service MUST trim `rfpText` for validation and accept it only
  when it is a string containing 20 to 50,000 Unicode code points after
  trimming. The trimmed text MUST be used for extraction and evidence matching.
  Missing, blank, too-short, too-long, or wrong-type values MUST return HTTP
  400 with a JSON `error` field containing a specific reason.
- **FR-003**: The service MUST accept only `BFSI`, `Healthcare`, `Retail`, or
  `General` as client domains. An omitted domain MUST default to `General`;
  invalid values or wrong types MUST return HTTP 400 with a specific JSON
  error.
- **FR-004**: Malformed JSON, a non-object request body, and a request body
  larger than 50 KB MUST return HTTP 400 with a JSON `error` field containing
  a specific reason. All HTTP responses MUST use
  `Content-Type: application/json`. Unsupported routes MUST return HTTP 404
  with `{"error":"Not found"}`.
- **FR-005**: When live provider credentials are configured, the service MUST
  use the OpenAI-compatible chat-completions provider configured through
  `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. When `LLM_API_KEY` is absent,
  it MUST use deterministic local rule-based extraction. The response MUST
  identify the mode as `llm` or `fallback`, respectively.
- **FR-006**: A successful extraction MUST return HTTP 200 and a JSON object
  containing `mode`, `clientDomain`, `painPoints`, and `summary`. Each pain
  point MUST contain a string `id`; one category from Legacy Modernization,
  Cost & Operational Efficiency, Compliance & Security, Customer Experience,
  or Data & Analytics; a severity of High, Medium, or Low; a non-empty
  `summary`; and an `evidenceQuote`.
- **FR-007**: The extraction summary MUST report `totalPainPoints` equal to the
  number of returned pain points and `highSeverityCount` equal to the number
  whose severity is `High`. A valid extraction with no identified pain points
  MUST return an empty list and zero counts.
- **FR-008**: Every returned evidence quote MUST be a non-empty excerpt that
  appears in the submitted RFP text using a case-insensitive substring match.
  The service MUST NOT present an ungrounded quote as valid evidence.
- **FR-009**: The evaluation harness in `eval/harness.js` MUST use
  `eval/gold-dataset.json`, containing at least five realistic IT Services/BPO
  RFP excerpts with ground-truth pain points. Collectively, the examples MUST
  cover all five allowed categories.
- **FR-010**: Layer 1 MUST deterministically validate the result structure,
  required fields, allowed category and severity values, non-empty summaries,
  and exact count consistency. It MUST report a binary pass/fail result for
  every case.
- **FR-011**: Layer 2 MUST verify every evidence quote against its source text
  using a case-insensitive substring match. It MUST report per-category
  precision, recall, and F1 against the gold labels, plus a macro-average F1
  across the five categories. Category presence MUST be compared per excerpt;
  a zero denominator MUST score zero.
- **FR-012**: Layer 3 MUST score actionability, specificity, and domain
  relevance independently on a 1-to-5 rubric scale. It MUST use an LLM judge
  when `LLM_API_KEY` is configured and a deterministic rubric scorer otherwise.
- **FR-013**: The evaluation MUST produce a consolidated report in JSON and
  human-readable console output. It MUST include per-case layer results,
  category metrics, rubric scores, thresholds, and an overall pass/fail
  outcome. Overall evaluation passes only when every Layer 1 case passes, all
  evidence is grounded, macro F1 is at least 0.70, the mean Layer 3 score is
  at least 3.5, and each rubric dimension's mean is at least 3.0.
- **FR-014**: Unit tests MUST use `node:test`, and unit tests and evaluation
  runs MUST be repeatable without paid external credentials. With no API key
  configured, identical inputs MUST produce identical extraction outputs and
  evaluation reports.
- **FR-015**: If a configured live provider is unavailable, its response is
  unusable, or required provider configuration is incomplete, the service MUST
  return a JSON error response and MUST NOT silently change to fallback mode.
- **FR-016**: Frontend UI, user authentication, PDF/DOCX parsing, and external
  databases are out of scope.

### Key Entities *(include if data involved)*

- **Extraction Request**: Submitted RFP text and an optional client domain.
- **Pain Point**: A categorized client need with severity, summary, and source
  evidence.
- **Extraction Summary**: Counts of all identified pain points and those
  classified as high severity.
- **Gold Evaluation Case**: An RFP excerpt paired with ground-truth pain point
  labels and source evidence.
- **Evaluation Report**: Per-case layer outcomes, category metrics, rubric
  scores, thresholds, and the aggregate pass/fail result.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of valid requests at the defined text and body-size
  boundaries return the complete success shape, with summary counts matching
  the returned pain points.
- **SC-002**: 100% of tested invalid request classes return HTTP 400 with
  `Content-Type: application/json` and a request-specific `error` message;
  100% of unsupported routes return HTTP 404 with the exact `Not found` error.
- **SC-003**: Every evaluation run covers at least five gold cases and reports
  all three layers, all five category metrics, all three rubric dimensions,
  their thresholds, and an overall result.
- **SC-004**: 100% of evidence quotes in a passing evaluation are found in
  their source excerpts, and macro category F1 is at least 0.70.
- **SC-005**: A passing evaluation has a mean semantic score of at least 3.5
  out of 5 and a mean score of at least 3.0 for each rubric dimension.
- **SC-006**: In offline mode, two consecutive runs on identical inputs
  produce identical extraction outputs and evaluation reports without network
  access or paid credentials.
- **SC-007**: In the controlled offline test environment, the fallback returns
  results for an allowed 50,000-character RFP within five seconds.

## Assumptions

- A kilobyte for the request-body limit is 1,024 bytes, so 50 KB means 51,200
  encoded bytes. The byte limit applies to the complete JSON body, independently
  of the trimmed RFP character limit.
- Extra request fields are ignored; required and recognized fields are
  validated.
- A provider failure after live mode is selected is an upstream service error;
  it does not trigger an implicit fallback. The response uses HTTP 502 and a
  specific JSON error.
- The category-level metrics compare category presence per excerpt. The gold
  set covers each allowed category so macro F1 remains meaningful.
- A configured live provider is approved for the submitted client RFP content.
  RFP text is not retained after the request or included in routine logs.
- The five-second fallback target is measured in a controlled offline
  evaluation environment and does not apply to live provider latency.
- Since no evaluation thresholds were specified, the initial pass bars are
  macro F1 of 0.70, mean semantic score of 3.5, and mean score of 3.0 or higher
  on each rubric dimension.
- The project constitution governs the supported runtime, module boundaries,
  dependency policy, secret handling, and unit-test runner.
- The externally visible REST contract is part of the requested feature; no
  internal language, framework, or dependency choices are specified here.
- Frontend UI, authentication, document upload/parsing, and external database
  storage are excluded from this feature.
