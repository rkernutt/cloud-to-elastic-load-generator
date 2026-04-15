# Cloud to Elastic Load Generator

A single web UI for bulk-generating realistic **AWS**, **Google Cloud**, and **Microsoft Azure** observability data (logs, metrics, and traces) and shipping it to Elasticsearch with the `_bulk` API. Pick your hyperscaler on the **Start** step; documents follow **ECS** naming and integration-style metadata so they behave like production ingest.

The header uses a vendor-neutral cloud mark; AWS, GCP, and Azure logos appear in the wizard when choosing a cloud.

**Icons:** GCP/Azure flat SVGs and maps are committed under `public/gcp-icons/`, `public/azure-icons/`, and `src/cloud/generated/vendorFileIcons.ts`. AWS icons in `public/aws-icons/` are committed so clones work offline; `npm install` re-syncs that folder from the `aws-icons` package to match `src/data/iconMap.ts` and prunes unused files. A handful of AWS SVGs (and PNG findings artwork) are package-extras and remain committed only—see [docs/development.md](docs/development.md). Maintainers refresh GCP/Azure maps with `npm run icons:vendor` and sources in `local/cloud-icons/` (gitignored).

**Documentation:** [docs/README.md](docs/README.md) — index of guides, AWS routing docs, pipeline reference, and diagrams. **Setup wizard & uninstall (including Serverless dashboard limits):** [docs/SETUP-WIZARD-AND-UNINSTALL.md](docs/SETUP-WIZARD-AND-UNINSTALL.md). Day-to-day dev: [docs/development.md](docs/development.md).

**Test / pilot builds:** Use synthetic data and non-production Elasticsearch targets unless you have explicit approval. Before handing off a build, run the same checks as CI (see **Testing and quality** below): `format:check`, `lint`, `typecheck`, `test`, and `build` should all succeed on Node 20.

---

## Quick start

### Docker (recommended)

After clone or `git pull`, from the repo root:

```bash
./docker-up
```

Or: `npm run docker:up`

This builds the image and starts the container. Open **http://localhost:8765**.

You need a **full clone** (including `installer/`). If the build says installer assets are missing, run `git checkout HEAD -- installer/aws-custom-dashboards installer/aws-custom-ml-jobs` (or `git sparse-checkout disable`) and try again.

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

## Elastic onboarding

Idempotent installers (integrations, ingest pipelines, dashboards, ML jobs) live under **`installer/`**. See **[installer/README.md](installer/README.md)** for AWS, GCP, and Azure entrypoints.

The **same assets** can be installed or removed from the **Setup** step in the web UI (after **Start** and **Connection**). You can filter pipelines/dashboards/ML, **Align with Services** with your Services-step selection, and the Setup log can persist across refresh (sessionStorage).

On **AWS**, **dashboards** and **ML anomaly jobs** are grouped under the same high-level **Services** categories as the wizard (for example _Networking & CDN_, _Storage & Databases_, _Compute & Containers_) so Setup matches what you chose on the Services step. **GCP** and **Azure** ML jobs stay grouped by installer JSON file; pipeline accordion labels use readable polish (for example GCP `datawarehouse` → **Data Warehouse**). See [docs/SETUP-WIZARD-AND-UNINSTALL.md](docs/SETUP-WIZARD-AND-UNINSTALL.md).

**Important:** on some **Elastic Cloud Serverless** projects, Kibana does **not** allow saved-object **delete** APIs, so **dashboard uninstall from the UI will not work** there — remove dashboards manually in Kibana or use a stack where those APIs are enabled. Details: [docs/SETUP-WIZARD-AND-UNINSTALL.md](docs/SETUP-WIZARD-AND-UNINSTALL.md).

---

## Sample data

Reference JSON for each registered generator is under **`samples/{aws,gcp,azure}/`**. Regenerate with `npm run samples` and verify with `npm run samples:verify`.

---

## License and contributors

See the repository license file (if present) and [CONTRIBUTORS.md](CONTRIBUTORS.md).
