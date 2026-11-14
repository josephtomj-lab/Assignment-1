# Data Model: RFP Pain-Point Extraction and Evaluation Harness

## Extraction Request

A transient request supplied by an analyst or client application.

| Field | Type | Constraints |
|---|---|---|
| `rfpText` | string | Trimmed before processing; 20-50,000 Unicode code points |
| `clientDomain` | string | Optional; `BFSI`, `Healthcare`, `Retail`, or `General`; defaults to `General` |

The complete JSON request body MUST be no larger than 51,200 encoded bytes.
Extra properties are ignored. Request text is not persisted to the evaluation
report or routine logs.

## Pain Point

One extracted and source-grounded client need.

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Non-empty and stable within the result; fallback IDs are repeatable |
| `category` | string | `Legacy Modernization`, `Cost & Operational Efficiency`, `Compliance & Security`, `Customer Experience`, or `Data & Analytics` |
| `severity` | string | `High`, `Medium`, or `Low` |
| `summary` | string | Non-empty, actionable description |
| `evidenceQuote` | string | Non-empty substring of the trimmed source text, matched case-insensitively |

Pain points belong to one extraction result. Result order and fallback IDs MUST
be deterministic for the same input.

## Extraction Result

The API success envelope that groups one request's extraction.

| Field | Type | Constraints |
|---|---|---|
| `mode` | string | `llm` or `fallback` |
| `clientDomain` | string | The validated request domain or `General` |
| `painPoints` | array of Pain Point | May be empty |
| `summary.totalPainPoints` | integer | Exactly the number of items in `painPoints` |
| `summary.highSeverityCount` | integer | Exactly the number of points with `High` severity |

## Gold Evaluation Case

A curated benchmark item used to compare extractor output with reviewed
ground truth.

| Field | Type | Constraints |
|---|---|---|
| `id` | string | Unique and stable case identifier |
| `clientDomain` | string | One supported domain |
| `rfpText` | string | Realistic IT Services/BPO excerpt |
| `expectedPainPoints` | array of Pain Point references | Ground-truth labels and reference evidence |
| `expectedCategories` | array of string | Derived or explicitly stored category-presence labels |

`eval/gold-dataset.json` MUST contain at least five cases and collectively
cover all five categories. The dataset itself is reviewed test data; generated
reports contain case IDs and scores, not the source excerpts.

## Evaluation Case Result

The per-case assessment of one extraction against one Gold Evaluation Case.

| Field | Type | Constraints |
|---|---|---|
| `caseId` | string | References one gold case |
| `layer1` | object | Binary pass/fail plus structural validation findings |
| `layer2` | object | Evidence-grounding status and matched/unmatched quote counts |
| `layer3` | object | 1-5 scores for actionability, specificity, and domain relevance |
| `overall` | string | Per-case pass/fail derived from configured gates |

## Evaluation Report

The stable aggregate output written to `eval/report.json`.

| Field | Type | Constraints |
|---|---|---|
| `caseResults` | array of Evaluation Case Result | Stable order by case ID |
| `categoryMetrics` | array of objects | Fixed category order; TP, FP, FN, precision, recall, F1 |
| `macroF1` | number | Unweighted mean of the five category F1 values |
| `rubricMeans` | object | Mean for each of the three dimensions and overall |
| `thresholds` | object | Threshold values used for pass/fail |
| `scorerMode` | string | Identifies LLM judge or deterministic fallback |
| `overall` | string | `PASS` only when every required gate passes |

The report MUST omit volatile timestamps, credentials, complete RFP excerpts,
and provider responses. Offline mode uses fixed ordering and numeric precision
so identical inputs produce identical report content.

## Relationships and Evaluation Flow

- One Extraction Request produces one Extraction Result containing zero or
  more Pain Points.
- One Gold Evaluation Case has one source excerpt and ground-truth labels.
- One evaluation run creates one Evaluation Case Result per gold case and
  aggregates those results into one Evaluation Report.
- Layer 1 validates each result's shape and counts. Layer 2 checks every quote
  against its source and computes category-presence metrics against gold
  labels. Layer 3 scores the three rubric dimensions.
