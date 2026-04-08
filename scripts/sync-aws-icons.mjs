/**
 * Copy required AWS Architecture SVGs from `aws-icons` into `public/aws-icons/`, then delete
 * any files there not referenced by `src/data/iconMap.ts`. PNG and bespoke assets must remain
 * committed for categories that use raster findings artwork.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CATEGORY_ICON_SOURCES, AWS_ICON_SOURCE_ALIASES } from "./aws-icon-source-map.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const iconsRoot = path.join(root, "node_modules", "aws-icons", "icons");
const destDir = path.join(root, "public", "aws-icons");

const { AWS_SERVICE_ICON_MAP, TRACE_SERVICE_ICON_MAP, CATEGORY_ICON_MAP } =
  await import("../src/data/iconMap.ts");

function neededFilenames() {
  const s = new Set();
  const add = (val) => {
    s.add(val.includes(".") ? val : `${val}.svg`);
  };
  for (const val of Object.values(AWS_SERVICE_ICON_MAP)) add(val);
  for (const val of Object.values(TRACE_SERVICE_ICON_MAP)) add(val);
  for (const val of Object.values(CATEGORY_ICON_MAP)) add(val);
  return s;
}

function prune(dest, keep) {
  let removed = 0;
  for (const f of fs.readdirSync(dest)) {
    if (!keep.has(f)) {
      fs.unlinkSync(path.join(dest, f));
      removed++;
    }
  }
  return removed;
}

function main() {
  if (!fs.existsSync(iconsRoot)) {
    console.warn("aws-icons not installed. Run: npm install");
    process.exit(0);
  }

  const need = neededFilenames();
  fs.mkdirSync(destDir, { recursive: true });

  let copied = 0;

  const queueCopy = (destName, relFromIcons) => {
    const absSrc = path.join(iconsRoot, relFromIcons);
    const absDest = path.join(destDir, destName);
    if (fs.existsSync(absSrc)) {
      fs.copyFileSync(absSrc, absDest);
      copied++;
    } else {
      console.warn(`  skip (missing source): ${destName} ← ${relFromIcons}`);
    }
  };

  const uniqueValues = new Set([
    ...Object.values(AWS_SERVICE_ICON_MAP),
    ...Object.values(TRACE_SERVICE_ICON_MAP),
    ...Object.values(CATEGORY_ICON_MAP),
  ]);

  for (const val of uniqueValues) {
    if (val.includes(".png")) continue;

    const destName = `${val}.svg`;

    if (CATEGORY_ICON_SOURCES[val]) {
      queueCopy(destName, CATEGORY_ICON_SOURCES[val]);
      continue;
    }

    if (AWS_ICON_SOURCE_ALIASES[val]) {
      queueCopy(destName, AWS_ICON_SOURCE_ALIASES[val]);
      continue;
    }

    queueCopy(destName, `architecture-service/${val}.svg`);
  }

  const removed = prune(destDir, need);
  console.log(
    `AWS icons: copied/updated ${copied} file(s) from aws-icons package; removed ${removed} unreferenced file(s) from public/aws-icons/`
  );
}

main();
