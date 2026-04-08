/**
 * Microsoft 365 (o365_metrics) metric generators.
 */

import type { MetricGenerator } from "../../../aws/generators/types.js";
import {
  generateActiveUsersServicesUserCounts,
  generateTeamsUserActivityUserCounts,
  generateOutlookActivity,
  generateOnedriveUsageStorage,
} from "./graphReports.js";

export const M365_METRICS_GENERATORS: Record<string, MetricGenerator> = {
  "active-users-services": generateActiveUsersServicesUserCounts,
  "teams-user-activity": generateTeamsUserActivityUserCounts,
  "outlook-activity": generateOutlookActivity,
  "onedrive-usage-storage": generateOnedriveUsageStorage,
};
