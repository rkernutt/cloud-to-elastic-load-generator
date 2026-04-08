/**
 * Scans `local/cloud-icons/` (or `CLOUD_ICONS_DIR`), generates `src/cloud/generated/vendorFileIcons.ts`, and copies
 * referenced GCP/Azure assets into `public/gcp-icons/` and `public/azure-icons/` (flat names, like `public/aws-icons/`).
 * `local/` is gitignored — only flattened outputs are committed. Run: `npm run icons:vendor` (maintainers only).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CLOUD_ICONS = process.env.CLOUD_ICONS_DIR
  ? path.resolve(process.env.CLOUD_ICONS_DIR)
  : path.join(REPO_ROOT, "local", "cloud-icons");
const GCP_ICONS_ROOT = path.join(CLOUD_ICONS, "GCP icons");
const AZURE_ICONS_ROOT = path.join(CLOUD_ICONS, "Azure_Public_Service_Icons");
const OUT_FILE = path.join(REPO_ROOT, "src/cloud/generated/vendorFileIcons.ts");
const MISSING_ICONS_REPORT = path.join(REPO_ROOT, "missing-vendor-icons.report.txt");

/** Only used when `OUT_FILE` is missing (broken checkout); normal clones ship a real generated file. */
const VENDOR_ICONS_EMPTY_TS = `/** Empty — add local/cloud-icons/ (see docs/development.md) and run npm run icons:vendor */
export const GCP_VENDOR_SERVICE_ICONS: Record<string, string> = {};
export const GCP_VENDOR_CATEGORY_ICONS: Record<string, string> = {};
export const GCP_VENDOR_FALLBACK = "";
export const AZURE_VENDOR_SERVICE_ICONS: Record<string, string> = {};
export const AZURE_VENDOR_CATEGORY_ICONS: Record<string, string> = {};
export const AZURE_VENDOR_FALLBACK = "";
`;

const toKebab = (/** @type {string} */ s) => s.replace(/_/g, "-");

/** Relative path under `GCP icons/` (source tree before flattening to `public/gcp-icons/`). */
/** @param {string} p */
function relGcpIcons(p) {
  return path.relative(GCP_ICONS_ROOT, p).split(path.sep).join("/");
}

/** Relative path under `Azure_Public_Service_Icons/` (source before flattening to `public/azure-icons/`). */
/** @param {string} p */
function relAzureIcons(p) {
  return path.relative(AZURE_ICONS_ROOT, p).split(path.sep).join("/");
}

/**
 * Copy icons into `public/{gcp|azure}-icons/` as flat `serviceId.ext` / `_category-{id}.ext` / `_fallback.ext` (same serving model as `public/aws-icons/`).
 * @param {string} sourceRoot
 * @param {string} destDir
 * @param {Record<string,string>} serviceMapDeep rel paths with `/`
 * @param {Record<string,string>} categoryMapDeep
 * @param {string} fallbackDeep
 * @returns {{ serviceMap: Record<string,string>; categoryMap: Record<string,string>; fallback: string }}
 */
function flattenVendorIconsToPublic(
  sourceRoot,
  destDir,
  serviceMapDeep,
  categoryMapDeep,
  fallbackDeep
) {
  fs.rmSync(destDir, { recursive: true, force: true });
  fs.mkdirSync(destDir, { recursive: true });

  /** @param {string} rel @param {string} fileStem basename without extension */
  function copyOne(rel, fileStem) {
    const src = path.join(sourceRoot, ...rel.split("/").filter(Boolean));
    if (!fs.existsSync(src)) {
      throw new Error(`Missing vendor icon source: ${src} (from ${rel})`);
    }
    const ext = path.extname(src) || ".svg";
    const base = `${fileStem}${ext}`;
    fs.copyFileSync(src, path.join(destDir, base));
    return base;
  }

  /** @type {Record<string,string>} */
  const serviceMap = {};
  for (const [id, rel] of Object.entries(serviceMapDeep)) {
    serviceMap[id] = copyOne(rel, id);
  }
  /** @type {Record<string,string>} */
  const categoryMap = {};
  for (const [id, rel] of Object.entries(categoryMapDeep)) {
    categoryMap[id] = copyOne(rel, `_category-${id}`);
  }
  const fallback = fallbackDeep ? copyOne(fallbackDeep, "_fallback") : "";
  return { serviceMap, categoryMap, fallback };
}

