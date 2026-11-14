<!--
Sync Impact Report
Version change: 0.0.0 -> 1.0.0
Modified principles:
- [PRINCIPLE_1_NAME] -> I. Runtime & Stack Discipline
- [PRINCIPLE_2_NAME] -> II. Modular Service Boundaries
- [PRINCIPLE_3_NAME] -> III. API & Error Contract
- [PRINCIPLE_4_NAME] -> IV. Security, Payload Hygiene & Secret Protection
- [PRINCIPLE_5_NAME] -> V. Deterministic Quality Gates
Added sections:
- Security & Implementation Constraints
- Development Workflow & Quality Gates
Removed sections: None
Deferred items:
- TODO(RATIFICATION_DATE): Original ratification date not provided; set at formal project adoption.
-->

# Competitor Deal Win-Rate API Constitution

## Core Principles

### I. Runtime & Stack Discipline
Node.js 20 or later MUST be the runtime target, and the service MUST use CommonJS modules with native `http` and `fs` only. No external npm dependencies or package manager drift are permitted. Rationale: this keeps the API portable, deterministic, and compliant with the project’s execution contract.

### II. Modular Service Boundaries
HTTP routing and request validation MUST be implemented in `src/server.js`, while persistence and JSON-file operations MUST be isolated in `src/store.js`. The server module MUST export the application without auto-listening when imported by tests. Rationale: clear service boundaries reduce coupling and make acceptance tests deterministic.

### III. API & Error Contract
All responses MUST include `Content-Type: application/json`. Validation failures MUST return HTTP 400 with a single JSON object of the form `{ "error": "<specific reason>" }`. No alternate error formats or silent coercion are permitted. Rationale: clients rely on consistent machine-readable errors and exact status codes.

### IV. Security, Payload Hygiene & Secret Protection
No secrets, credentials, or machine-specific file paths MAY be hardcoded. Payloads larger than 10KB MUST be rejected before processing. A compliant implementation MUST treat these constraints as non-negotiable security gates. Rationale: the API must remain portable, safe, and environment-independent.

### V. Deterministic Quality Gates
Every acceptance criterion MUST map to deterministic binary tests written with `node:test` and `node:assert/strict`. HTTP assertions MUST check exact status codes and exact JSON behavior; implementation must not rely on non-deterministic timing, environment-sensitive data, or fuzzy assertions. Rationale: correctness is proven by reproducible test outcomes, not subjective review.

## Security & Implementation Constraints
- Runtime MUST be Node.js 20+ with CommonJS modules.
- HTTP and filesystem access MUST use native `http` and `fs` only.
- External npm packages are prohibited.
- No secrets or credentials may be embedded in source, config, or sample payloads.
- Requests exceeding 10KB MUST be rejected.
- Any file path used for persistence must remain portable and not be bound to a developer machine.

## Development Workflow & Quality Gates
- Implementation work MUST separate transport logic from storage logic using `src/server.js` and `src/store.js`.
- Server exports MUST support safe import in tests without auto-listening.
- Validation must reject malformed requests with HTTP 400 and the required JSON error object.
- All API behavior MUST be verified by deterministic tests using `node:test` and `node:assert/strict`.
- Pull requests and reviews MUST confirm that every acceptance criterion has a direct binary test with exact status assertions.

## Governance
This constitution defines the non-negotiable standards for the Competitor Deal Win-Rate API. Where project guidance conflicts with this constitution, this document governs.

Amendments require:
- a clear specification of the rule change and rationale,
- version update using semantic versioning,
- review of affected tests and operational behavior,
- approval before merge.

Versioning policy:
- MAJOR: backward-incompatible governance or principle removals or redefinitions.
- MINOR: new principle or section or material expansion of guidance.
- PATCH: wording, clarification, or non-semantic corrections.

Compliance review:
- Every change MUST be checked against this constitution before merge.
- Reviewers MUST verify that each changed behavior has explicit, deterministic evidence.
- The project MUST maintain test coverage that proves contract stability and exact error handling.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): Original ratification date not provided; set at formal project adoption. | **Last Amended**: 2026-11-14
