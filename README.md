**Assignment 1: Spec-Driven Development & AI Evaluation Harness**

I created this assignment using GitHub Spec Kit—going step-by-step from `constitution.md` and `spec.md` through `plan.md`, `tasks.md`, and final implementation. Everything runs on Node.js 20+ (CommonJS) with zero external npm dependencies, relying strictly on built-in Node modules.

**Part-1A — Competitor Deal Win-Rate API**
 - `src/server.js` & `src/store.js`: A lightweight REST API built directly on Node's native `http` and `fs` modules. It handles `POST /deals`, `GET /deals` (with `?domain=` filtering), enforces a 10KB payload limit, and returns clean JSON errors.
 - `test/api.test.js`: 14 unit and integration tests written with `node:test` and `node:assert/strict`.
 - `specs/001-competitor-win-rate-api/`: The full Spec Kit paper trail—specs, architecture plan, data model, HTTP contracts, and task checklists.


**Part-1B — RFP Pain-Point Extractor & 3-Layer AI Evaluation Harness**
 - `src/server.js` & `src/extractor.js`: Exposes `POST /extract-pain-points`. You can plug in any OpenAI-compatible endpoint (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` via native `fetch`), or run it completely offline using a deterministic rule-based fallback.
 - `eval/gold-dataset.json` & `eval/harness.js`: A three-stage evaluation pipeline that checks JSON schema validity (Layer 1), verbatim source grounding and category F1 scores (Layer 2), and semantic quality on a 1–5 rubric (Layer 3).
 - `test/api.test.js`: 10 tests verifying request validation, the offline extractor, and each layer of the eval harness.
 - `specs/001-rfp-pain-point-harness/`: Spec Kit documentation, OpenAPI contracts, and task tracking for this module.

**Running & Verifying**

**Part 1A (Competitor Deal Win-Rate API)**

```bash
cd Part-1A
npm test      # Runs the 14 API tests
npm start     # Spins up the server at http://localhost:3000

```

**Part 1B (RFP Pain-Point Extractor & Evaluation Harness)**

```bash
cd Part-1B
npm test      # Runs the 10 unit and harness tests
npm run eval  # Evaluates the 5 gold RFP cases (currently hitting 1.00 Macro F1 and 4.0333 Rubric Mean)
npm start     # Spins up the server at http://localhost:3000

```
