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

The shipping wizard supports a **Back** button on each step, **search and filter** on the Services step to find providers quickly, and **connection test gating** (a successful connection test is required before you can continue). When a ship run finishes, **Ship Again** and **Reconfigure** let you repeat or adjust the flow without starting from scratch.

### Chained Events

Beyond single-service generators, the app includes **Chained Events** — multi-step correlated scenarios that span several services:

- **Data & Analytics Pipeline** (AWS: S3 → EMR → Glue → Athena → MWAA; GCP: GCS → Dataproc → Data Catalog → BigQuery → Composer; Azure: Blob → Databricks → Purview → Synapse → Data Factory) — includes APM traces for the Elastic Service Map, dashboards, ML jobs, and alerting rules
- **Security / data exfiltration chains** — cross-service attack pattern simulation

See [docs/chained-events/](docs/chained-events/) for architecture diagrams and failure-mode documentation.

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
