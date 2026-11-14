# Implementation Plan: RFP Pain-Point Extraction and Evaluation Harness

**Branch**: `001-rfp-pain-point-harness` | **Date**: 2026-11-14 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-rfp-pain-point-harness/spec.md`

## Summary

Build a dependency-free Node.js REST service that converts RFP text into
grounded, categorized pain points. The service uses a configured
OpenAI-compatible provider when an API key is present and a deterministic,
domain-aware rule engine otherwise. A separate offline-capable evaluation
harness measures schema correctness, source grounding and gold-set F1, and
rubric semantic quality. The implementation follows the project constitution's
module boundaries and reports results through a stable JSON report.

The fallback splits trimmed input into sentence spans while retaining source
text, applies shared and domain-specific category keyword rules, maps fixed
severity indicators to the three severity levels, and assigns repeatable IDs.
The live provider receives the configured model and the required structured
output instructions; returned JSON is parsed and validated before use. Provider
errors do not silently select fallback mode.

The package scripts are `start: node src/server.js`,
`test: node --test test/*.test.js`, and `eval: node eval/harness.js`, with no
dependencies. The HTTP server is importable without listening and calls
`listen(process.env.PORT || 3000)` only when run as the main module.

## Technical Context

**Language/Version**: Node.js 20 or newer, CommonJS

**Primary Dependencies**: None; built-in `http`, `fs`, `path`, `crypto`,
`url`, and global `fetch` only

**Storage**: Curated JSON gold dataset and generated `eval/report.json`; no
external database. Request RFP text is transient and excluded from reports and
routine logs.

**Testing**: `node:test` and `node:assert/strict`; API tests bind to loopback
port 0. Evaluation and fallback tests run without credentials or network access.

**Target Platform**: Node.js server on Windows, macOS, or Linux; Node 20 is the
compatibility floor, with a currently supported LTS release recommended for
deployment.

**Project Type**: Single-project REST web service with an evaluation command

**Performance Goals**: Offline fallback completes a 50,000-code-point RFP in
under five seconds in the controlled test environment. No live-provider latency
target is specified.

**Constraints**: Zero npm dependencies; `rfpText` is trimmed and limited to
20-50,000 Unicode code points; JSON request bodies are limited to 51,200 bytes.
Invalid and oversized requests return HTTP 400; all HTTP responses are JSON.
Offline extraction and evaluation are deterministic.

**Scale/Scope**: Each API request contains one RFP; separate requests remain
independent. Evaluation uses at least five curated cases spanning all five
pain-point categories. No authentication, upload parsing, UI, or external
database.

## Constitution Check

**Pre-design gate: PASS**

- Node 20+ CommonJS and built-in-only runtime are specified; no npm packages
  will be added.
- HTTP, extraction, and evaluation remain separated into `src/server.js`,
  `src/extractor.js`, and `eval/harness.js`.
- Provider settings use `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`; the
  absent-key path is deterministic and offline.
- Every HTTP response is JSON. Per the constitution, invalid and oversized
  requests return HTTP 400 even though HTTP 413 is a common alternative for an
  oversized body.
- The evaluation harness runs every evaluated extraction through schema,
  grounding/gold-label, and semantic-rubric layers. Arbitrary API requests
  receive schema and source-evidence checks; dataset F1 is computed over the
  labeled evaluation set.
- Secrets are environment-only; tests and evaluation have credential-free
  deterministic paths.

No constitution violations or unjustified complexity are identified.

**Post-design gate: PASS** — the selected modules, API contract, data model,
offline test strategy, and evaluation layers preserve the same constraints.

## Project Structure

### Documentation (this feature)

```text
specs/001-rfp-pain-point-harness/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── openapi.yaml
├── checklists/
│   └── requirements.md
└── tasks.md                 # Created by /speckit-tasks
```

### Source Code (repository root)

```text
package.json
src/
├── server.js                # HTTP contract and executable entry point
└── extractor.js             # Live provider and deterministic fallback
eval/
├── harness.js               # Three-layer evaluation and report writer
├── gold-dataset.json        # Curated RFP excerpts and reference labels
└── report.json              # Generated aggregate evaluation report
test/
└── api.test.js              # API, extraction, and evaluation tests
```

**Structure Decision**: Use one CommonJS project with the three constitution-
mandated modules. The existing project has no application source, tests, or
package manifest, so the feature starts from this greenfield structure. The
single `test/api.test.js` covers the requested end-to-end flows and matches the
specified npm test script.

## Complexity Tracking

None. The design uses one project, no external packages, and no new service or
storage subsystem.
