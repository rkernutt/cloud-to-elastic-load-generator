# Cloud Loadgen for Elastic

A web UI that bulk-generates **realistic** AWS, Google Cloud, and Microsoft Azure observability data — logs, metrics, and traces — and ships it straight into Elasticsearch with the `_bulk` API. Documents follow **ECS** naming and use each provider's **native log/metric shapes** (CloudWatch, Cloud Logging, Azure Monitor), so dashboards, ML jobs, and alerting rules behave the way they would with real cloud workloads.

> Use synthetic data for demos, training, and pilot builds. Don't ship to production-shared indices without explicit approval.

## Who is this for?

| Audience                            | Use it to…                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Elastic SEs / demo operators**    | Stand up a populated Observability or Security demo in minutes against any deployment type       |
| **Customers / external evaluators** | Try Elastic dashboards, ML, and detection rules with data that looks like your cloud workloads   |
| **Contributors / developers**       | Add new generators, integrations, or chained scenarios — every asset is JSON and CLI-installable |

## How it works

```mermaid
flowchart LR
    User([User]) --> UI[Web UI<br/>Wizard]
    UI -->|Start| C1[Connection &<br/>use-case]
    UI -->|Setup| C2[Install<br/>integrations]
    UI -->|Services| C3[Pick services]
    UI -->|Ship| C4[Generate &<br/>bulk index]
    C4 -->|/proxy/_bulk| Proxy[Bulk proxy<br/>proxy.cjs]
    C2 -->|Kibana / ES APIs| Es[(Elasticsearch<br/>+ Kibana)]
    Proxy -->|_bulk| Es
    Es --> Dash[Dashboards · ML jobs ·<br/>Alerting rules · APM Service Map]
```

A four-step wizard. **Start** picks the cloud and Elastic deployment, **Setup** installs Cloud Loadgen Integrations, **Services** chooses what to generate, **Ship** runs the bulk index. Credentials live in the browser session; the small Node proxy forwards `_bulk` so the API key never leaves the host.

## Quick start

```bash
# Docker (recommended) — needs a full clone with installer/ present
./docker-up        # or: npm run docker:up
# → http://localhost:8765
```

For a manual `docker build`, local dev with the Vite + proxy combo, env vars, and contributor notes, see **[docs/development.md](docs/development.md)**.

## What it installs

Every Elastic asset is bundled **per service** as a **Cloud Loadgen Integration** and tagged with the `cloudloadgen` saved-object tag so you can filter, bulk-edit, or bulk-delete load-generator assets without touching production objects. Each service integration includes an ingest pipeline (TSDS for metrics), data stream templates, a Kibana ES|QL dashboard, ML anomaly jobs, and `.es-query` alerting rules.

The wizard opens on the **Start** step, where you pick cloud vendor, deployment type, event type, and Elastic connection details. Subsequent steps install integrations (Setup), pick services, configure advanced data types, tune volume, and ship traffic.

![Start step of the wizard: cloud vendor, deployment type, serverless project type, event type, Elasticsearch + Kibana URL, API key, and ingestion source](docs/images/start-page.png)

Catalog size today:

| Cloud | Services | Pipelines | Dashboards | ML jobs | Alerting rules |
| ----- | -------- | --------- | ---------- | ------- | -------------- |
| AWS   | 213      | 188       | 220        | 384     | 17             |
| GCP   | 130      | 149       | 127        | 152     | 17             |
| Azure | 132      | 121       | 120        | 154     | 17             |

Behaviour, categories, post-install toggles, Serverless limits, dashboard fallback, and uninstall semantics are all in **[docs/SETUP-WIZARD-AND-UNINSTALL.md](docs/SETUP-WIZARD-AND-UNINSTALL.md)**. CLI equivalents for every Setup action live in **[installer/README.md](installer/README.md)**, and standalone JSON for one-asset-at-a-time deploys is in **[assets/README.md](assets/README.md)**.

## Beyond per-service generators

Cloud Loadgen for Elastic also produces multi-service **chained scenarios** with shared correlation IDs and audit attribution, **CSPM/KSPM findings using 321 real CIS rule UUIDs**, and a **ServiceNow CMDB** generator for cross-index enrichment. A canonical alert-enrichment **Elastic Workflow** ties them together. Detail in **[docs/advanced-data-types.md](docs/advanced-data-types.md)**.

The **Ship** page also includes an **ML training mode** that automates _reset → baseline → wait → inject → freeze_ for clean, repeatable anomaly demos — see **[docs/ml-training-mode.md](docs/ml-training-mode.md)**.

## API key permissions

Two least-privilege key definitions live in `[installer/api-keys/](installer/api-keys/)`: **ship-only** (bulk index only) and **full-access** (ship plus install/uninstall of dashboards, ML jobs, rules, pipelines, and Fleet integrations). Both carry `metadata.tags: ["cloudloadgen"]`. Privilege breakdown and revocation guidance are in **[docs/api-key-permissions.md](docs/api-key-permissions.md)**.

## Sample data

Reference JSON for every registered generator is under `[samples/{aws,gcp,azure}/{logs,metrics,traces}/](samples/)`. Regenerate with `npm run samples` and verify with `npm run samples:verify`.

## Testing

| Command                                   | Purpose                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run test`                            | Vitest, then regenerate **all** sample JSON for every cloud and verify coverage |
| `npm run format` / `npm run format:check` | Prettier                                                                        |
| `npm run lint` / `npm run typecheck`      | ESLint and `tsc --noEmit`                                                       |
| `npm run build`                           | Production build                                                                |

CI runs format, lint, typecheck, test, and build on Node 20.

## Documentation

| Topic                                                                                 | Where                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local dev, proxy env vars, icons, contributor notes                                   | [docs/development.md](docs/development.md)                                                                                                                                                                                             |
| Setup wizard, `cloudloadgen` tag, Serverless behaviour, dashboard fallback            | [docs/SETUP-WIZARD-AND-UNINSTALL.md](docs/SETUP-WIZARD-AND-UNINSTALL.md)                                                                                                                                                               |
| Advanced data types: chained events, CSPM/KSPM, ServiceNow, alert-enrichment workflow | [docs/advanced-data-types.md](docs/advanced-data-types.md)                                                                                                                                                                             |
| ML training mode (reset → baseline → inject → freeze)                                 | [docs/ml-training-mode.md](docs/ml-training-mode.md)                                                                                                                                                                                   |
| API key privileges and revocation                                                     | [docs/api-key-permissions.md](docs/api-key-permissions.md)                                                                                                                                                                             |
| Per-scenario timing, correlation, and failure modes                                   | [docs/chained-events/](docs/chained-events/)                                                                                                                                                                                           |
| AWS CloudWatch routing, Glue/SageMaker walkthrough, OTel traces                       | [docs/CLOUDWATCH-TO-INDEX-ROUTING.md](docs/CLOUDWATCH-TO-INDEX-ROUTING.md), [docs/GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md](docs/GUIDE-CLOUDWATCH-GLUE-SAGEMAKER-ELASTIC.md), [docs/otel-traces-setup.md](docs/otel-traces-setup.md) |
| CLI installers (per-service bundles, individual asset installers, alert rules)        | [installer/README.md](installer/README.md)                                                                                                                                                                                             |
| Standalone JSON assets with copy-pasteable `curl` commands                            | [assets/README.md](assets/README.md)                                                                                                                                                                                                   |

Full docs index: **[docs/README.md](docs/README.md)**.

## License and contributors

See the repository license file (if present) and [CONTRIBUTORS.md](CONTRIBUTORS.md).
