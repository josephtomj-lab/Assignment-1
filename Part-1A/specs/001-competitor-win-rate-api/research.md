# Research: Competitor Deal Win-Rate API

## Module Policy

**Decision**: Keep application imports limited to native `node:http` and `node:fs`, as
required by the project constitution and confirmed by the user's choice. Use the
constitution-required `node:test` and `node:assert/strict` only in tests. Do not import
`node:path`, `node:crypto`, or `node:url`.

**Rationale**: The feature can be implemented with the allowed modules, and this avoids
expanding the constitution's runtime whitelist. Node's global `URL` can parse request
targets without importing `node:url`. The default path can be built from `__dirname` and
a relative string; custom `DEALS_FILE` values are passed to `fs` as provided. A small
path-parent helper must recognize both `/` and `\\` separators so `fs.mkdirSync` can
create a missing parent directory.

**Alternatives considered**: Importing `path`, `crypto`, and `url` is simpler and was part
of the initial plan request, but the user chose to preserve the stricter constitution.
External packages are prohibited.

## JSON File Persistence

**Decision**: Use synchronous reads and writes. Treat a missing target file as an empty
array and initialize it after creating its parent directory. For replacement, serialize
to a uniquely named temporary file in the target directory, open it with exclusive
creation (`'wx'`), write and close it, then rename it over the target. Clean up the
temporary file if a write or rename fails; surface the storage error to the server's
generic JSON 500 response. Do not delete the destination as a fallback before renaming.

**Rationale**: A same-directory temporary file avoids a cross-device rename and avoids
exposing a partially written JSON document. The temporary filename can use
`process.pid`, `Date.now()`, and an incrementing counter; exclusive creation handles
collisions. These mechanisms require no extra module import.

**Alternatives considered**: Writing directly to the target risks truncation or partial
JSON if a write fails. The commonly used `path` plus `crypto.randomUUID()` pattern is
clearer, but is outside the chosen module policy. Node documents rename behavior and
cross-device errors, but does not promise atomicity or crash durability for every
filesystem; the design must not claim universal crash durability.

**References**:

- [Node.js synchronous filesystem API](https://nodejs.org/api/fs.html#synchronous-api)
- [Node.js `openSync`](https://nodejs.org/api/fs.html#fsopensyncpath-flags-mode)
- [Node.js `writeFileSync`](https://nodejs.org/api/fs.html#fswritefilesyncfile-data-options)
- [Node.js `renameSync`](https://nodejs.org/api/fs.html#fsrenamesyncoldpath-newpath)
- [Node.js common system errors](https://nodejs.org/api/errors.html#common-system-errors)

## Deal Identifiers

**Decision**: Construct IDs from a `Date.now()` value, `process.pid`, and a
monotonically increasing in-process counter. Before using a candidate, check it against
IDs already present in the loaded collection and advance the counter on collision.

**Rationale**: This provides unique IDs for the specified single-process service without
importing `node:crypto`; existing records also prevent a restart from reusing an ID.

**Alternatives considered**: `crypto.randomUUID()` is a simpler collision-resistant
identifier, but it violates the selected module policy. Coordinating simultaneous
independent processes is out of scope; the JSON file is not a multi-writer database.

## HTTP Body Limit

**Decision**: Check a valid `Content-Length` early when available, and always count actual
incoming chunk bytes. Retain at most 10,240 bytes. Once the stream exceeds that limit,
stop parsing it and return HTTP 400 with `Payload exceeds 10KB`, without persisting data.

**Rationale**: Counting chunks covers chunked requests and requests without
`Content-Length`; the required response remains HTTP 400 rather than a conventional 413.

**Alternatives considered**: Trusting only `Content-Length` misses streamed requests.
Returning 413 conflicts with the feature contract.

**References**:

- [Node.js HTTP `IncomingMessage`](https://nodejs.org/api/http.html#class-httpincomingmessage)
- [Node.js HTTP overview](https://nodejs.org/api/http.html#http)

## Deterministic Integration Tests

**Decision**: Import the exported server without listening, set `DEALS_FILE` to a test
file in a directory created by `fs.mkdtempSync`, then listen on port `0`. Send requests
over `node:http`; register test cleanup to close the server, restore the prior environment
value, and remove only the directory created for the test. Keep tests sequential because
the exported server and environment variable are process-wide.

**Rationale**: An ephemeral port avoids fixed-port collisions; a fresh store per case
prevents cross-test data leakage. `node:test` cleanup hooks run after failures as well as
successes. A temp directory under the test folder avoids importing `node:os` or
`node:path`.

**Alternatives considered**: A fixed port risks collisions. Shared fixture files make test
order significant. `os.tmpdir()` and `path.join()` are conventional but excluded by the
selected module policy.

**References**:

- [Node.js test context and cleanup](https://nodejs.org/api/test.html#class-testcontext)
- [Node.js server `listen`](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback)
- [Node.js `mkdtempSync`](https://nodejs.org/api/fs.html#fsmkdtempsyncprefix-options)
- [Node.js `rmSync`](https://nodejs.org/api/fs.html#fsrmsyncpath-options)
