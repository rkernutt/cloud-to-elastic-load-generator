# Setup wizard and uninstall behavior

The **Setup** step in the web UI installs or removes Elastic assets for the cloud you chose on **Start** (AWS, GCP, or Azure). Assets are organised as **Cloud Loadgen Integrations** — each service gets a bundle of ingest pipelines, data stream templates, Kibana dashboards, ML anomaly detection jobs, and alerting rules, all installed together. CLI equivalents live under `installer/` — see [installer/README.md](../installer/README.md).

---

## Cloud Loadgen Integrations

Each service integration can include:

| Asset                         | Description                                                           | API                                           |
| ----------------------------- | --------------------------------------------------------------------- | --------------------------------------------- |
| **Ingest pipeline**           | Parses and routes logs into the correct data stream; TSDS for metrics | Elasticsearch Ingest Pipeline API             |
| **Data stream templates**     | `logs-*` and `metrics-*` data views for dashboard panels              | Kibana Saved Objects API                      |
| **Kibana dashboard**          | ES\|QL Lens panels tailored to the service                            | Kibana Dashboards API or Saved Objects import |
| **ML anomaly detection jobs** | Detect error spikes, latency anomalies, rare activity                 | Elasticsearch ML API                          |
| **Alerting rules**            | Elasticsearch query-based rules for critical patterns                 | Kibana Alerting API                           |

### The `cloudloadgen` tag

Every installed asset is tagged or labelled **`cloudloadgen`**:

- **Dashboards** — Kibana saved-object tag (deterministic id: `kibana-tag:cloudloadgen`). Filter in **Kibana → Stack Management → Saved Objects → Tags → cloudloadgen** to see all load-generator dashboards
- **ML jobs** — `cloudloadgen` in job description and custom settings metadata
- **Ingest pipelines** — `cloudloadgen` in pipeline description
- **Alerting rules** — tagged with `cloudloadgen` (plus service-specific tags like `data-pipeline`)

This makes it easy to **view**, **bulk-edit**, or **bulk-delete** all load-generator assets in Kibana without affecting production objects.

### Service categories

The Setup page groups integrations by **service category**:

| Category                | Examples                                                                       |
| ----------------------- | ------------------------------------------------------------------------------ |
| Compute                 | Lambda, EC2, ECS, EKS, Cloud Functions, AKS, Virtual Machines                  |
| Networking              | ELB, CloudFront, WAF, Cloud Load Balancing, Azure Firewall                     |
| Storage                 | S3, EBS, Cloud Storage, Blob Storage                                           |
| Databases               | DynamoDB, RDS, Aurora, Cloud SQL, Cosmos DB                                    |
| Streaming & Messaging   | Kinesis, SQS, SNS, Pub/Sub, Event Hubs, Service Bus                            |
| Analytics               | EMR, Glue, Athena, BigQuery, Dataproc, Synapse                                 |
| AI & Machine Learning   | SageMaker, Bedrock, Vertex AI, OpenAI                                          |
| Security & Identity     | GuardDuty, Security Hub, Cloud Armor, Entra ID, Sentinel                       |
| Developer Tools         | CodeBuild, X-Ray, Cloud Build, Azure Pipeline                                  |
| IoT                     | IoT Core, IoT Hub                                                              |
| Management & Governance | CloudWatch, CloudFormation, Cloud Monitoring, Azure Monitor                    |
| End User & Media        | WorkSpaces, Connect, Media Services                                            |
| Advanced Data Types     | Data & Analytics Pipeline, ServiceNow CMDB, CSPM/KSPM, chained event scenarios |

Categories are collapsible, making it easy to navigate large catalogs (**212** AWS log services, **130** GCP, **131** Azure — see `src/data/serviceGroups.ts` and the matching GCP/Azure service group files). AWS services are distributed across specific categories — there is no catch-all "Additional Services" group; every service belongs to a logically appropriate category.

---

## Installing from the CLI

**Per-service bundles (AWS CLI):**

```bash
npm run setup:aws-loadgen-packs
```

This installs the pipeline, dashboard, ML jobs, and alerting rules for each AWS service you select in one run. All assets are tagged `cloudloadgen`.

There is **no** GCP or Azure equivalent CLI bundle — use the **individual asset installers** in the table below for those clouds, or the web UI **Setup** step (same integrations for AWS, GCP, and Azure).

**Individual asset installers** are also available if you only need one type:

