import { describe, it, expect } from "vitest";
import { dashboardDefToSavedObjectId } from "./dashboardToImportNdjson";
import type { DashboardDef } from "./types";
import {
  dashboardSavedObjectId as dashboardSavedObjectIdMjs,
  buildArtifactsFromRelatedDashboards,
} from "../../scripts/_lib/dashboardId.mjs";

/**
 * The Node-side helpers used by the .mjs CLI alert-rules installer and the
 * standalone asset exporter must produce identical dashboard saved-object IDs
 * to the TypeScript wizard installer. If they ever drift, rules installed via
 * one path would link to the wrong dashboard ID and the Alert Details page
 * would show "Related dashboards: 0" even though dashboards were installed.
 *
 * The titles below are the exact strings shipped in
 * `installer/<cloud>-custom-rules/*.json::relatedDashboards`. Keep in sync
 * with those files (and the matching dashboard `title`s under
 * `assets/<cloud>/dashboards/*.json`).
 */
const PRIMARY_RELATED_DASHBOARD_TITLES = [
  // AWS
  "Data & Analytics Pipeline — overview",
  "Data Exfiltration Chain — overview",
  "IAM Privilege Escalation Chain — overview",
  "Security Finding Chain — overview",
  // GCP
  "GCP Data & Analytics Pipeline — overview",
  "GCP Data Exfiltration Chain — overview",
  "GCP IAM Privilege Escalation Chain — overview",
  "GCP Security Finding Chain — overview",
  // Azure
  "Azure Data & Analytics Pipeline — overview",
  "Azure Data Exfiltration Chain — overview",
  "Azure IAM Privilege Escalation Chain — overview",
  "Azure Security Finding Chain — overview",
] as const;

describe("relatedDashboards id resolution", () => {
  it("Node helper produces the same UUID as the TS wizard for every rule's primary dashboard", async () => {
    for (const title of PRIMARY_RELATED_DASHBOARD_TITLES) {
      const def: DashboardDef = { title };
      const tsId = await dashboardDefToSavedObjectId(def);
      const mjsId = dashboardSavedObjectIdMjs(title);
      expect(mjsId).toBe(tsId);
    }
  });

  it("buildArtifactsFromRelatedDashboards returns null for empty / missing inputs", () => {
    expect(buildArtifactsFromRelatedDashboards(undefined)).toBeNull();
    expect(buildArtifactsFromRelatedDashboards([])).toBeNull();
    expect(buildArtifactsFromRelatedDashboards([""])).toBeNull();
  });

  it("buildArtifactsFromRelatedDashboards returns the Kibana artifacts shape", () => {
    const out = buildArtifactsFromRelatedDashboards(["Data & Analytics Pipeline — overview"]);
    expect(out).toEqual({
      dashboards: [
        {
          id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
          ),
        },
      ],
    });
  });
});
