# Research: RFP Pain-Point Extraction and Evaluation Harness

## Decisions

### Node runtime and module format

- **Decision**: Use Node.js 20+ CommonJS, built-in Node modules, and global
  `fetch`; add no npm dependencies.
- **Rationale**: This exactly matches the project constitution and allows the
  HTTP service, provider client, evaluation, and tests to run without installs.
  Node documents the HTTP server and global fetch APIs
  ([HTTP](https://nodejs.org/api/http.html),
  [fetch](https://nodejs.org/api/globals.html#fetch)).
- **Alternatives considered**: External HTTP clients or frameworks would add
  dependencies and violate the constitution. A newer runtime minimum was not
  selected because the user requires Node 20+ compatibility.
- **Lifecycle note**: Node 20 reached end of life in March 2026. Preserve Node
  20 compatibility as the requested floor, but deploy on a currently supported
  LTS release where possible
  ([Node.js release status](https://nodejs.org/en/about/previous-releases)).
  Native `fetch` is available in Node 20 but was still documented as
  experimental there; it became stable in Node 21
  ([Node 20 fetch documentation](https://nodejs.org/download/release/v20.20.2/docs/api/globals.html#fetch)).

### HTTP body limits and error contract

- **Decision**: Count bytes as the request stream is read, and use
  `Content-Length` only for an early rejection optimization. Treat 50 KB as
  51,200 bytes, as set in the spec. Return the constitution-mandated HTTP 400
  JSON error for oversized requests.
- **Rationale**: Node's HTTP server exposes request streams and does not parse
  JSON or enforce application body limits. Counting streamed bytes also handles
  chunked requests without a `Content-Length` header
  ([Node HTTP API](https://nodejs.org/api/http.html)).
- **Alternatives considered**: HTTP 413 is a common status for oversized
  content, but it conflicts with the explicit constitution contract; keep 400.
  Trusting only `Content-Length` would miss chunked or inaccurate requests.

### Importable HTTP server and tests

- **Decision**: Export a server factory and call `listen` only under
  `require.main === module`. Bind tests to loopback port 0 and close the server
  using test cleanup.
- **Rationale**: Port 0 avoids test port collisions; separating construction
  from listening allows tests to import the server safely. Node documents both
  the CommonJS main-module check and built-in test runner
  ([CommonJS modules](https://nodejs.org/api/modules.html#accessing-the-main-module),
  [test runner](https://nodejs.org/api/test.html)).
- **Alternatives considered**: A fixed test port is collision-prone; starting
  the server on import creates unwanted side effects.

### Provider and extraction response handling

- **Decision**: Select live mode only when `LLM_API_KEY` is set. Use the
  URL `${LLM_BASE_URL || 'https://api.openai.com/v1'}/chat/completions` and
  model `${LLM_MODEL || 'gpt-4o-mini'}`, authenticate with the API key, parse
  and validate the model response, then verify every evidence quote against
  the trimmed source. Do not silently fall back after live-provider errors.
- **Rationale**: This keeps the two modes observable and avoids returning
  provider failures as successful deterministic results. A substring grounding
  check is deterministic and required by the spec.
- **Alternatives considered**: A provider SDK or schema library violates the
  zero-dependency rule. Implicit fallback after provider failure obscures
  outages and contradicts the spec. Provider-specific structured-output
  extensions are not guaranteed by every compatible endpoint, so request JSON
  in the prompt and validate the parsed response locally. Substring presence is
  not by itself proof that a quote semantically supports a summary; the
  semantic rubric is a separate quality check.

### Gold labels and F1 calculation

- **Decision**: Treat each category as a presence/absence label per excerpt.
  Count TP, FP, and FN per category across cases; calculate per-category
  precision, recall, and F1; report the unweighted macro mean across all five
  categories. Set zero-denominator scores to zero and include counts.
- **Rationale**: Explicit category order and zero behavior make scores
  reproducible and interpretable. These definitions are consistent with
  standard metric guidance
  ([precision, recall, and F-score](https://scikit-learn.org/stable/modules/model_evaluation.html#precision-recall-f-measure-metrics)).
- **Alternatives considered**: Micro averaging can hide weak categories in an
  imbalanced dataset; an unspecified undefined-metric convention makes
  threshold results inconsistent.

### Rubric scoring and report stability

- **Decision**: Score actionability, specificity, and domain relevance
  separately on anchored 1-5 rubrics. Use the configured LLM judge when
  credentials exist and a transparent deterministic scorer otherwise. Keep
  cases and categories in fixed order, use fixed numeric precision, and omit
  timestamps, secrets, and RFP source text from `eval/report.json`.
- **Rationale**: Representative examples, automated metrics, and calibration
  are recommended for task-specific evaluations
  ([evaluation best practices](https://developers.openai.com/api/docs/guides/evaluation-best-practices)).
  Deterministic output ordering is needed for offline repeatability. The local
  rubric proxy is a repeatable heuristic, not a substitute for human or LLM
  semantic judgment.
- **Alternatives considered**: A timestamped or source-text-rich report would
  vary on repeated runs and unnecessarily retain client content. Using an
  external evaluation platform would violate offline and dependency
  constraints. The evaluation platform documentation is guidance only, not a
  dependency recommendation.

## Resolved Assumptions

- The 50 KB request limit is 51,200 encoded bytes; the RFP text limit is
  separately measured in Unicode code points after trimming.
- The gold set covers all five categories, making the all-category macro F1
  meaningful.
- Initial pass thresholds are those recorded in the spec: all Layer 1 cases
  pass, every quote is grounded, macro F1 is at least 0.70, mean semantic
  score is at least 3.5, and each dimension mean is at least 3.0.
- A configured provider failure is an upstream error (HTTP 502), not a signal
  to change extraction mode.

No unresolved technical clarifications remain.
