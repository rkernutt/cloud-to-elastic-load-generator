# Rubrik → Elastic PoC — sample load generator

Use this load generator to exercise Rubrik ingest **before** real RSC/CDM traffic. Pipelines and ECS mapping live in [`rkernutt/rubrik-elastic-ingest`](https://github.com/rkernutt/rubrik-elastic-ingest); this repo emits matching sample shapes.

## Elastic 9.x compatibility

Validated for **all Elastic 9.x** (floor **9.0+**), not only the latest patch.

| Surface                    | Contract                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| CLI `--mode elasticsearch` | `_bulk` with **`create`** only (data streams), `Content-Type: application/x-ndjson`, `Authorization: ApiKey …`, optional `?pipeline=` |
| Docs                       | Every bulk doc gets **`@timestamp`** (copied from Rubrik `timestamp` / `lastUpdated` / `time` when present)                           |
| Routing                    | Loadgen-only `__dataset` is stripped before ship                                                                                      |
| Pipelines                  | Names match ingest repo: `rubrik-common-ecs`, `rubrik-webhook`, `rubrik-graphql-events`, `rubrik-syslog`                              |
| Streams                    | `logs-rubrik.webhook\|graphql\|syslog-default` (same as ingest index templates)                                                       |
| ECS stamp                  | `ecs.version: 8.11.0` on UI/`--ecs` docs (pipeline may set `8.17.0` with `override: false`)                                           |

Avoid pinning `compatible-with=` Accept headers, `index` actions on data streams, or Kibana/workflow features that require 9.3+/9.4+ for this PoC path. UI Ship uses the same `create` + strip-`__dataset` pattern via `/proxy/_bulk`.

If field or pipeline names change in `rubrik-elastic-ingest`, update this loadgen in lockstep (`src/ship/esBulkCompat.ts`, generators, and this doc).

## What you get

| Service (Supporting Services UI)             | Dataset / stream        | Raw shape                                                |
| -------------------------------------------- | ----------------------- | -------------------------------------------------------- |
| **Rubrik RSC Webhooks** (`rubrik_webhook`)   | `logs-rubrik.webhook-*` | PD-CEF JSON or flat Elastic custom event/audit           |
| **Rubrik GraphQL Events** (`rubrik_graphql`) | `logs-rubrik.graphql-*` | `activitySeriesConnection` / `userAuditConnection` nodes |
| **Rubrik CDM Syslog** (`rubrik_syslog`)      | `logs-rubrik.syslog-*`  | RFC 3164 lines with grok-friendly MSG                    |

Every mix includes **Anomaly / `RansomwareStrainDetected`** with **`severity: critical`** and **`status: Success`** (SIEM must key on severity, not failure).

## Prerequisites

1. Install ingest pipelines from `rubrik-elastic-ingest` (`rubrik-common-ecs`, then `rubrik-webhook`, `rubrik-graphql-events`, `rubrik-syslog`) on an **Elastic 9.0+** cluster.
2. Install `logs-rubrik.*` index templates from that repo (`elasticsearch/install.sh --bootstrap`) so data streams auto-create.
3. Point Agent integrations at those pipelines:
   - **Custom HTTP Endpoint** → `rubrik-webhook` (and optionally GraphQL relay)
   - **CEL Custom API** → `rubrik-graphql-events`
   - **Custom TCP/UDP Logs** + syslog parsing → `rubrik-syslog`

## Option A — CLI (recommended for Agent / pipeline PoC)

```bash
# Stage files (NDJSON + syslog.log) under samples/rubrik/
npm run rubrik:loadgen -- --mode file --path all --count 40 --anomaly

# POST raw webhooks to Custom HTTP Endpoint
npm run rubrik:loadgen -- --mode http --path webhook --count 25 \
  --url http://<agent-host>:8080/

# POST GraphQL-shaped nodes (same HTTP endpoint or a dedicated path)
npm run rubrik:loadgen -- --mode http --path graphql --count 25 \
  --url http://<agent-host>:8080/graphql

# TCP syslog → Custom TCP Logs
npm run rubrik:loadgen -- --mode syslog --path syslog --count 20 \
  --syslog-host <agent-host> --syslog-port 9514

# Elasticsearch _bulk through the pipeline (no Agent) — Elastic 9.0+
npm run rubrik:loadgen -- --mode elasticsearch --path webhook --count 25 \
  --es-url https://<ES>:9200 --api-key "$ES_API_KEY" \
  --pipeline rubrik-webhook --index logs-rubrik.webhook-default
```

| Flag                                       | Meaning                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `--mode file\|http\|elasticsearch\|syslog` | Destination                                                               |
| `--path webhook\|graphql\|syslog\|all`     | Event family                                                              |
| `--anomaly`                                | Force ransomware Success+critical samples                                 |
| `--ecs`                                    | Ship post-pipeline ECS docs instead of raw                                |
| `--pipeline`                               | `_bulk?pipeline=` (defaults per path when `--mode elasticsearch` and raw) |

Pretty anomaly samples are also written as `samples/rubrik/*-anomaly-sample.json` in file mode.

## Option B — UI Ship → Elasticsearch

1. Start the app (`./docker-up` or `npm run dev` + proxy).
2. **Start** → vendor **Supporting Services**.
3. **Services** → enable **Rubrik RSC Webhooks** / **GraphQL** / **CDM Syslog**.
4. **Ship** → documents land on `logs-rubrik.*-default` as ECS-wrapped samples (raw payload in `message` / `event.original`).

Use the UI when you want Discover-ready docs without Agent. Use the CLI when you need to validate Agent inputs + ingest pipelines.

## Verify in Kibana

ES|QL below works on Elastic **9.0+** (no 9.1+-only syntax):

```esql
FROM logs-rubrik.*
| WHERE rubrik.severity == "critical" AND rubrik.class IN ("Anomaly", "ANOMALY")
| KEEP @timestamp, message, rubrik.status, rubrik.activity.name, event.outcome, event.kind
| SORT @timestamp DESC
| LIMIT 20
```

Expect `rubrik.status: Success` (or `event.outcome: success`) alongside critical anomalies — rules should **not** require Failure.

## Related

- ECS mapping: Project `docs/rubrik-ecs-field-mapping.md` / ingest repo `docs/ecs-field-mapping.md`
- Pipelines: `rkernutt/rubrik-elastic-ingest` → `pipelines/`
- Generators: `src/rubrik/generators/`
- Shared bulk helpers: `src/ship/esBulkCompat.ts`
- CLI: `scripts/rubrik-loadgen.mjs`
