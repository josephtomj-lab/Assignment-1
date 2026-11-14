<!--
Sync Impact Report
Version change: unversioned scaffold -> 1.0.0
Modified principles:
- First principle placeholder -> I. Minimal Runtime and Clear Boundaries
- Second principle placeholder -> II. Dual-Mode Provider and Offline Reliability
- Third principle placeholder -> III. Stable JSON API and Explicit Errors
- Fourth principle placeholder -> IV. Three-Layer Evaluation (NON-NEGOTIABLE)
- Fifth principle placeholder -> V. Security and Deterministic Verification
Added sections: Runtime and Architecture Constraints; Evaluation and Quality Gates
Removed sections: None
Follow-up TODO: Confirm the original ratification date.
-->

# RFP Pain-Point Extractor and 3-Layer Evaluation Harness Constitution

## Core Principles

### I. Minimal Runtime and Clear Boundaries
The application MUST run on Node.js 20 or newer using CommonJS and built-in Node
modules only, including `http`, `fs`, `path`, `crypto`, `url`, and native `fetch`.
It MUST NOT require external npm dependencies. HTTP handling MUST reside in
`src/server.js`, RFP extraction in `src/extractor.js`, and the three-layer
evaluation harness in `eval/harness.js`. These boundaries keep runtime setup
small and responsibilities independently verifiable.

### II. Dual-Mode Provider and Offline Reliability
Extraction MUST support a live LLM provider configured through `LLM_API_KEY`,
`LLM_BASE_URL`, and `LLM_MODEL`. When no API key is configured, extraction MUST
use a deterministic local rule-based fallback. Tests and evaluation runs MUST
be able to use that fallback without network access or paid credentials.

### III. Stable JSON API and Explicit Errors
Every HTTP response MUST use `Content-Type: application/json` and a JSON body.
Invalid requests and payloads larger than 50 KB MUST receive HTTP 400 with a
JSON object shaped as `{ "error": "<request-specific reason>" }`. The API
contract is consistent and allows callers to handle failures without guessing.

### IV. Three-Layer Evaluation (NON-NEGOTIABLE)
Every AI output MUST be evaluated by three distinct layers: (1) deterministic
schema and structural validation; (2) source-text groundedness plus gold-dataset
F1 and evidence matching; and (3) rubric-based semantic quality scoring using
an LLM-as-a-judge with a deterministic fallback. All three layers MUST run;
one layer's result MUST NOT substitute for another.

### V. Security and Deterministic Verification
API keys and other secrets MUST NOT be hardcoded in source, tests, or fixtures.
Unit tests MUST use `node:test`. Test and evaluation outcomes MUST be
deterministic and must not require external paid credentials. This protects
credentials and makes results reproducible in offline development and CI.

## Runtime and Architecture Constraints

- The supported runtime is Node.js 20 or newer. CommonJS is the module format;
  network, filesystem, path, cryptography, URL, and fetch functionality MUST use
  the built-in Node APIs.
- External npm runtime or development dependencies MUST NOT be introduced.
- Keep the HTTP API, extraction logic, and evaluation harness in their
  designated modules: `src/server.js`, `src/extractor.js`, and `eval/harness.js`.
- Live LLM settings MUST come from `LLM_API_KEY`, `LLM_BASE_URL`, and
  `LLM_MODEL`. Absence of `LLM_API_KEY` MUST select deterministic local
  rule-based extraction rather than failing due to missing credentials.

## Evaluation and Quality Gates

- Every AI-generated extraction MUST pass all three evaluation layers. Layer 1
  checks deterministic schema and structure; Layer 2 checks grounding against
  source text and gold-dataset F1/evidence matches; Layer 3 scores semantic
  quality against a rubric.
- Layer 3 MAY use an LLM judge when configured, but MUST provide a deterministic
  fallback so the complete harness runs offline without paid credentials.
- API tests MUST cover JSON response headers and bodies, invalid requests, and
  the 50 KB payload limit. Unit tests MUST run with `node:test`.
- Evaluation tests MUST verify the three layers independently and together,
  using reproducible inputs and results that do not depend on a live provider.

## Governance

Amendments MUST document their rationale and identify affected principles,
requirements, and compatibility implications. Changes MUST be reviewed for
consistency with this constitution and validated by the relevant automated
tests before merge.

Constitution versions use semantic versioning. A MAJOR increment marks
backward-incompatible governance changes or removals; a MINOR increment adds
or materially expands a principle or section; a PATCH increment clarifies
wording without changing requirements.

Every feature and code review MUST assess compliance with the applicable
principles and quality gates. Reviewers MUST require evidence that the offline
test path and all evaluation layers remain operational when provider settings
are absent.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): Original adoption date was not provided. | **Last Amended**: 2026-11-14
