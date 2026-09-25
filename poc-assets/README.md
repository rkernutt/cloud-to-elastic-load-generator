# POC assets — Data Pipeline Observability & Data Quality

Everything referenced as "pre-built" in the POC scope document, copied out of the
main repo into one folder so it can be shared or reviewed without the rest of the
load generator codebase.

These are **copies for reference/sharing only**. The source of truth is the main
repo; regenerate this folder if the underlying files change (see "Regenerating"
below).

## Contents

| Folder | What's in it |
| --- | --- |
| `dashboards/` | 3 Kibana dashboards: pipeline observability, OpenLineage run lineage, Glue jobs & data quality |
| `alert-rules/` | 9 Kibana alerting rules covering failure rate, DQ, schema drift, lineage job failures and slow runs |
| `ml-jobs/` | 7 anomaly-detection jobs: duration/error/latency anomalies, DQ score drift, lineage job failures, lineage output rows |
| `ingest-pipelines/` | 5 Elasticsearch ingest pipelines that parse the raw payloads for this pipeline's telemetry: MWAA, EMR logs, Glue job logs, Glue Data Quality results, OpenLineage RunEvents |
| `workflows/` | The Kibana Workflow that enriches an alert with run id, lineage table, baseline comparison and DQ result before it reaches a human |

## Installing these in a target Elastic deployment

These are extracted copies; the installer scripts that actually apply them read
from the live repo, not from this folder. To install into a deployment, run
from the repo root:

```bash
npm run setup:aws-dashboards
npm run setup:aws-ml-jobs
npm run setup:alert-rules
npm run setup:aws-pipelines
npm run setup:workflow
```

Each script is idempotent but **skips assets that already exist** rather than
overwriting them — if you're re-running after a fix, delete the existing asset
in Kibana first (or ask for a force-reinstall option).

## Regenerating this folder

The ingest pipelines are generated code (`installer/aws-custom-pipelines/pipelines/registry.mjs`),
so they were extracted programmatically rather than hand-copied. To refresh
everything after a change upstream:

```bash
cp installer/aws-custom-dashboards/data-pipeline-dashboard.json poc-assets/dashboards/
cp installer/aws-custom-dashboards/data-pipeline-lineage-dashboard.json poc-assets/dashboards/
cp installer/aws-custom-dashboards/glue-dashboard.json poc-assets/dashboards/
cp installer/aws-custom-rules/data-pipeline-rules.json poc-assets/alert-rules/
cp installer/aws-custom-ml-jobs/jobs/data-pipeline-jobs.json poc-assets/ml-jobs/
cp workflows/data-pipeline-alert-enrichment.yaml poc-assets/workflows/

node -e "
import('./installer/aws-custom-pipelines/pipelines/registry.mjs').then(mod => {
  const fs = require('fs');
  const ids = ['logs-aws.emr_logs-default','logs-aws.glue-default','logs-aws.glue_dataquality-default','logs-aws.mwaa-default','logs-aws.openlineage-default'];
  for (const id of ids) {
    const entry = mod.PIPELINE_REGISTRY.find(p => p.id === id);
    const name = id.replace('logs-aws.','').replace('-default','') + '-pipeline.json';
    fs.writeFileSync('poc-assets/ingest-pipelines/' + name, JSON.stringify(entry, null, 2));
  }
});
"
```
