# Standalone Assets

Pre-exported individual JSON files for every installer asset. Use these to manually deploy assets to Elasticsearch / Kibana without running the installer scripts.

> **Regenerate after changes:** run `node scripts/export-standalone-assets.mjs` to rebuild this directory from the canonical installer sources.

## Directory structure

```
assets/
├── aws/
│   ├── pipelines/    188 ingest pipelines
│   ├── ml-jobs/      384 ML anomaly detection jobs
│   ├── rules/         17 alerting rules
│   └── dashboards/   220 Kibana dashboards
├── gcp/
│   ├── pipelines/    149 ingest pipelines
│   ├── ml-jobs/      152 ML anomaly detection jobs
│   ├── rules/         17 alerting rules
│   └── dashboards/   127 Kibana dashboards
├── azure/
│   ├── pipelines/    125 ingest pipelines
│   ├── ml-jobs/      154 ML anomaly detection jobs
│   ├── rules/         17 alerting rules
│   └── dashboards/   120 Kibana dashboards
└── workflows/         1 cross-cloud Kibana Workflow YAML
```

Every JSON file contains a `_meta` block at the top with the asset identifier and the exact Elasticsearch / Kibana API call required to deploy it.

## Deploying individual assets

### Ingest pipelines

Each file is a complete pipeline body. Strip `_meta` (Elasticsearch ignores it) and PUT to the pipeline API:

```bash
# Example: deploy the AWS Glue pipeline
curl -X PUT "https://<ES_URL>/_ingest/pipeline/logs-aws.glue-default" \
  -H "Authorization: ApiKey <KEY>" \
  -H "Content-Type: application/json" \
  -d @assets/aws/pipelines/logs-aws.glue-default.json
```

Elasticsearch stores `_meta` as pipeline metadata, so you can PUT the file as-is without stripping it.

### ML anomaly detection jobs

Each file contains `job` (the job config) and `datafeed` (the datafeed config). Deploy in two steps:

```bash
# 1. Create the job
JOB_ID="aws-data-pipeline-error-spike"
curl -X PUT "https://<ES_URL>/_ml/anomaly_detectors/$JOB_ID" \
  -H "Authorization: ApiKey <KEY>" \
  -H "Content-Type: application/json" \
  -d "$(jq '.job' assets/aws/ml-jobs/$JOB_ID.json)"

# 2. Create the datafeed
curl -X PUT "https://<ES_URL>/_ml/datafeeds/datafeed-$JOB_ID" \
  -H "Authorization: ApiKey <KEY>" \
  -H "Content-Type: application/json" \
  -d "$(jq '.datafeed' assets/aws/ml-jobs/$JOB_ID.json)"

# 3. Open the job and start the datafeed
curl -X POST "https://<ES_URL>/_ml/anomaly_detectors/$JOB_ID/_open" \
  -H "Authorization: ApiKey <KEY>"
curl -X POST "https://<ES_URL>/_ml/datafeeds/datafeed-$JOB_ID/_start" \
  -H "Authorization: ApiKey <KEY>"
```

### Alerting rules

Each file is a complete Kibana alerting rule body (minus the `_meta`). POST to the Kibana alerting API:

```bash
curl -X POST "https://<KIBANA_URL>/api/alerting/rule" \
  -H "Authorization: ApiKey <KEY>" \
  -H "Content-Type: application/json" \
  -H "kbn-xsrf: true" \
  -d "$(jq 'del(._meta)' assets/aws/rules/cloudloadgen-data-pipeline-failure-rate.json)"
```

### Dashboards

Dashboard files are Kibana saved-object NDJSON exports. Import via the saved objects API:

```bash
curl -X POST "https://<KIBANA_URL>/api/saved_objects/_import?overwrite=true" \
  -H "Authorization: ApiKey <KEY>" \
  -H "kbn-xsrf: true" \
  -F file=@assets/aws/dashboards/glue-dashboard.json
```

### Kibana Workflows

Workflow YAML files live under `assets/workflows/`. They are mirrors of the
canonical sources in `workflows/` so you can copy/paste them into Stack
Management → Workflows → Create without rooting around the source tree:

```bash
# Or install via API on Stack 9.3+ — the wizard uses the same call
curl -X POST "https://<KIBANA_URL>/api/workflows/_workflows" \
  -H "Authorization: ApiKey <KEY>" \
  -H "kbn-xsrf: true" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --rawfile y assets/workflows/data-pipeline-alert-enrichment.yaml \
    '{name:"Data Pipeline Alert — CMDB Enrichment & Notification", description:"", yaml:$y, enabled:true, tags:["data-pipeline","servicenow","enrichment","automated-response"]}')"
```

For the interactive headless installer (with `notifyTo` / `emailConnector`
overrides and 9.4 auto-detect), run `npm run setup:workflow` instead.

## Bulk deploy all assets for a cloud

To deploy every asset for a cloud provider at once, use the installer scripts instead:

```bash
# AWS example (installs pipelines, dashboards, ML jobs, and rules)
npm run setup:aws-pipelines
npm run setup:aws-dashboards
npm run setup:aws-ml-jobs
npm run setup:alert-rules
npm run setup:workflow

# Or, to install pipeline + dashboard + ML jobs + rules per chosen service:
npm run setup:aws-loadgen-packs
```

`npm run setup:alert-rules` and `npm run setup:workflow` are both cross-cloud.
The first walks every `installer/{aws,gcp,azure}-custom-rules/` JSON file and
creates the alerting rules; the second installs the bundled Kibana Workflow
that enriches those alerts with ServiceNow CMDB context. There is no per-cloud
variant of either.

Or use the web UI Setup wizard, which handles all of this automatically and adds uninstall support.
