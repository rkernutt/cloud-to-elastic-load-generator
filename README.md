# Cloud to Elastic Load Generator

A single web UI for bulk-generating realistic **AWS**, **Google Cloud**, and **Microsoft Azure** observability data (logs, metrics, and traces) and shipping it to Elasticsearch with the `_bulk` API. Pick your hyperscaler on the **Start** step; documents follow **ECS** naming and integration-style metadata so they behave like production ingest.

Generators produce **real-life native-format outputs** for each cloud — AWS CloudWatch / S3 / Firehose shapes, GCP Cloud Logging API v2 / Cloud Monitoring TimeSeries, Azure Resource Log / Monitor Metrics / Application Insights — so the data matches what you see from actual cloud workloads.

The header uses a vendor-neutral cloud mark; AWS, GCP, and Azure logos appear in the wizard when choosing a cloud.

**Icons:** GCP/Azure flat SVGs and maps are committed under `public/gcp-icons/`, `public/azure-icons/`, and `src/cloud/generated/vendorFileIcons.ts`. AWS icons in `public/aws-icons/` are committed so clones work offline; `npm install` re-syncs that folder from the `aws-icons` package to match `src/data/iconMap.ts` and prunes unused files. Maintainers refresh GCP/Azure maps with `npm run icons:vendor` and sources in `local/cloud-icons/` (gitignored).

**Documentation:** [docs/README.md](docs/README.md); **Setup / Serverless / `cloudloadgen` tag:** [docs/SETUP-WIZARD-AND-UNINSTALL.md](docs/SETUP-WIZARD-AND-UNINSTALL.md); **dev:** [docs/development.md](docs/development.md).

**Test / pilot builds:** Use synthetic data and non-production Elasticsearch targets unless you have explicit approval. Before handing off a build, run the same checks as CI (see **Testing and quality** below): `format:check`, `lint`, `typecheck`, `test`, and `build` should all succeed on Node 20.

---

## Cloud Loadgen Integrations

Assets are installed **per service** as **Cloud Loadgen Integrations** — each service gets its own bundle of:

| Asset type                        | Description                                                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Ingest pipeline**               | Routes and parses logs into the correct data stream; uses **TSDS** (Time Series Data Stream) for metrics where appropriate |
| **Index / data stream templates** | `logs-*` and `metrics-*` data views for dashboard panels                                                                   |
| **Kibana dashboard**              | ES\|QL-based visualisation (Lens panels) tailored to that service                                                          |
| **ML anomaly detection jobs**     | Detect operational and security anomalies (error spikes, latency, rare activity)                                           |
| **Alerting rules**                | Elasticsearch query-based rules for critical patterns (e.g. data pipeline failures)                                        |

All assets are tagged **`cloudloadgen`** so you can:

- **Filter** in Kibana **Saved Objects → Tags → cloudloadgen** to see every dashboard at a glance
- **Bulk-edit** or **bulk-delete** load-generator assets without touching production objects
- ML jobs and pipelines include `cloudloadgen` in their metadata/descriptions for the same easy filtering

The **Setup** page in the web UI groups integrations by **service category** (Compute, Networking, Storage, Databases, Analytics, AI & ML, etc.) and lets you install or remove per service. The same assets can be installed from the CLI — see [installer/README.md](installer/README.md), including **`npm run setup:alert-rules`** for Kibana Elasticsearch-query alert rules.

The shipping wizard supports a **Back** button on each step, **search and filter** on the Services step to find providers quickly, and **connection test gating** (a successful connection test is required before you can continue). When a ship run finishes, **Ship Again** and **Reconfigure** let you repeat or adjust the flow without starting from scratch. **Scheduled shipping is disabled by default** — users must explicitly enable it on the Ship step.

**Post-install options:** After installing integrations, you can optionally **enable alerting rules** and **start ML jobs** immediately. Both toggles are off by default — rules are created disabled and ML jobs are created closed unless you opt in.

### Chained Events

Beyond single-service generators, the app includes **Chained Events** — multi-step correlated scenarios that span several services. Generators use **time-distributed timestamps** and shared **`labels.*` correlation IDs** (for example `finding_chain_id`, `attack_session_id`, `exfil_chain_id`) so events read like real detections and investigations rather than simultaneous bursts.

All chained event generators include **ECS user identity fields** (`user.name`, `user.email`, `source.ip`, `user_agent.original`) and produce **companion cloud audit trail events** (CloudTrail for AWS, Cloud Audit Logs for GCP, Activity Logs for Azure) alongside the operational logs. This provides realistic attribution and enables correlation with ServiceNow CMDB records for alert enrichment (e.g. "who triggered the pipeline that failed?").

