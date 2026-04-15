import { AZURE_SETUP_BUNDLE } from "../src/setup/azureAssets.ts";
import { AWS_SETUP_BUNDLE } from "../src/setup/awsAssets.ts";
import { GCP_SETUP_BUNDLE } from "../src/setup/gcpAssets.ts";

const bundles = [
  ["AWS", AWS_SETUP_BUNDLE],
  ["GCP", GCP_SETUP_BUNDLE],
  ["Azure", AZURE_SETUP_BUNDLE],
];

let failed = false;
for (const [name, b] of bundles) {
  const issues = [];
  if (b.dashboards.length === 0) issues.push("dashboards");
  if (b.pipelines.length === 0) issues.push("pipelines");
  if (b.mlJobFiles.length === 0) issues.push("mlJobFiles");
  if (issues.length) {
    console.error(`[verify-setup-bundles] ${name} bundle is missing: ${issues.join(", ")}`);
    failed = true;
  }
}

if (failed) {
  console.error(
    "\nThese assets come from installer/ (e.g. installer/*-custom-dashboards/*-dashboard.json). " +
      "Use a full repository checkout—avoid sparse clones that omit installer—and run npm run build again."
  );
  console.error(
    "\nDocker: if the build log showed a tiny context (~100KB instead of several MB), the daemon never " +
      "received most of installer/. Run `docker compose build` from the full repo root after `git clone`.\n"
  );
  process.exit(1);
}

console.log(
  "[verify-setup-bundles] OK — dashboards:",
  bundles.map(([n, b]) => `${n}:${b.dashboards.length}`).join(", ")
);
