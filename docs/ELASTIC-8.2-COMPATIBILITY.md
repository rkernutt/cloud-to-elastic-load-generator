# Elastic 8.2 Compatibility Guide

This branch provides AWS assets (dashboards, alerting rules, and ML jobs) compatible with **Elastic 8.2**.

## Asset Compatibility Matrix

| Asset Type           | 8.2 Status    | Notes                                           |
| -------------------- | ------------- | ----------------------------------------------- | ------------------------------------------- |
| **Ingest Pipelines** | Compatible    | Ship as-is, no changes needed                   |
| **ML Anomaly Jobs**  | Compatible    | Ship as-is (requires Platinum+ license)         |
| **Dashboards**       | Converted     | ES                                              | QL → index-pattern Lens (aggregation-based) |
| **Alerting Rules**   | Converted     | `stackAlerts` consumer, stripped 8.11+ features |
| **TSDS Templates**   | Skipped       | Gated behind ES 8.7+ version check              |
| **Workflow**         | Not available | Workflows require Kibana 9.4+                   |

## What Changed for 8.2

### Dashboards

The main dashboards use **ES|QL** (introduced in Kibana 8.11). For 8.2, all 236 AWS dashboards have been converted to **index-pattern Lens** with aggregation-based operations:

- `COUNT()` → `count` operation on `___records___`
- `AVG(field)` → `average` operation
- `SUM(field)` → `sum` operation
- `COUNT_DISTINCT(field)` → `unique_count` operation
- `PERCENTILE(field, N)` → `percentile` operation
- `BY field` → `terms` bucket aggregation
- `BUCKET(@timestamp, ...)` → `date_histogram` aggregation

Complex `EVAL`/`CASE` expressions fall back to simple count metrics (best-effort conversion).

### Alerting Rules

- `consumer` changed from `"alerts"` to `"stackAlerts"` (pre-8.x unified consumer)
- `investigationGuide` field stripped (not supported in 8.2)
- `relatedDashboards` and `artifacts` fields stripped (not supported in 8.2)
- Query DSL in `.es-query` rules works unchanged on 8.2

### TSDS (Time Series Data Streams)

TSDS requires ES 8.7+. The loadgen-packs installer now detects the cluster version and skips TSDS template creation on clusters older than 8.7. Metrics still work as regular data streams.

## Installation

### Prerequisites

1. Elastic 8.2 deployment (Cloud Hosted or Self-Managed)
2. API key with appropriate privileges
3. Node.js 18+

### Step 1: Generate 8.2-compatible NDJSON

```bash
npm run generate:aws-dashboards:ndjson-82
```

This reads the `*-dashboard.json` source files and writes 8.2-compatible saved objects to `installer/aws-custom-dashboards/ndjson-82/`.

### Step 2: Install Dashboards

```bash
npm run setup:aws-dashboards:82
```

Prompts for Kibana URL and API key, then imports all dashboards via the Saved Objects import API.

### Step 3: Install Pipelines (unchanged)

```bash
npm run setup:aws-pipelines
```

Ingest pipelines work identically on 8.2.

### Step 4: Install ML Jobs (unchanged)

```bash
npm run setup:aws-ml
```

ML anomaly detection jobs work identically on 8.2 (requires Platinum/Enterprise or Trial license).

### Step 5: Install Alerting Rules

```bash
# Generate 8.2-compatible rule bundles (if not already done)
npm run generate:aws-rules:82

# Install rules
npm run setup:aws-rules:82
```

### Step 6: Install via Loadgen Packs (optional)

```bash
npm run setup:aws-loadgen-packs
```

The loadgen-packs installer auto-detects the cluster version and skips TSDS templates on ES < 8.7.

## Available npm Scripts

| Script                              | Description                              |
| ----------------------------------- | ---------------------------------------- |
| `generate:aws-dashboards:ndjson-82` | Generate 8.2-compatible dashboard NDJSON |
| `setup:aws-dashboards:82`           | Install dashboards on Kibana 8.2         |
| `generate:aws-rules:82`             | Convert rules to 8.2-compatible format   |
| `setup:aws-rules:82`                | Install rules on Kibana 8.2              |

## Limitations

1. **No ES|QL dashboards** — panels use index-pattern aggregations which may show slightly different results from the ES|QL originals for complex queries
2. **No investigation guides** — stripped from rules (not supported in 8.2)
3. **No dashboard linking on alerts** — the `artifacts.dashboards` feature requires Kibana 8.19+
4. **No workflow** — Kibana Workflows require 9.4+
5. **Complex dashboard panels** — panels with `EVAL`/`CASE` expressions fall back to count metrics
6. **Manual Kibana import** — dashboards can also be imported manually via Kibana UI: **Stack Management → Saved Objects → Import**, uploading files from `ndjson-82/`