| Cloud | Pipelines                       | Dashboards                       | ML Jobs                       |
| ----- | ------------------------------- | -------------------------------- | ----------------------------- |
| AWS   | `npm run setup:aws-pipelines`   | `npm run setup:aws-dashboards`   | `npm run setup:aws-ml-jobs`   |
| GCP   | `npm run setup:gcp-pipelines`   | `npm run setup:gcp-dashboards`   | `npm run setup:gcp-ml-jobs`   |
| Azure | `npm run setup:azure-pipelines` | `npm run setup:azure-dashboards` | `npm run setup:azure-ml-jobs` |

---

## Selecting assets in the web UI

You do **not** have to install everything.

- **Filter** — One search box narrows all integrations across categories.
- **Per-service choice** — Expand a category, then select individual services. Each service shows what it includes (pipeline, dashboard, N ML jobs, alerting rules).
- **Select visible / Clear visible** — Applies to whatever the filter currently shows.
- **Align with Services step** — Uses the services you selected on the **Services** page (log/metrics services, or trace services when the app is in traces mode) to pre-select matching integrations. Matching uses dataset IDs, pipeline naming, dashboard titles, and ML job metadata — it is **heuristic**. If nothing matches, adjust Services or pick assets manually.

The **Services** catalog (order and labels) for each cloud lives in `src/data/serviceGroups.ts` (AWS) and the corresponding `src/gcp/data/serviceGroups.ts` / `src/azure/data/serviceGroups.ts` files.

When you switch cloud vendor on **Start**, the Setup page **remounts** and selections reset to "all selected" for that cloud's bundle.

---

## Post-install options

Below the Cloud Loadgen Integrations row, a **Post-install options** panel provides two toggles:

| Toggle                                  | Default | What it does                                                                                                                             |
| --------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Enable alerting rules after install** | Off     | After all alerting rules are created, calls `POST /api/alerting/rule/{id}/_enable` on each rule so they begin evaluating immediately     |
| **Start ML jobs after install**         | Off     | After all ML jobs are created, opens each anomaly detector (`/_open`) and starts its datafeed (`/_start`) so analysis begins immediately |

Both toggles are disabled when Cloud Loadgen Integrations is toggled off. When off (the default), rules are created disabled and ML jobs are created in a closed state — you can enable/start them later from Kibana.

### ServiceNow CMDB Integration

A dedicated toggle for **ServiceNow CMDB Integration** is available in the Setup wizard under the **Advanced Data Types** category. When enabled, the installer adds the `servicenow` Fleet integration package alongside the cloud vendor integration. This enables Elastic's ServiceNow data views and allows cross-index correlation between pipeline alerts and CMDB records (CI ownership, support groups, open incidents, change requests). ServiceNow CMDB logs are shipped to `logs-servicenow.event-*`.

### ML Training Mode