/**
 * Derive `serviceGroups` service id from a Unique Icons folder title (e.g. "Cloud SQL" → cloud-sql, "AlloyDB" → alloydb).
 * @param {string} folderTitle
 */
function folderNameToGcpServiceId(folderTitle) {
  const t = folderTitle.trim();
  if (/\s/.test(t)) return t.toLowerCase().replace(/\s+/g, "-");
  return t.toLowerCase();
}

/**
 * Fill gaps in `out` from each `Unique Icons/<title>/SVG/` folder (prefers a `*512-color*` svg).
 * Only adds keys present in `validIds` so product folders without a matching service id stay out of the map.
 */
function mergeGcpUniqueIcons(
  /** @type {Record<string,string>} */ out,
  /** @type {ReadonlySet<string>} */ validIds
) {
  const uniqueRoot = path.join(GCP_ICONS_ROOT, "Unique Icons");
  if (!fs.existsSync(uniqueRoot)) return;
  for (const ent of fs.readdirSync(uniqueRoot, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const svgDir = path.join(uniqueRoot, ent.name, "SVG");
    if (!fs.existsSync(svgDir) || !fs.statSync(svgDir).isDirectory()) continue;
    const files = fs.readdirSync(svgDir).filter((f) => f.toLowerCase().endsWith(".svg"));
    if (files.length === 0) continue;
    const preferred =
      files.find((f) => /512-color/i.test(f)) ?? files.find((f) => /-color/i.test(f)) ?? files[0];
    const full = path.join(svgDir, preferred);
    const serviceId = folderNameToGcpServiceId(ent.name);
    if (!validIds.has(serviceId) || out[serviceId]) continue;
    out[serviceId] = relGcpIcons(full);
  }
}

/** Files placed at `GCP icons/<filename>` (optional `.png`). Service id → exact filename. */
const GCP_LOOSE_ROOT_ICONS = {
  "cloud-identity": "Identity And Access Management.svg",
  "service-directory": "service directory.png",
  /** PNG assets at `GCP icons/` root (not in legacy tree). */
  "backup-dr": "backup and dr.png",
  "recaptcha-enterprise": "recaptcha.png",
};

function applyGcpLooseRootIcons(
  /** @type {Record<string,string>} */ out,
  /** @type {ReadonlySet<string>} */ validIds
) {
  for (const [serviceId, file] of Object.entries(GCP_LOOSE_ROOT_ICONS)) {
    if (!validIds.has(serviceId)) continue;
    const full = path.join(GCP_ICONS_ROOT, file);
    if (fs.existsSync(full)) out[serviceId] = relGcpIcons(full);
  }
}

/** GCP: folder name → relative svg path. `validServiceIds` scopes Unique Icons to services in `serviceGroups`. */
function buildGcpServiceMap(/** @type {readonly string[]} */ validServiceIds) {
  const validSet = new Set(validServiceIds);
  const legacy = path.join(GCP_ICONS_ROOT, "google-cloud-legacy-icons");
  if (!fs.existsSync(legacy))
    return { map: /** @type {Record<string,string>} */ ({}), fallback: "" };

  const dirs = fs.readdirSync(legacy, { withFileTypes: true }).filter((d) => d.isDirectory());
  /** @type {Record<string,string>} */
  const byKebab = {};
  for (const d of dirs) {
    const svg = path.join(legacy, d.name, `${d.name}.svg`);
    if (fs.existsSync(svg)) byKebab[toKebab(d.name)] = relGcpIcons(svg);
  }

  /** Service id → folder kebab (differs from auto map) */
  const ALIASES = {
    gke: "google-kubernetes-engine",
    "gke-autopilot": "google-kubernetes-engine",
    "gke-enterprise": "google-kubernetes-engine",
    "anthos-config-mgmt": "anthos-config-management",
    "migrate-to-containers": "migrate-for-anthos",
    "cloud-run-jobs": "cloud-run",
    "serverless-vpc-access": "virtual-private-cloud",
    iam: "identity-and-access-management",
    "cloud-kms": "key-management-service",
    "certificate-authority": "certificate-authority-service",
    vpc: "virtual-private-cloud",
    "vpc-flow": "virtual-private-cloud",
    "cloud-lb": "cloud-load-balancing",
    "cloud-cdn": "cloud-cdn",
    "private-service-connect": "private-service-connect",
    "network-intelligence-center": "network-intelligence-center",
    "anthos-service-mesh": "anthos-service-mesh",
    chronicle: "security",
    dlp: "data-loss-prevention-api",
    "natural-language": "cloud-natural-language-api",
    translation: "cloud-translation-api",
    "speech-to-text": "speech-to-text",
    "text-to-speech": "text-to-speech",
    automl: "automl",
    "vertex-ai": "ai-platform-unified",
    gemini: "ai-platform-unified",
    "vertex-ai-search": "discovery-and-orchestration-api",
    "vertex-ai-pipelines": "ai-platform-unified",
    "vertex-ai-feature-store": "ai-platform-unified",
    "vertex-ai-matching-engine": "ai-platform-unified",
    "vertex-ai-tensorboard": "ai-platform-unified",
    "vertex-ai-workbench": "ai-platform-unified",
    "recommendations-ai": "recommendations-ai",
    "document-ai": "document-ai",
    "healthcare-api": "healthcare-nlp-api",
    dialogflow: "dialogflow",
    "vision-ai": "automl-vision",
    "video-intelligence": "automl-video-intelligence",
    "cloud-armor": "cloud-armor",
    "cloud-dns": "cloud-dns",
    "cloud-nat": "cloud-nat",
    "cloud-vpn": "cloud-vpn",
    "cloud-interconnect": "cloud-interconnect",
    "cloud-router": "cloud-router",
    "traffic-director": "traffic-director",
    /** Media CDN (edges); do not use media translation API artwork. */
    "media-cdn": "cloud-media-edge",
    "cloud-ids": "security",
    "web-risk": "web-risk",
    pubsub: "pubsub",
    "pubsub-lite": "pubsub",
    datastore: "datastore",
    workflows: "workflows",
    eventarc: "eventarc",
    "api-gateway": "cloud-api-gateway",
    apigee: "apigee",
    looker: "looker",
    dataplex: "dataplex",
    "data-catalog": "data-catalog",
    "database-migration": "database-migration-service",
    composer: "cloud-composer",
    "data-fusion": "cloud-data-fusion",
    "managed-ad": "managed-service-for-microsoft-active-directory",
    "analytics-hub": "analytics-hub",
    datacatalog: "data-catalog",
    "essential-contacts": "early-access-center",
    "access-transparency": "access-transparency",
    "org-policy": "policy-analyzer",
    "resource-manager": "cloud-asset-inventory",
    /** Multiline “primary” rows in serviceGroups — map to closest legacy asset */
    "active-assist": "agent-assist",
    "application-integration": "connectors",
    "bare-metal": "bare-metal-solutions",
    firebase: "cloud-functions",
    transcoder: "video-intelligence-api",
    "deployment-manager": "cloud-deployment-manager",
    "cloud-build": "cloud-build",
    "cloud-deploy": "cloud-build",
    "cloud-shell": "home",
    "cloud-workstations": "home",
    iot: "iot-core",
    "iot-core": "iot-core",
  };

  /** @type {Record<string,string>} */
  const out = { ...byKebab };
  for (const [id, folderKebab] of Object.entries(ALIASES)) {
    const folderUnderscore = folderKebab.replace(/-/g, "_");
    const svg = path.join(legacy, folderUnderscore, `${folderUnderscore}.svg`);
    if (fs.existsSync(svg)) out[id] = relGcpIcons(svg);
  }

  mergeGcpUniqueIcons(out, validSet);
  applyGcpLooseRootIcons(out, validSet);

  const generic = path.join(legacy, "cloud_generic", "cloud_generic.svg");
  const homeSvg = path.join(legacy, "home", "home.svg");
  const fallback = fs.existsSync(generic)
    ? relGcpIcons(generic)
    : fs.existsSync(homeSvg)
      ? relGcpIcons(homeSvg)
      : "";
  return { map: out, fallback };
}

function buildGcpCategoryMap(serviceMap) {
  const pick = (id) => serviceMap[id] ?? null;
  const pairs = {
    serverless: pick("cloud-functions"),
    compute: pick("compute-engine"),
    containers: pick("gke"),
    networking: pick("virtual-private-cloud"),
    security: pick("security"),
    storage: pick("cloud-storage"),
    databases: pick("cloud-sql"),
    datawarehouse: pick("bigquery"),
    streaming: pick("dataflow"),
    aiml: pick("ai-platform-unified"),
    devtools: pick("cloud-build"),
    management: pick("resource-manager"),
    operations: pick("stackdriver"),
    iot: pick("iot-core"),
    media: pick("automl-video-intelligence"),
    integration: pick("connectors"),
  };
  /** @type {Record<string,string>} */
  const out = {};
  for (const [k, v] of Object.entries(pairs)) {
    if (v) out[k] = v;
  }
  return out;
}

/** Walk Azure SVGs; return { relPath, stem } */
function listAzureSvgs() {
  const base = path.join(AZURE_ICONS_ROOT, "Icons");
  if (!fs.existsSync(base)) return [];
  /** @type {{ rel: string; stem: string }} */
  const acc = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".svg")) {
        acc.push({ rel: relAzureIcons(p), stem: ent.name.replace(/\.svg$/i, "").toLowerCase() });
      }
    }
  }
  walk(base);
  return acc;
}

