/**
 * Dev helper: `npx vite-node scripts/debug-aws-setup.mjs`
 * Prints AWS setup bundle counts and duplicate ML job ids (should be none).
 */
import { AWS_SETUP_BUNDLE } from "../src/setup/awsAssets.ts";

const d = AWS_SETUP_BUNDLE.dashboards;
const jobIds = AWS_SETUP_BUNDLE.mlJobFiles.flatMap((f) => f.jobs.map((j) => j.id));
const js = new Map();
for (const id of jobIds) js.set(id, (js.get(id) ?? 0) + 1);
const dupJ = [...js.entries()].filter(([, n]) => n > 1);

console.log(
  "dashboards",
  d.length,
  "mlFiles",
  AWS_SETUP_BUNDLE.mlJobFiles.length,
  "mlJobs",
  jobIds.length
);
console.log("duplicateJobIds", dupJ.length, dupJ);