The **Ship** page provides an **ML Training Mode** that automates the full ML anomaly detection workflow: **reset → baseline → learning wait → anomaly injection → stabilise & freeze**. The reset phase clears stale model state from previous runs to prevent score renormalization. The optional "Stop datafeeds after training" toggle (on by default) freezes anomaly scores by stopping datafeeds after the stabilisation period. See the [README](../README.md#ml-training-mode) for configuration details. This feature is independent of Setup and works with any combination of installed assets.

---

## Serverless use-case selector

The **Start** (Connection) page detects Serverless deployments (`build_flavor: "serverless"`) and presents an **Elastic use-case** selector:

| Use Case          | CSPM/KSPM | Security chains | Observability features | Search features |
| ----------------- | --------- | --------------- | ---------------------- | --------------- |
| **Security**      | Yes       | Yes             | Yes                    | Yes             |
| **Observability** | No        | Limited         | Yes                    | Yes             |
| **Elasticsearch** | No        | Limited         | Limited                | Yes             |

The chosen use case restricts which services, integrations, and advanced data types appear in the Setup and Services pages. For example, CSPM/KSPM is only available on **Security** Serverless projects because the `cloud_security_posture` Fleet package is not available on Observability or Elasticsearch projects.

Incompatibility notes are also shown inline in the Setup and Advanced Data Types sections.

---

## Session persistence

- **Setup install/uninstall log** — If the app passes a persistence key (unified UI does), the Setup step log is stored in **sessionStorage** and survives a **tab refresh** in the same browsing session. It does not survive closing the tab/window.
- **Ship activity log** — Same idea under a separate key per cloud.

---

## Uninstall mode

Turn on **Uninstall/Reinstall mode** to remove or reinstall selected assets. Pipeline and ML uninstall use Elasticsearch APIs. Integration uninstall uses Fleet. Dashboard uninstall uses Kibana saved-object delete APIs **when the deployment allows them**.

---

## Elastic Cloud Serverless: Kibana saved objects

Elastic **Cloud Serverless** projects use a **restricted Kibana HTTP surface** compared to stateful (hosted or self-managed) stacks. That affects **custom dashboards** in the Setup wizard because they are Kibana saved objects.

### What Elastic documents

For Serverless, the documented **Saved objects** API group is mainly **export** and **import**:

- [Saved objects (Serverless API)](https://www.elastic.co/docs/api/doc/serverless/group/endpoint-saved-objects)

Broader saved-object **CRUD** (for example `GET` / `PUT` / `DELETE` on `/api/saved_objects/dashboard/…`) is **not** part of that minimal list.

### No setting to "turn on" DELETE / GET / PUT

- Serverless **does not expose** user-editable `kibana.yml` (or equivalent) to re-enable full saved-object APIs.
- There is **no documented Elastic Cloud org/project toggle** that restores stateful-style saved-object **delete** or **update** for arbitrary automation.
- If an API returns **400** with **"not available with the current configuration"**, that is a **product limit**, not something fixed by a stronger API key.

### Dashboard uninstall on Serverless

On some Serverless Kibana deployments, saved-object **delete** routes exist but return **400 Bad Request**. In that case this app **cannot** remove dashboards via the API. The Setup UI detects that pattern, **stops after the first hit**, and explains the limitation.

**What to do:**

1. Remove dashboards in **Kibana** — e.g. **Management → Saved Objects** (filter by tag `cloudloadgen`), or the **Dashboards** app.
2. Or use a **stateful** deployment (Elastic Cloud Hosted or self-managed) where those APIs are available.

### Dashboard reinstall / update on Serverless

**Uninstall & reinstall** cannot clear dashboards first when delete is blocked. The web UI implements supported combinations (Dashboards API when present, otherwise saved-object **import**, then conflict handling). If both delete and in-place update are blocked, use the **Kibana UI** or a **stateful** stack.

### Other Setup assets

**Pipelines**, **ML jobs**, and **alerting rules** use **Elasticsearch** APIs and are **not** subject to this Kibana saved-object restriction.

---

## Dashboard installation — 3-tier fallback

The installer uses a robust 3-tier strategy for dashboard installation:

1. **Dashboards API** (`POST /api/dashboards`) — preferred on Kibana 9.4+
2. **Saved Objects CRUD** (`POST /api/saved_objects/dashboard/:id` for new, `PUT` for updates) — primary fallback, used on Cloud Hosted Kibana 9.x where the Dashboards API may return 400 or 404
3. **NDJSON import** (`POST /api/saved_objects/_import`) — last resort, used when both (1) and (2) are unavailable

All dashboards include a `version: 1` attribute in their saved-object payload for Kibana 9.x compatibility. The `cloudloadgen` tag is created explicitly before dashboard import.

---

## Alerting rules — compatibility

All alerting rules use `consumer: "alerts"` (not `stackAlerts`) to ensure they appear in **Kibana → Stack Management → Rules** and in the **Alerts** section of Observability and Security. Rules use the `.es-query` rule type with the `esQuery` parameter wrapped in a `{"query": ...}` envelope as required by Kibana 9.x.

---

## Data streams and TSDS

Generators output data that targets Elasticsearch **data streams**:

- **Logs** → `logs-{vendor}.{service}-default` (e.g. `logs-aws.lambda_logs-default`, `logs-gcp.cloud_functions-default`)
- **Metrics** → `metrics-{vendor}.{service}-default` — uses **TSDS** (Time Series Data Stream) where appropriate for efficient storage and aggregation
- **Traces** → `traces-apm-default` — APM trace documents (including Chained Event traces) route here for Service Map visualisation

Ingest pipelines handle routing, parsing, and enrichment so documents land in the correct data stream automatically.

---

## Related documentation

- [installer/README.md](../installer/README.md) — CLI installers, credentials, pipeline groups
- [docs/development.md](./development.md) — Local dev, proxy, tests
- [README.md](../README.md) — Quick start, Docker, architecture overview
