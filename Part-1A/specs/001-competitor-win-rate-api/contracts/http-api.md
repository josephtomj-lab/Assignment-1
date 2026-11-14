# HTTP API Contract

## Shared Rules

- All responses use `Content-Type: application/json`.
- Request and response JSON field names are case-sensitive.
- Only `GET /deals` and `POST /deals` are supported. Any other path/method pair returns
  HTTP 404 with exactly `{ "error": "Not found" }`.
- Request bodies larger than 10,240 bytes return HTTP 400 before JSON parsing.
- Validation errors return HTTP 400 with `{ "error": "<specific reason>" }`.

## `POST /deals`

### Request

JSON object with these required properties:

| Property | Type | Constraint |
|---|---|---|
| `competitorName` | string | Trimmed length 1–100 Unicode code points. |
| `dealValueUSD` | number | Finite and greater than zero. |
| `domain` | string | `BFSI`, `Healthcare`, or `Retail`, case-sensitive. |
| `status` | string | `Won` or `Lost`, case-sensitive. |

Unknown request properties are ignored and are not persisted.

### Success — HTTP 201

Returns the created Deal object:

```json
{
  "id": "deal-<timestamp>-<process>-<sequence>",
  "competitorName": "Acme",
  "dealValueUSD": 250000,
  "domain": "BFSI",
  "status": "Won",
  "recordedAt": "2026-11-14T04:30:00.000Z"
}
```

`id` and `recordedAt` are generated values; the example values are illustrative.

### Validation Errors — HTTP 400

| Condition | Exact `error` value |
|---|---|
| Body is malformed JSON | `Malformed JSON` |
| Body exceeds 10,240 bytes | `Payload exceeds 10KB` |
| Parsed JSON is not an object | `Body must be a JSON object` |
| `competitorName` is absent | `competitorName is required` |
| `competitorName` is not a string | `competitorName must be a string` |
| Trimmed `competitorName` is empty or longer than 100 code points | `competitorName must contain 1 to 100 characters` |
| `dealValueUSD` is absent | `dealValueUSD is required` |
| `dealValueUSD` is not a finite number greater than zero | `dealValueUSD must be a finite number greater than 0` |
| `domain` is absent | `domain is required` |
| `domain` is not an allowed exact value | `domain must be BFSI, Healthcare, or Retail` |
| `status` is absent | `status is required` |
| `status` is not an allowed exact value | `status must be Won or Lost` |

The first invalid field in the order `competitorName`, `dealValueUSD`, `domain`,
`status` determines the returned field-validation message. Rejected requests do not
modify the collection.

## `GET /deals`

### Optional Query

`domain` filters the returned collection by exact, case-sensitive domain. If repeated,
the first `domain` value is used. Unknown query parameters are ignored.

An unrecognized `domain` value returns HTTP 400:

```json
{ "error": "domain must be BFSI, Healthcare, or Retail" }
```

### Success — HTTP 200

```json
{
  "deals": [],
  "summary": {
    "total": 0,
    "won": 0,
    "lost": 0,
    "winRatePercent": 0
  }
}
```

The summary counts and win rate are computed from the returned deals after filtering.
For a non-empty result, `winRatePercent` is `won / total * 100`, rounded to two decimal
places.

## Storage Failure — HTTP 500

An unreadable, malformed, or unwritable data file returns exactly:

```json
{ "error": "Internal server error" }
```

The response MUST NOT expose filesystem paths, credentials, or secrets.
