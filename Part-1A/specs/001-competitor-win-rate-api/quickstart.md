# Quickstart: Competitor Deal Win-Rate API

## Prerequisites

- Node.js 20 or later.
- No package installation is required; the project has no external dependencies.

## Run the Acceptance Tests

From the repository project directory:

```powershell
npm test
```

The test command runs `node --test test/*.test.js`. The suite starts the exported server
on an ephemeral port, uses an isolated `DEALS_FILE`, checks the API contract and exact
HTTP statuses, then closes the server and removes only its own temporary data directory.

Expected result: all tests pass, with no fixed port, external service, or persistent test
data required.

## Start the Service

For an isolated manual run in PowerShell, set the file and port before starting:

```powershell
$env:DEALS_FILE = Join-Path $PWD 'tmp\deals.json'
$env:PORT = '3000'
npm start
```

The parent directory is created when the store initializes. When no `DEALS_FILE` is set,
the default is `data/deals.json` relative to the project directory (the current working
directory when running the package scripts).

## Verify Deal Creation and Retrieval

In another PowerShell window:

```powershell
curl.exe -i -X POST "http://localhost:3000/deals" `
  -H "Content-Type: application/json" `
  --data-raw '{"competitorName":"  Acme  ","dealValueUSD":250000,"domain":"BFSI","status":"Won"}'

curl.exe -i "http://localhost:3000/deals?domain=BFSI"
```

Expected outcomes:

- The POST returns HTTP 201, JSON content type, a trimmed competitor name, generated
  `id` and `recordedAt`, and the submitted value/domain/status.
- The GET returns HTTP 200 with the new deal and a summary calculated from BFSI deals.

## Verify Rejection Behavior

```powershell
curl.exe -i -X POST "http://localhost:3000/deals" `
  -H "Content-Type: application/json" `
  --data-raw '{"competitorName":"Acme","dealValueUSD":"250000","domain":"BFSI","status":"Won"}'

curl.exe -i "http://localhost:3000/deals?domain=Unknown"
```

Both requests return HTTP 400 and a JSON object with the specific error reason. See
[the contract](./contracts/http-api.md) for all error messages and status behavior.
