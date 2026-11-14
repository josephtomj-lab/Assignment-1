# Quickstart: RFP Pain-Point Extractor

## Prerequisites

- Node.js 20 or newer and npm.
- No dependency installation is needed; the project uses Node built-ins only.
- An LLM API key is optional. Without one, extraction and evaluation use the
  deterministic offline path.

## Run automated tests

From the repository project directory:

```text
npm test
```

Expected result: the `node:test` suite completes successfully without an API
key, paid credentials, or external network access. The API tests start their
server on an ephemeral loopback port and isolate provider settings so an API
key inherited from the shell does not trigger live calls.

## Start the API in offline mode

In PowerShell, clear any provider key for this terminal session and start the
service:

```powershell
Remove-Item Env:LLM_API_KEY -ErrorAction SilentlyContinue
npm start
```

The service listens on port 3000 unless `PORT` is set. Submit an example:

```powershell
$body = @{
  rfpText = "Our legacy claims platform causes manual processing delays and rising operating costs. We need better analytics to identify service bottlenecks."
  clientDomain = "BFSI"
} | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri "http://localhost:3000/extract-pain-points" `
  -ContentType "application/json" -Body $body
```

Expected result: HTTP 200 with `mode` set to `fallback`, the requested domain,
a pain-point array whose evidence quotes occur in the submitted text, and
summary counts matching that array.

## Run the evaluation harness

```text
npm run eval
```

Expected result: all gold cases are processed through the three evaluation
layers, a consolidated report is printed, and `eval/report.json` is written.
Without `LLM_API_KEY`, the extraction and semantic rubric use deterministic
local fallbacks. With a configured key, provider and judge calls may incur
external cost and produce variable semantic scores.

## Validate request errors

Use the API request in the contract with an invalid body, such as a missing
`rfpText`, an unsupported `clientDomain`, or a body larger than 51,200 bytes.
Expected result: HTTP 400, JSON content type, and an `error` message identifying
the invalid condition. A request to an unsupported route returns HTTP 404 with
`{"error":"Not found"}`.

## Optional live-provider mode

Set `LLM_API_KEY`; optionally set `LLM_BASE_URL` and `LLM_MODEL` to override the
documented defaults. Do not commit credentials. With a key configured, a
provider or invalid model-output failure is reported as an error and does not
silently switch to fallback mode.
