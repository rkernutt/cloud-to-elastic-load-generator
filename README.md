# Cloud to Elastic Load Generator

A single web UI for bulk-generating realistic **AWS**, **Google Cloud**, and **Microsoft Azure** observability data (logs, metrics, and traces) and shipping it to Elasticsearch with the `_bulk` API. Pick your hyperscaler on the **Start** step; documents follow **ECS** naming and integration-style metadata so they behave like production ingest.

The header uses a vendor-neutral cloud mark; AWS, GCP, and Azure logos appear in the wizard when choosing a cloud.

**Icons:** Service artwork for GCP and Azure is committed under `public/gcp-icons/` and `public/azure-icons/` (with `src/cloud/generated/vendorFileIcons.ts`). Clones and Docker builds work without running `npm run icons:vendor`; that command is only for maintainers refreshing maps from a local `Cloud Icons/` tree.

**Documentation:** [docs/README.md](docs/README.md) (index) · [docs/development.md](docs/development.md) (build, test, samples)

---

## Quick start

### Docker Compose (recommended)

```bash
cd cloud-to-elastic-load-generator
docker compose up -d
```

Open **http://localhost:8765**.

### Docker CLI

```bash
docker build -t cloud-to-elastic-load-generator .
docker run -d -p 8765:80 --name cloud-to-elastic-load-generator cloud-to-elastic-load-generator
```

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

---

## Sample data

Reference JSON for each registered generator is under **`samples/{aws,gcp,azure}/`**. Regenerate with `npm run samples` and verify with `npm run samples:verify`.

---

## License and contributors

See the repository license file (if present) and [CONTRIBUTORS.md](CONTRIBUTORS.md).