/** @param {string} id */
function azureTokens(id) {
  return id.split("-").filter((w) => w.length > 1);
}

/** Split icon filename into word tokens (avoids matching "server" inside "serverless"). */
function azureStemTokens(stem) {
  return stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** @param {string} word @param {string} token */
function azureWordMatchesToken(word, token) {
  if (token === word) return true;
  if (word.length >= 3 && (token === `${word}s` || token === `${word}es`)) return true;
  if (token.length >= 3 && (word === `${token}s` || word === `${token}es`)) return true;
  return false;
}

/** Score svg stem against service id */
function azureScore(id, stem) {
  const words = azureTokens(id);
  if (words.length === 0) return 0;
  const tokens = azureStemTokens(stem);
  let raw = 0;
  let matched = 0;
  for (const w of words) {
    if (tokens.some((t) => azureWordMatchesToken(w, t))) {
      matched++;
      raw += w.length + 1;
    }
  }
  let s = matched === words.length ? raw : Math.floor((raw * matched) / words.length);
  if (id.includes("sql") && stem.includes("sql")) s += 6;
  if (id.includes("kubernetes") || id === "aks") {
    if (stem.includes("kubernetes") || stem.includes("kube")) s += 10;
    if (id === "aks" && stem.includes("kubernetes")) s += 8;
  }
  if (id === "functions" && stem.includes("function")) s += 10;
  return s;
}

/** Service id → path under Azure_Public_Service_Icons (forward slashes). Fixes short ids, plurals, and hyphen splits. */
const AZURE_ICON_ALIASES = {
  acr: "Icons/containers/10105-icon-service-Container-Registries.svg",
  arc: "Icons/management + governance/00756-icon-service-Azure-Arc.svg",
  batch: "Icons/containers/10031-icon-service-Batch-Accounts.svg",
  "data-factory": "Icons/analytics/10126-icon-service-Data-Factories.svg",
  /** Dev Center product icon maps to Deployment Environments in the public set. */
  devcenter: "Icons/other/03251-icon-service-Azure-Deployment-Environments.svg",
  "document-intelligence": "Icons/ai + machine learning/00819-icon-service-Form-Recognizers.svg",
  hdinsight: "Icons/analytics/10142-icon-service-HD-Insight-Clusters.svg",
  maps: "Icons/iot/10185-icon-service-Azure-Maps-Accounts.svg",
  purview: "Icons/Microsoft_Purview_Logo.svg",
  relay: "Icons/integration/10209-icon-service-Relays.svg",
  stack: "Icons/iot/10114-icon-service-Azure-Stack.svg",
  /** Token overlap alone picks the wrong asset — pin to the intended public icon. */
  "ai-search": "Icons/ai + machine learning/10044-icon-service-Cognitive-Search.svg",
  openai: "Icons/ai + machine learning/03438-icon-service-Azure-OpenAI.svg",
  "machine-learning": "Icons/ai + machine learning/10166-icon-service-Machine-Learning.svg",
  "synapse-workspace": "Icons/analytics/00606-icon-service-Azure-Synapse-Analytics.svg",
  "microsoft-fabric": "Icons/analytics/00606-icon-service-Azure-Synapse-Analytics.svg",
  "app-service": "Icons/compute/10035-icon-service-App-Services.svg",
  "service-bus": "Icons/integration/10836-icon-service-Azure-Service-Bus.svg",
  "media-services": "Icons/web/10309-icon-service-Azure-Media-Service.svg",
  "blob-storage": "Icons/general/10780-icon-service-Blob-Block.svg",
  "table-storage": "Icons/general/10841-icon-service-Table.svg",
  "queue-storage": "Icons/general/10840-icon-service-Storage-Queue.svg",
  "entra-id": "Icons/identity/10340-icon-service-Entra-Identity-Roles-and-Administrators.svg",
  m365: "Icons/identity/10340-icon-service-Entra-Identity-Roles-and-Administrators.svg",
  "managed-identity": "Icons/identity/10227-icon-service-Entra-Managed-Identities.svg",
  "nat-gateway": "Icons/networking/10310-icon-service-NAT.svg",
  "vpn-gateway": "Icons/networking/10063-icon-service-Virtual-Network-Gateways.svg",
  "route-server": "Icons/networking/02496-icon-service-Virtual-Router.svg",
  "waf-policy": "Icons/networking/10362-icon-service-Web-Application-Firewall-Policies(WAF).svg",
  "compute-gallery": "Icons/general/10812-icon-service-Image.svg",
  "image-builder": "Icons/compute/02634-icon-service-Image-Templates.svg",
  "sap-on-azure": "Icons/other/03089-icon-service-Virtual-Instance-for-SAP.svg",
  "oracle-on-azure": "Icons/databases/03490-icon-service-Oracle-Database.svg",
  "site-recovery": "Icons/management + governance/00017-icon-service-Recovery-Services-Vaults.svg",
  attestation: "Icons/other/10422-icon-service-AzureAttestation.svg",
  "vpn-client": "Icons/new icons/03694-icon-service-VPNClientWindows.svg",
  "virtual-machines": "Icons/compute/10021-icon-service-Virtual-Machine.svg",
  "front-door": "Icons/networking/10073-icon-service-Front-Door-and-CDN-Profiles.svg",
};

function buildAzureServiceMap(allIds) {
  const files = listAzureSvgs();
  const fallbackEntry = files.find(
    (f) => f.stem.includes("subscriptions") && f.stem.includes("10002")
  );
  const fallback =
    fallbackEntry?.rel ??
    files.find((f) => f.stem.includes("resource-groups"))?.rel ??
    files[0]?.rel ??
    "";

  /** @type {Record<string,string>} */
  const out = {};
  /** @type {string[]} */
  const fallbackIds = [];
  for (const id of allIds) {
    const aliasRel = AZURE_ICON_ALIASES[id];
    if (aliasRel && fs.existsSync(path.join(AZURE_ICONS_ROOT, aliasRel))) {
      out[id] = aliasRel;
      continue;
    }
    let best = null;
    let bestSc = 0;
    for (const f of files) {
      const sc = azureScore(id, f.stem);
      if (sc > bestSc) {
        bestSc = sc;
        best = f.rel;
      }
    }
    if (best && bestSc >= 6) out[id] = best;
    else if (fallback) {
      out[id] = fallback;
      fallbackIds.push(id);
    }
  }
  return { map: out, fallback, fallbackIds };
}

function buildAzureCategoryMap(serviceMap) {
  const g = (id) => serviceMap[id];
  const pairs = {
    compute: g("virtual-machines"),
    containers: g("aks"),
    "serverless-apps": g("functions"),
    networking: g("virtual-network"),
    storage: g("blob-storage"),
    databases: g("sql-database"),
    "data-ai": g("synapse-workspace"),
    "identity-security": g("entra-id"),
    "o365-metrics": g("purview"),
    integration: g("logic-apps"),
    "iot-media": g("iot-hub"),
    management: g("monitor"),
    "resilience-migration": g("site-recovery"),
  };
  /** @type {Record<string,string>} */
  const out = {};
  for (const [k, v] of Object.entries(pairs)) {
    if (v) out[k] = v;
  }
  return out;
}

/**
 * Collect service item ids from `serviceGroups.ts`.
 * Groups use `    id: "…"` (4 spaces); items use `      { id: "…"` (6 spaces) or a multiline `{` + `        id:` (8 spaces).
 * A naïve `{ id: …, label:` regex misses multiline objects (e.g. Azure `virtual-machines`, `front-door`).
 */
function extractServiceIds(tsPath) {
  const chunk = fs.readFileSync(tsPath, "utf8");
  const singleLine = [...chunk.matchAll(/^\s{6}\{ id: "([^"]+)",\s*label:/gm)].map((m) => m[1]);
  const multiLine = [...chunk.matchAll(/^\s{8}id: "([^"]+)",\s*label:/gm)].map((m) => m[1]);
  return [...new Set([...singleLine, ...multiLine])];
}

function main() {
  if (!fs.existsSync(CLOUD_ICONS)) {
    console.warn(
      "local/cloud-icons/ not found (set CLOUD_ICONS_DIR to override) — skipping vendor icon regeneration (using committed src/cloud/generated/vendorFileIcons.ts and public/{gcp,azure}-icons/)."
    );
    if (!fs.existsSync(OUT_FILE)) {
      fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
      fs.writeFileSync(OUT_FILE, VENDOR_ICONS_EMPTY_TS);
      console.warn(
        `Wrote placeholder ${OUT_FILE} — run npm run icons:vendor with local/cloud-icons/ for a full map.`
      );
    }
    return;
  }

  const gcpIds = extractServiceIds(path.join(REPO_ROOT, "src/gcp/data/serviceGroups.ts"));
  const gcp = buildGcpServiceMap(gcpIds);
  const gcpCats = buildGcpCategoryMap(gcp.map);

  const gcpMissingIcons = gcpIds.filter((id) => !gcp.map[id]).sort();

  const azureIds = extractServiceIds(path.join(REPO_ROOT, "src/azure/data/serviceGroups.ts"));
  const azure = buildAzureServiceMap(azureIds);
  const azureCats = buildAzureCategoryMap(azure.map);

  const reportLines = [
    "Service icons using generic or weak fallback in the load generator UIs",
    "GCP: no icon mapping in google-cloud-legacy-icons, Unique Icons, or GCP icons root loose files for this service id.",
    "Azure: icon filename match score < 6 (default subscription/resource SVG).",
    "",
    "GCP (missing dedicated icon):",
    ...gcpMissingIcons.map((id) => id),
    "",
    "Azure (weak / generic fallback):",
    ...azure.fallbackIds.sort(),
    "",
  ];
  fs.writeFileSync(MISSING_ICONS_REPORT, reportLines.join("\n"));

  const gcpPublic = path.join(REPO_ROOT, "public", "gcp-icons");
  const azurePublic = path.join(REPO_ROOT, "public", "azure-icons");
  const gcpOut = flattenVendorIconsToPublic(
    GCP_ICONS_ROOT,
    gcpPublic,
    gcp.map,
    gcpCats,
    gcp.fallback
  );
  const azureOut = flattenVendorIconsToPublic(
    AZURE_ICONS_ROOT,
    azurePublic,
    azure.map,
    azureCats,
    azure.fallback
  );

  const body = `/** Generated by scripts/build-vendor-icon-maps.mjs — flat filenames under \`/gcp-icons/\` and \`/azure-icons/\` (copied to \`public/\`, same pattern as \`/aws-icons/\`). */

export const GCP_VENDOR_FALLBACK = ${JSON.stringify(gcpOut.fallback)};

export const GCP_VENDOR_SERVICE_ICONS: Record<string, string> = ${JSON.stringify(gcpOut.serviceMap, null, 2)};

export const GCP_VENDOR_CATEGORY_ICONS: Record<string, string> = ${JSON.stringify(gcpOut.categoryMap, null, 2)};

export const AZURE_VENDOR_FALLBACK = ${JSON.stringify(azureOut.fallback)};

export const AZURE_VENDOR_SERVICE_ICONS: Record<string, string> = ${JSON.stringify(azureOut.serviceMap, null, 2)};

export const AZURE_VENDOR_CATEGORY_ICONS: Record<string, string> = ${JSON.stringify(azureOut.categoryMap, null, 2)};
`;
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, body);
  console.log(`Wrote ${OUT_FILE}`);
  console.log(
    `Flat icons: public/gcp-icons (${Object.keys(gcpOut.serviceMap).length} services), public/azure-icons (${Object.keys(azureOut.serviceMap).length} services)`
  );
  console.log(`Missing-icon report: ${MISSING_ICONS_REPORT}`);
  console.log(
    `GCP missing dedicated icon: ${gcpMissingIcons.length}, Azure weak match: ${azure.fallbackIds.length}`
  );
}

main();
