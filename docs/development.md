# Development

## Prerequisites

- **Node.js** 18+ (CI and Docker use 20)
- **npm** (lockfile: `package-lock.json`)

After `npm install`, **`postinstall`** runs **`copy-icons`** (copies AWS architecture icons used by the UI into `public/aws-icons/`).

## Run the app locally

1. Start the bulk proxy (default listen **3001**):

   ```bash
   node proxy.cjs
   ```

2. Start Vite (default **3000**, forwards **`/proxy`** to the proxy):

   ```bash
   npm run dev
   ```

Open **http://localhost:3000**. Configure Elasticsearch URL and API key in the UI; bulk requests go through **`/proxy`** in dev.

The **Setup** wizard (integrations, pipelines, dashboards, ML) supports filtering, **Align with Services**, and session-persisted logs. **Dashboard uninstall** may be blocked on Elastic Serverless Kibana — see [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md).

**Setup UI implementation (for contributors):** Service-type grouping for AWS dashboards and ML jobs is driven by `src/setup/dashboardServiceGroup.ts` (labels from the Services catalog) and matching helpers in `src/setup/setupAssetMatch.ts`. Pipeline / ML **accordion titles** use `src/setup/setupDisplayPolish.ts` (`polishSetupCategoryLabel`, dashboard title polish). Behavior is documented in [SETUP-WIZARD-AND-UNINSTALL.md](./SETUP-WIZARD-AND-UNINSTALL.md).

## Build and preview

```bash
npm run build
npm run preview
```

## Samples

Regenerate JSON for **all** clouds:

```bash
npm run samples
```

Verify that files on disk match every registered generator:

```bash
npm run samples:verify
```

Sample layout: **`samples/aws/{logs,metrics,traces}`**, **`samples/gcp/...`**, **`samples/azure/...`**.

## One-shot verification

```bash
npm run test
```

Runs Vitest, then **`samples`** and **`samples:verify`**.

## Docker

```bash
docker compose up -d
```

Service name: **`cloud-to-elastic-load-generator`**. App on **8765** → container **80**.

## Icons

- **AWS:** `postinstall` runs **`npm run copy-icons`** (`scripts/sync-aws-icons.mjs`): copies every SVG referenced in **`src/data/iconMap.ts`** from the **`aws-icons`** package into **`public/aws-icons/`** (using **`scripts/aws-icon-source-map.mjs`** when the default `architecture-service/${name}.svg` path is missing), then deletes files there that are no longer referenced. PNG category/findings artwork is committed as-is. **`npm run icons:audit`** compares on-disk files to `iconMap` + GCP/Azure vendor maps.
- **GCP / Azure:** Flat SVGs ship in **`public/gcp-icons/`** and **`public/azure-icons/`** with **`src/cloud/generated/vendorFileIcons.ts`**. Normal clones need nothing else.
- **Regenerating vendor maps (maintainers):** Put vendor source trees under **`local/cloud-icons/`** (same layout as before: `GCP icons/`, `Azure_Public_Service_Icons/`, etc.). That directory is gitignored. Run **`npm run icons:vendor`**. Optional: set **`CLOUD_ICONS_DIR`** to an absolute path if sources live outside the repo. If `local/cloud-icons/` is missing, the script does not overwrite committed maps.

**Optional local files:** Use **`local/`** for any large or private maintainer-only assets so the repo stays limited to committed **`public/`** / **`src/`** artifacts.

## Code quality

```bash
npm run format:check
npm run lint
npm run typecheck
```

## Documentation index

Guides (AWS CloudWatch routing, OTel, ingest reference, diagrams): [docs/README.md](./README.md).
