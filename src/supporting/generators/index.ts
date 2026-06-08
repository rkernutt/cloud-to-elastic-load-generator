/**
 * Re-exports generators from existing cloud modules for the Supporting Services config.
 * Each generator originally lives under its cloud vendor; we aggregate them here so the
 * supporting config can load them as a single unified registry.
 */

import { generateEntraIdLog, generateM365Log } from "../../azure/generators/platform.js";
import {
  generateActiveUsersServicesLog,
  generateTeamsUserActivityLog,
  generateOutlookActivityLog,
  generateOnedriveUsageStorageLog,
} from "../../azure/generators/miscExtended.js";
import { generateManagedAdLog } from "../../gcp/generators/security.js";
import { generateServiceNowCmdbLog } from "../../servicenow/generators/index.js";

export const SUPPORTING_GENERATORS: Record<
  string,
  (ts: string, er: number) => unknown | unknown[]
> = {
  "entra-id": generateEntraIdLog,
  m365: generateM365Log,
  "managed-ad": generateManagedAdLog,
  "active-users-services": generateActiveUsersServicesLog,
  "teams-user-activity": generateTeamsUserActivityLog,
  "outlook-activity": generateOutlookActivityLog,
  "onedrive-usage-storage": generateOnedriveUsageStorageLog,
  servicenow_cmdb: generateServiceNowCmdbLog,
};
