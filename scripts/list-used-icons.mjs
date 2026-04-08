/**
 * One-off / CI helper: print sets of icon filenames referenced by the app vs on disk.
 * Run: npx vite-node scripts/list-used-icons.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const { AWS_SERVICE_ICON_MAP, TRACE_SERVICE_ICON_MAP, CATEGORY_ICON_MAP } =
  await import("../src/data/iconMap.ts");
const v = await import("../src/cloud/generated/vendorFileIcons.ts");

function awsFilenames() {
  const s = new Set();
  const add = (val) => {
    s.add(val.includes(".") ? val : `${val}.svg`);
  };
  for (const val of Object.values(AWS_SERVICE_ICON_MAP)) add(val);
  for (const val of Object.values(TRACE_SERVICE_ICON_MAP)) add(val);
  for (const val of Object.values(CATEGORY_ICON_MAP)) add(val);
  return s;
}

function diskSet(relDir) {
  const d = path.join(root, relDir);
  return new Set(fs.readdirSync(d));
}

const awsNeed = awsFilenames();
const awsDisk = diskSet("public/aws-icons");

const gcpNeed = new Set([
  v.GCP_VENDOR_FALLBACK,
  ...Object.values(v.GCP_VENDOR_SERVICE_ICONS),
  ...Object.values(v.GCP_VENDOR_CATEGORY_ICONS),
]);
const gcpDisk = diskSet("public/gcp-icons");

const azureNeed = new Set([
  v.AZURE_VENDOR_FALLBACK,
  ...Object.values(v.AZURE_VENDOR_SERVICE_ICONS),
  ...Object.values(v.AZURE_VENDOR_CATEGORY_ICONS),
]);
const azureDisk = diskSet("public/azure-icons");

function report(name, need, disk) {
  const missing = [...need].filter((f) => !disk.has(f)).sort();
  const extra = [...disk].filter((f) => !need.has(f)).sort();
  console.log(
    `\n${name}: need ${need.size}, on disk ${disk.size}, missing ${missing.length}, extra ${extra.length}`
  );
  if (missing.length) console.log("  missing:", missing.join(", "));
  if (extra.length)
    console.log(
      "  extra (deletable):",
      extra.slice(0, 80).join(", "),
      extra.length > 80 ? "…" : ""
    );
  return { missing, extra };
}

report("AWS", awsNeed, awsDisk);
report("GCP", gcpNeed, gcpDisk);
report("Azure", azureNeed, azureDisk);