- **Data & Analytics Pipeline** (AWS: S3 → EMR → Glue → Athena → MWAA; GCP: GCS → Dataproc → Data Catalog → BigQuery → Composer; Azure: Blob → Databricks → Purview → Synapse → Data Factory) — includes APM traces for the Elastic Service Map, dashboards, ML jobs, and alerting rules (`data-pipeline-*` assets).
- **Security Finding Chain** — native detect → hub → lake (or SCC/SecOps, Defender/Sentinel/Activity Log); installer assets per cloud: `security-finding-chain` / `gcp-security-finding-chain` / `azure-security-finding-chain` dashboards, rules, and ML jobs.
- **IAM Privilege Escalation Chain** — MITRE-aligned IAM audit progression with stable attacker/target identity; `iam-privesc-chain` / `gcp-iam-privesc-chain` / `azure-iam-privesc-chain` assets.
- **Data Exfiltration Chain** — detection plus storage and network evidence with MB-scale volumes; `data-exfil-chain` / `gcp-data-exfil-chain` / `azure-data-exfil-chain` assets.

See [docs/chained-events/](docs/chained-events/) for timing, field-level correlation, and failure-mode documentation. Install matching dashboards, ML jobs, and rules with the [installer/README.md](installer/README.md) scripts or the web UI **Setup** step.

### CSPM / KSPM — Real CIS Benchmark Findings

The CSPM and KSPM generators produce findings documents identical to what Elastic's [cloudbeat](https://github.com/elastic/cloudbeat) agent writes to `logs-cloud_security_posture.findings-default`. Every finding uses **real CIS rule UUIDs, names, sections, and benchmark metadata** sourced from the `elastic/cloudbeat` security-policies (321 rules total):

| Benchmark                    | Rules | Coverage                                                                      |
| ---------------------------- | ----- | ----------------------------------------------------------------------------- |
| CIS AWS Foundations v1.5.0   | 55    | IAM, S3, EC2, RDS, Logging, Monitoring, Networking                            |
| CIS GCP Foundations v2.0.0   | 71    | IAM, Logging, Networking, VMs, Storage, SQL, BigQuery                         |
| CIS Azure Foundations v2.0.0 | 72    | IAM, Defender, Storage, SQL, Logging, Networking, VMs, Key Vault, App Service |
| CIS EKS v1.4.0               | 31    | Logging, Authentication, Networking, Pod Security                             |
| CIS Kubernetes v1.0.1        | 92    | Control Plane, etcd, RBAC, Worker Nodes, Pod Security Standards               |

Failed findings include **realistic resource configurations and evidence** — S3 buckets without encryption, security groups allowing 0.0.0.0/0 SSH, IAM users without MFA, pods running as privileged, etc. When the `cloud_security_posture` Fleet integration is installed (automatic when CSPM/KSPM services are selected in the Setup wizard), Elastic's built-in **Posture Dashboard**, **Findings page**, and **Benchmark Rules** pages display the generated data exactly as they would with real cloud infrastructure.

### ServiceNow CMDB Integration

The app includes a **ServiceNow CMDB log generator** that produces realistic records across key CMDB and ITSM tables:

| Table             | Description                                              |
| ----------------- | -------------------------------------------------------- |
| `cmdb_ci`         | Configuration items (cloud infrastructure mapped to CIs) |
| `cmdb_ci_service` | Business services (Data Pipeline Service, etc.)          |
| `cmdb_rel_ci`     | CI-to-CI relationships (depends-on, runs-on, etc.)       |
| `incident`        | Incidents with priority, assignment, and resolution      |
| `change_request`  | Change requests with risk, approval, and test plans      |
| `sys_user`        | User records correlated with pipeline operators          |
| `sys_user_group`  | Support groups (Data Engineering Team, etc.)             |
| `cmn_department`  | Departments and department heads                         |
| `cmn_location`    | Office locations                                         |

Data uses the `servicenow.event` dataset (routed to `logs-servicenow.event-*`) and follows the integration's `.value` / `.display_value` field convention. CIs are correlated with cloud infrastructure names from the data pipeline chains (e.g. `mwaa-globex-prod`, `emr-analytics-cluster`) and users align with the same `DATA_ENGINEERING_USERS` pool used by chained event generators — enabling **cross-index correlation** between pipeline alerts and ServiceNow CMDB records.

ServiceNow CMDB is treated as **reference data** — capped at 50 documents per ship run. Enable the **ServiceNow** Fleet integration toggle in the Setup wizard to install the `servicenow` integration package.

### Elastic Workflows

A sample **Elastic Workflow** YAML is provided in [`workflows/data-pipeline-alert-enrichment.yaml`](workflows/data-pipeline-alert-enrichment.yaml). This workflow:

1. Triggers on any data pipeline alerting rule
2. Queries pipeline logs for the triggering user's identity
3. Looks up the user and affected CI in ServiceNow CMDB
4. Checks for open incidents and recent change requests
5. Creates a Kibana case when multiple incidents are found
6. Sends an enriched Slack notification with contact information
7. Indexes the enrichment result back to Elasticsearch

