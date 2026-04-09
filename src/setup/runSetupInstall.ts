import type { CloudSetupBundle, DashboardDef, MlJobFile, PipelineEntry } from "./types";
import { dashboardDefToImportNdjsonLine } from "./dashboardToImportNdjson";
import {
  proxyCall,
  isKibanaFeatureUnavailable,
  isMlResourceAlreadyExists,
  resolveFleetPackageVersion,
} from "./setupProxy";

export type SetupLogFn = (text: string, type?: "info" | "ok" | "error" | "warn") => void;

export async function runSetupInstall(opts: {
  setupBundle: CloudSetupBundle;
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  enableIntegration: boolean;
  enableApm: boolean;
  enablePipelines: boolean;
  enableDashboards: boolean;
  enableMlJobs: boolean;
  pipelines: PipelineEntry[];
  dashboards: DashboardDef[];
  mlJobFiles: MlJobFile[];
  addLog: SetupLogFn;
}): Promise<void> {
  const {
    setupBundle,
    elasticUrl,
    kibanaUrl,
    apiKey,
    enableIntegration,
    enableApm,
    enablePipelines,
    enableDashboards,
    enableMlJobs,
    pipelines,
    dashboards,
    mlJobFiles,
    addLog,
  } = opts;

  const installIntegration = async (pkgName: string) => {
    const label = pkgName === "apm" ? "APM Integration" : `${setupBundle.fleetPackageLabel}`;
    addLog(`Installing ${label}…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    const version = await resolveFleetPackageVersion(kb, apiKey, pkgName);
    if (!version) {
      addLog(`  ✗ ${label}: could not resolve package version (Kibana Fleet or EPR).`, "error");
      return;
    }

    try {
      const result = (await proxyCall({
        baseUrl: kb,
        apiKey,
        path: `/api/fleet/epm/packages/${pkgName}/${version}`,
        method: "POST",
        body: { force: false },
      })) as { alreadyInstalled?: boolean };
      if (result?.alreadyInstalled) {
        addLog(`  ✓ ${label} already installed (v${version})`, "ok");
      } else {
        addLog(`  ✓ ${label} installed successfully (v${version})`, "ok");
      }
    } catch (e) {
      addLog(`  ✗ ${label}: ${e}`, "error");
    }
  };

  const installPipelines = async () => {
    addLog(`Installing ${pipelines.length} ingest pipelines…`);
    let ok = 0;
    let fail = 0;
    for (const pipeline of pipelines) {
      try {
        await proxyCall({
          baseUrl: elasticUrl,
          apiKey,
          path: `/_ingest/pipeline/${encodeURIComponent(pipeline.id)}`,
          method: "PUT",
          body: { processors: pipeline.processors },
        });
        ok++;
      } catch (e) {
        fail++;
        addLog(`  ✗ Pipeline ${pipeline.id}: ${e}`, "error");
      }
    }
    addLog(
      `  ✓ Pipelines: ${ok} installed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  const installDashboards = async () => {
    addLog(`Installing ${dashboards.length} dashboards…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    let ok = 0;
    let fail = 0;
    for (const dash of dashboards) {
      const { id: _id, spaces: _spaces, ...body } = dash;
      try {
        await proxyCall({
          baseUrl: kb,
          apiKey,
          path: "/api/dashboards",
          method: "POST",
          body,
        });
        ok++;
      } catch (e) {
        const msg = String(e);
        if (!isKibanaFeatureUnavailable(msg)) {
          fail++;
          addLog(`  ✗ Dashboard "${dash.title}": ${e}`, "error");
          continue;
        }
        try {
          const ndjson = await dashboardDefToImportNdjsonLine(dash);
          const raw = (await proxyCall({
            baseUrl: kb,
            apiKey,
            path: "/api/saved_objects/_import?overwrite=false",
            method: "POST",
            kibanaSavedObjectsNdjson: ndjson,
          })) as {
            success?: boolean;
            successCount?: number;
            errors?: unknown[];
          };
          const importedOk =
            raw?.success === true ||
            (typeof raw?.successCount === "number" && raw.successCount > 0);
          if (!importedOk) {
            throw new Error(
              `Saved objects import: ${JSON.stringify(raw?.errors ?? raw).slice(0, 400)}`
            );
          }
          ok++;
          addLog(`  ✓ Dashboard "${dash.title}" (saved objects import)`, "ok");
        } catch (e2) {
          fail++;
          addLog(`  ✗ Dashboard "${dash.title}": ${e2}`, "error");
        }
      }
    }
    addLog(
      `  ✓ Dashboards: ${ok} installed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  const installMlJobs = async () => {
    const totalJobs = mlJobFiles.reduce((n, f) => n + f.jobs.length, 0);
    addLog(`Installing ${totalJobs} ML jobs across ${mlJobFiles.length} groups…`);
    let ok = 0;
    let fail = 0;
    let jobsAlreadyPresent = 0;
    for (const file of mlJobFiles) {
      for (const entry of file.jobs) {
        try {
          const jobPath = `/_ml/anomaly_detectors/${encodeURIComponent(entry.id)}`;
          const existing = await proxyCall({
            baseUrl: elasticUrl,
            apiKey,
            path: jobPath,
            method: "GET",
            allow404: true,
          });
          let jobAlreadyThere = existing !== null;

          if (!jobAlreadyThere) {
            try {
              await proxyCall({
                baseUrl: elasticUrl,
                apiKey,
                path: jobPath,
                method: "PUT",
                body: entry.job,
              });
            } catch (putErr) {
              const putMsg = String(putErr);
              if (isMlResourceAlreadyExists(putMsg)) {
                jobAlreadyThere = true;
              } else {
                throw putErr;
              }
            }
          }

          if (jobAlreadyThere) jobsAlreadyPresent++;

          const datafeedPath = `/_ml/datafeeds/datafeed-${encodeURIComponent(entry.id)}`;
          try {
            await proxyCall({
              baseUrl: elasticUrl,
              apiKey,
              path: datafeedPath,
              method: "PUT",
              body: { ...entry.datafeed, job_id: entry.id },
            });
          } catch (dfErr) {
            if (!isMlResourceAlreadyExists(String(dfErr))) throw dfErr;
          }

          ok++;
        } catch (e) {
          fail++;
          addLog(`  ✗ ML job ${entry.id}: ${e}`, "error");
        }
      }
    }
    const reused =
      jobsAlreadyPresent > 0
        ? ` (${jobsAlreadyPresent} job(s) already existed — datafeed ensured)`
        : "";
    addLog(
      `  ✓ ML jobs: ${ok} ok${reused}${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  if (enableIntegration) await installIntegration(setupBundle.fleetPackage);
  if (enableApm) await installIntegration("apm");
  if (enablePipelines) await installPipelines();
  if (enableDashboards) await installDashboards();
  if (enableMlJobs) await installMlJobs();
}
