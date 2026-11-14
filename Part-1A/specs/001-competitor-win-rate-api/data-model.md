# Data Model: Competitor Deal Win-Rate API

## Deal

One immutable record of a competitor deal outcome.

| Field | Type | Required | Rules |
|---|---|---:|---|
| `id` | string | Generated | Unique among records in the JSON collection. |
| `competitorName` | string | Yes | Trim whitespace; count Unicode code points; length 1–100 after trimming. |
| `dealValueUSD` | number | Yes | Finite and strictly greater than zero; no string coercion. |
| `domain` | string | Yes | Exact, case-sensitive enum: `BFSI`, `Healthcare`, `Retail`. |
| `status` | string | Yes | Exact, case-sensitive enum: `Won`, `Lost`. |
| `recordedAt` | string | Generated | ISO-8601 timestamp in UTC. |

### Validation Order

Check required properties in the order `competitorName`, `dealValueUSD`, `domain`,
`status`. Stop at the first missing or invalid field and return the corresponding reason
from [the HTTP contract](./contracts/http-api.md). Reject a non-object JSON body before
field validation. Ignore unrecognized properties; do not persist or return them.

### Creation and Persistence

Generate `id` and `recordedAt` only after all request fields pass validation. Persist the
new record before returning HTTP 201. The JSON file is an array of Deal objects. If the
file does not exist, initialize it as `[]`; malformed or unreadable storage is an
internal storage failure and MUST NOT be silently replaced with an empty collection.

## Deal Summary

An aggregate computed from the exact records returned by a collection request, after
applying the optional domain filter.

| Field | Type | Rule |
|---|---|---|
| `total` | number | Count of returned deals. |
| `won` | number | Count with `status` equal to `Won`. |
| `lost` | number | Count with `status` equal to `Lost`. |
| `winRatePercent` | number | `0` when `total` is `0`; otherwise `won / total * 100`, rounded to two decimal places. |

## Relationships and State

- A collection contains zero or more Deal records.
- Deal records are append-only in this feature; editing and deletion are out of scope.
- The summary is derived and is not stored as an independent entity.
- One service process writes the file at a time. Multi-process coordination is not part
  of the data model.
