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

- **AWS:** `postinstall` runs `npm run copy-icons` (from `aws-icons` package).
- **GCP / Azure:** Flat SVGs ship in **`public/gcp-icons/`** and **`public/azure-icons/`** with **`src/cloud/generated/vendorFileIcons.ts`**. Contributors do not need `Cloud Icons/` for day-to-day work.
- **Regenerating vendor maps (maintainers):** With repo-root **`Cloud Icons/`** present, run **`npm run icons:vendor`**. If that folder is missing, the script leaves committed files untouched (it no longer overwrites them with empty maps).

## Code quality

```bash
npm run format:check
npm run lint
npm run typecheck
```