### ML Training Mode

The **Ship** page includes an **ML Training Mode** that automates the full anomaly detection training workflow:

1. **Baseline phase** — ships normal data for a configurable number of runs to establish an ML baseline
2. **Learning wait** — pauses for a configurable duration while ML jobs learn the baseline pattern
3. **Anomaly injection** — ships one batch with anomalies (100% error rate, 15x duration scaling for logs and traces, 20x metric scaling) to create a detectable anomaly

This removes the manual work of shipping normal data, waiting, then injecting anomalies. Configuration options include baseline run count, learning wait duration, and interval between runs.

### Serverless Use-Case Selector

The **Start** (Connection) page includes an **Elastic use-case** selector for Serverless deployments:

| Use Case          | Available Features                                                            |
| ----------------- | ----------------------------------------------------------------------------- |
| **Security**      | Full feature set including CSPM/KSPM, all chained events, all Security assets |
| **Observability** | All observability features; CSPM/KSPM not available                           |
| **Elasticsearch** | Data shipping and search-focused features only                                |

This restricts the Setup and Services pages to features compatible with the chosen Serverless project type, preventing installation errors from attempting to use unsupported APIs.

---

## Quick start

### Docker (recommended)

After clone or `git pull`, from the repo root:

```bash
./docker-up
```

Or: `npm run docker:up`

This builds the image and starts the container. Open **http://localhost:8765**.

You need a **full clone** (including `installer/`). If the build says installer assets are missing, run `git checkout HEAD -- installer/aws-custom-dashboards installer/aws-custom-ml-jobs installer/aws-loadgen-packs` (or `git sparse-checkout disable`) and try again.

### Docker CLI (manual)

```bash
docker build -t cloud-to-elastic-load-generator .
docker run -d -p 8765:80 --name cloud-to-elastic-load-generator cloud-to-elastic-load-generator
```

For a build that matches `./docker-up`, use `npm run docker:build` (tar-based context). Plain `docker compose build` can work on some setups but may omit large `installer/` trees on Docker Desktop.

### Local development

```bash
npm install
```

Shipping to Elasticsearch from the dev server uses a small bulk proxy (same pattern as the Docker image). Two terminals:

```bash
# Terminal 1 — proxy (default port 3001)
node proxy.cjs

# Terminal 2 — Vite (proxies /proxy to the proxy)
npm run dev
# → http://localhost:3000
```

---

## API key permissions

The load generator connects to Elasticsearch with an API key. Two least-privilege key definitions are provided in [`installer/api-keys/`](installer/api-keys/):

| Key             | File               | Grants                                                                                                             |
| --------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| **Ship-only**   | `ship-only.json`   | Bulk-index logs, metrics, and traces — nothing else                                                                |
| **Full-access** | `full-access.json` | Ship data **plus** install/uninstall dashboards, ML jobs, alerting rules, ingest pipelines, and Fleet integrations |

Both keys include `metadata.tags: ["cloudloadgen"]` so they are easy to find alongside the assets they manage.

Create a key via **Dev Tools** (`POST /_security/api_key`) or cURL using the JSON file as the request body. For full details — privilege breakdown, API operations reference, Serverless notes, and revocation — see [docs/api-key-permissions.md](docs/api-key-permissions.md).

---

## Testing and quality

| Command                                   | Purpose                                                                                                                     |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `npm run test`                            | Vitest, then regenerate **all** sample JSON (**`samples/aws`**, **`samples/gcp`**, **`samples/azure`**) and verify coverage |
| `npm run test:watch`                      | Vitest watch only                                                                                                           |
| `npm run samples`                         | Regenerate samples for every cloud                                                                                          |
| `npm run samples:verify`                  | Verify sample trees match generator registries                                                                              |
| `npm run format` / `npm run format:check` | Prettier                                                                                                                    |
| `npm run lint` / `npm run typecheck`      | ESLint and `tsc --noEmit`                                                                                                   |
| `npm run build`                           | Production build                                                                                                            |

CI runs format, lint, typecheck, test, and build on Node 20.

---

## Architecture (runtime)

```
Browser → nginx (port 80) → React SPA
                                ↓
                         /proxy/_bulk
                                ↓
                     Node.js proxy → Elasticsearch _bulk
```

Credentials stay in the browser session; the proxy forwards requests and may log metadata-only access lines (see proxy comments in `proxy.cjs`).

---

## Sample data

Reference JSON for each registered generator is under **`samples/{aws,gcp,azure}/`**. Regenerate with `npm run samples` and verify with `npm run samples:verify`.

---

## License and contributors

See the repository license file (if present) and [CONTRIBUTORS.md](CONTRIBUTORS.md).
