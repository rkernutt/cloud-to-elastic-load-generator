import type {
  AlertRuleEntry,
  AlertRuleFile,
  CloudSetupBundle,
  DashboardDef,
  MlJobEntry,
  MlJobFile,
  PipelineEntry,
} from "./types";
import {
  buildDashboardSavedObjectPayload,
  dashboardDefToImportNdjsonLine,
  loadGeneratorKibanaTagId,
  LOAD_GENERATOR_KIBANA_TAG_NAME,
} from "./dashboardToImportNdjson";
import {
  proxyCall,
  isKibanaFeatureUnavailable,
  isMlResourceAlreadyExists,
  kibanaFeatureBlockedExplanation,
  resolveFleetPackageVersion,
  shouldUseSavedObjectDashboardInstall,
} from "./setupProxy";

export type SetupLogFn = (text: string, type?: "info" | "ok" | "error" | "warn") => void;

function savedObjectImportHasConflict(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as {
    errors?: Array<{ error?: { type?: string; statusCode?: number; message?: string } }>;
  };
  if (!Array.isArray(r.errors)) return false;
  return r.errors.some((e) => {
    const err = e?.error;
    if (!err || typeof err !== "object") return false;
    if (err.type === "conflict") return true;
    if (err.statusCode === 409) return true;
    const msg = typeof err.message === "string" ? err.message.toLowerCase() : "";
    return msg.includes("conflict");
  });
}

function isSavedObjectDashboardHit(r: unknown): r is { id: string; version?: string | number } {
  return r !== null && typeof r === "object" && typeof (r as { id?: unknown }).id === "string";
}

type SoGetOutcome = "hit" | "missing" | "unavailable";

/**
 * Serverless: import overwrite is unreliable; DELETE is often disabled. In-place PUT works when GET
 * returns a version (see {@link setupProxy} — 409 must not be swallowed for non-Fleet calls).
 */
async function putDashboardSavedObject(
  kb: string,
  apiKey: string,
  encId: string,
  attributes: Record<string, unknown>,
  references: unknown[],
  versionHint?: string | null
): Promise<void> {
  let version =
    versionHint !== undefined && versionHint !== null && String(versionHint).length > 0
      ? String(versionHint)
      : undefined;

  if (version === undefined) {
    let cur: { version?: string | number } | null = null;
    try {
      const raw = await proxyCall({
        baseUrl: kb,
        apiKey,
        path: `/api/saved_objects/dashboard/${encId}`,
        method: "GET",
        allow404: true,
      });
      if (raw && typeof raw === "object" && "version" in raw) {
        cur = raw as { version?: string | number };
      }
    } catch (e) {
      if (!isKibanaFeatureUnavailable(String(e))) throw e;
    }
    if (cur?.version !== undefined) {
      version = String(cur.version);
    }
  }

  const body: Record<string, unknown> = { attributes, references };
  if (version !== undefined) {
    body.version = version;
  }

  try {
    await proxyCall({
      baseUrl: kb,
      apiKey,
      path: `/api/saved_objects/dashboard/${encId}`,
      method: "PUT",
      body,
    });
  } catch (firstErr) {
    const m = String(firstErr);
    if (!m.includes("HTTP 409")) throw firstErr;
    const again = (await proxyCall({
      baseUrl: kb,
      apiKey,
      path: `/api/saved_objects/dashboard/${encId}`,
      method: "GET",
      allow404: true,
    })) as { version?: string | number } | null;
    const v2 = again?.version !== undefined ? String(again.version) : undefined;
    if (v2 === undefined) throw firstErr;
    await proxyCall({
      baseUrl: kb,
      apiKey,
      path: `/api/saved_objects/dashboard/${encId}`,
      method: "PUT",
      body: { attributes, references, version: v2 },
    });
  }
}

export async function runSetupInstall(opts: {
  setupBundle: CloudSetupBundle;
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  isServerless?: boolean;
  enableIntegration: boolean;
  enableApm: boolean;
  enablePipelines: boolean;
  enableDashboards: boolean;
  enableMlJobs: boolean;
  enableAlertRules: boolean;
  activateAlertRules: boolean;
  startMlJobs: boolean;
  extraFleetPackages?: { name: string; label: string }[];
  pipelines: PipelineEntry[];
  dashboards: DashboardDef[];
  mlJobFiles: MlJobFile[];
  alertRuleFiles: AlertRuleFile[];
  addLog: SetupLogFn;
}): Promise<void> {
  const {
    setupBundle,
    elasticUrl,
    kibanaUrl,
    apiKey,
    isServerless = false,
    enableIntegration,
    enableApm,
    enablePipelines,
    enableDashboards,
    enableMlJobs,
    enableAlertRules,
    activateAlertRules,
    startMlJobs,
    extraFleetPackages = [],
    pipelines,
    dashboards,
    mlJobFiles,
    alertRuleFiles,
    addLog,
  } = opts;

  const installIntegration = async (pkgName: string, labelOverride?: string) => {
    const label =
      labelOverride ?? (pkgName === "apm" ? "APM Integration" : `${setupBundle.fleetPackageLabel}`);
    addLog(`Installing ${label}…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    const version = await resolveFleetPackageVersion(kb, apiKey, pkgName);
    if (!version) {
      const hint =
        isServerless && pkgName === "cloud_security_posture"
          ? " This integration is only available on Security Serverless projects."
          : "";
      addLog(
        `  ✗ ${label}: could not resolve package version (Kibana Fleet or EPR).${hint}`,
        "error"
      );
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
      const m = String(e);
      addLog(`  ✗ ${label}: ${e}${kibanaFeatureBlockedExplanation(m)}`, "error");
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
          body: {
            description: pipeline.description,
            processors: pipeline.processors,
            ...(pipeline.on_failure ? { on_failure: pipeline.on_failure } : {}),
          },
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

  const ensureKibanaTag = async (kb: string): Promise<void> => {
    const tagId = await loadGeneratorKibanaTagId();
    const encTagId = encodeURIComponent(tagId);
    try {
      const existing = await proxyCall({
        baseUrl: kb,
        apiKey,
        path: `/api/saved_objects/tag/${encTagId}`,
        method: "GET",
        allow404: true,
      });
      if (existing !== null) return;
    } catch {
      /* GET unavailable — try create anyway */
    }
    try {
      await proxyCall({
        baseUrl: kb,
        apiKey,
        path: `/api/saved_objects/tag/${encTagId}`,
        method: "POST",
        body: {
          attributes: {
            name: LOAD_GENERATOR_KIBANA_TAG_NAME,
            description:
              "Installed by Cloud to Elastic Load Generator — filter this tag to find or remove these assets.",
          },
        },
      });
    } catch (tagErr) {
      const m = String(tagErr);
      if (!m.includes("409") && !m.includes("conflict")) {
        const hint = isServerless
          ? " (saved-object tags may not be available on this Serverless project type)"
          : "";
        addLog(
          `  ⚠ Could not create Kibana tag${hint} — dashboards still install normally.`,
          "warn"
        );
      }
    }
  };

  const installDashboards = async () => {
    addLog(`Installing ${dashboards.length} dashboards…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    let ok = 0;
    let fail = 0;
    let loggedFallbackNote = false;

    await ensureKibanaTag(kb);

    for (const dash of dashboards) {
      const { id: _id, spaces: _spaces, ...body } = dash;

      // 1) Try the newer Kibana Dashboards API first.
      let dashApiOk = false;
      try {
        await proxyCall({
          baseUrl: kb,
          apiKey,
          path: "/api/dashboards",
          method: "POST",
          body,
        });
        ok++;
        dashApiOk = true;
      } catch (e) {
        const msg = String(e);
        if (!shouldUseSavedObjectDashboardInstall(msg)) {
          fail++;
          addLog(
            `  ✗ Dashboard "${dash.title}": ${e}${kibanaFeatureBlockedExplanation(msg)}`,
            "error"
          );
          continue;
        }
        if (!loggedFallbackNote) {
          loggedFallbackNote = true;
          addLog(
            "  Note: Kibana Dashboards API is not available — installing via saved objects.",
            "info"
          );
        }
      }
      if (dashApiOk) continue;

      // 2) Saved-object POST/PUT — no multipart needed, works on Cloud Hosted & Serverless.
      try {
        const payload = await buildDashboardSavedObjectPayload(dash);
        const encId = encodeURIComponent(payload.id);
        const soBody = { attributes: payload.attributes, references: payload.references };

        let getOutcome: SoGetOutcome = "unavailable";
        let existingVersion: string | undefined;
        try {
          const got = await proxyCall({
            baseUrl: kb,
            apiKey,
            path: `/api/saved_objects/dashboard/${encId}`,
            method: "GET",
            allow404: true,
          });
          if (got === null) {
            getOutcome = "missing";
          } else if (isSavedObjectDashboardHit(got)) {
            getOutcome = "hit";
            if (got.version !== undefined) existingVersion = String(got.version);
          }
        } catch (eG) {
          if (!isKibanaFeatureUnavailable(String(eG))) throw eG;
        }

        if (getOutcome === "hit") {
          await putDashboardSavedObject(
            kb,
            apiKey,
            encId,
            payload.attributes,
            payload.references,
            existingVersion
          );
          ok++;
          continue;
        }

        if (getOutcome === "missing") {
          try {
            await proxyCall({
              baseUrl: kb,
              apiKey,
              path: `/api/saved_objects/dashboard/${encId}`,
              method: "POST",
              body: soBody,
            });
            ok++;
            continue;
          } catch (postErr) {
            const pm = String(postErr);
            if (pm.includes("409") || pm.includes("conflict")) {
              await putDashboardSavedObject(
                kb,
                apiKey,
                encId,
                payload.attributes,
                payload.references,
                undefined
              );
              ok++;
              continue;
            }
            if (!isKibanaFeatureUnavailable(pm)) throw postErr;
          }
        }

        // 3) Last resort: NDJSON import (handles edge-case deployments where POST/PUT are blocked).
        const ndjson = await dashboardDefToImportNdjsonLine(dash);
        const raw = (await proxyCall({
          baseUrl: kb,
          apiKey,
          path: `/api/saved_objects/_import?overwrite=true`,
          method: "POST",
          kibanaSavedObjectsNdjson: ndjson,
        })) as { success?: boolean; successCount?: number; errors?: unknown[] };
        const importedOk =
          raw?.success === true || (typeof raw?.successCount === "number" && raw.successCount > 0);
        if (importedOk) {
          ok++;
        } else if (savedObjectImportHasConflict(raw)) {
          await putDashboardSavedObject(
            kb,
            apiKey,
            encId,
            payload.attributes,
            payload.references,
            undefined
          );
          ok++;
        } else {
          throw new Error(
            `Saved objects import: ${JSON.stringify(raw?.errors ?? raw).slice(0, 400)}`
          );
        }
      } catch (e2) {
        fail++;
        const m2 = String(e2);
        addLog(
          `  ✗ Dashboard "${dash.title}": ${e2}${kibanaFeatureBlockedExplanation(m2)}`,
          "error"
        );
      }
    }
    addLog(
      `  ✓ Dashboards: ${ok} installed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  const installMlJobs = async () => {
    const entries = mlJobFiles.flatMap((f) => f.jobs);
    const totalJobs = entries.length;
    /** Per-job GET/PUT calls are independent; pool matches uninstall parallelism. */
    const ML_INSTALL_CONCURRENCY = 12;
    addLog(`Installing ${totalJobs} ML jobs across ${mlJobFiles.length} groups…`);
    let ok = 0;
    let fail = 0;
    let jobsAlreadyPresent = 0;
    let next = 0;

    const installOne = async (entry: MlJobEntry) => {
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
    };

    const worker = async () => {
      while (next < entries.length) {
        const i = next++;
        const entry = entries[i]!;
        try {
          await installOne(entry);
          ok++;
        } catch (e) {
          fail++;
          addLog(`  ✗ ML job ${entry.id}: ${e}`, "error");
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(ML_INSTALL_CONCURRENCY, Math.max(1, entries.length)) }, () =>
        worker()
      )
    );

    const reused =
      jobsAlreadyPresent > 0
        ? ` (${jobsAlreadyPresent} job(s) already existed — datafeed ensured)`
        : "";
    addLog(
      `  ✓ ML jobs: ${ok} ok${reused}${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  const installTsdsTemplates = async () => {
    const cloudloadgenPipelines = pipelines.filter(
      (p) => p.group === "cloudloadgen-metrics" && p.dataset
    );
    if (cloudloadgenPipelines.length === 0) return;

    addLog(
      `Creating TSDS index templates for ${cloudloadgenPipelines.length} metric data streams…`
    );
    let ok = 0;
    let fail = 0;

    // Create shared component template
    const componentId = "cloudloadgen-tsds-settings";
    try {
      await proxyCall({
        baseUrl: elasticUrl,
        apiKey,
        path: `/_component_template/${encodeURIComponent(componentId)}`,
        method: "PUT",
        body: {
          template: {
            settings: {
              index: {
                mode: "time_series",
                routing_path: ["cloud.account.id", "cloud.region"],
                sort: { field: ["@timestamp"], order: ["desc"] },
              },
            },
          },
          _meta: { created_by: "cloudloadgen" },
        },
      });
    } catch (e) {
      addLog(`  ⚠ TSDS component template: ${e} (non-fatal, TSDS may not be supported)`, "warn");
    }

    for (const pipeline of cloudloadgenPipelines) {
      const templateId = `metrics-${pipeline.dataset}-cloudloadgen`;
      try {
        await proxyCall({
          baseUrl: elasticUrl,
          apiKey,
          path: `/_index_template/${encodeURIComponent(templateId)}`,
          method: "PUT",
          body: {
            index_patterns: [`metrics-${pipeline.dataset}-*`],
            data_stream: {},
            composed_of: [componentId],
            priority: 200,
            _meta: { created_by: "cloudloadgen" },
          },
        });
        ok++;
      } catch (e) {
        fail++;
        addLog(`  ⚠ TSDS template ${templateId}: ${e}`, "warn");
      }
    }

    if (ok > 0 || fail > 0) {
      addLog(
        `  ✓ TSDS templates: ${ok} created${fail > 0 ? `, ${fail} skipped/failed` : ""}`,
        fail > 0 ? "warn" : "ok"
      );
    }
  };

  const installAlertRules = async () => {
    const entries: AlertRuleEntry[] = alertRuleFiles.flatMap((f) => f.rules);
    if (entries.length === 0) return;
    const totalRules = entries.length;
    addLog(`Installing ${totalRules} alerting rules across ${alertRuleFiles.length} groups…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    let ok = 0;
    let skipped = 0;
    let fail = 0;

    for (const rule of entries) {
      const rulePath = `/api/alerting/rule/${encodeURIComponent(rule.id)}`;
      try {
        const existing = await proxyCall({
          baseUrl: kb,
          apiKey,
          path: rulePath,
          method: "GET",
          allow404: true,
        });
        if (
          existing &&
          typeof existing === "object" &&
          "id" in (existing as Record<string, unknown>)
        ) {
          skipped++;
          addLog(`  — ${rule.name}: already exists, skipping`, "info");
          continue;
        }
      } catch {
        // 404 or other error — proceed with create
      }

      try {
        const { id: _id, ...body } = rule;
        await proxyCall({
          baseUrl: kb,
          apiKey,
          path: rulePath,
          method: "POST",
          body,
        });
        ok++;
        addLog(`  ✓ ${rule.name}`, "ok");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("already exists") || msg.includes("409")) {
          skipped++;
          addLog(`  — ${rule.name}: already exists`, "info");
        } else if (isKibanaFeatureUnavailable(msg)) {
          fail++;
          addLog(`  ⚠ ${rule.name}: ${kibanaFeatureBlockedExplanation(msg)}`, "warn");
        } else {
          fail++;
          addLog(`  ✗ ${rule.name}: ${msg}`, "error");
        }
      }
    }

    addLog(
      `  Alerting rules: ${ok} created${skipped > 0 ? `, ${skipped} already existed` : ""}${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  const activateRules = async () => {
    const entries: AlertRuleEntry[] = alertRuleFiles.flatMap((f) => f.rules);
    if (entries.length === 0) return;
    addLog(`Enabling ${entries.length} alerting rules…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    let ok = 0;
    let fail = 0;
    for (const rule of entries) {
      try {
        await proxyCall({
          baseUrl: kb,
          apiKey,
          path: `/api/alerting/rule/${encodeURIComponent(rule.id)}/_enable`,
          method: "POST",
          body: {},
        });
        ok++;
      } catch (e) {
        fail++;
        addLog(`  ✗ Enable "${rule.name}": ${e}`, "error");
      }
    }
    addLog(
      `  ✓ Rules enabled: ${ok}${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  const openAndStartMlJobs = async () => {
    const entries = mlJobFiles.flatMap((f) => f.jobs);
    if (entries.length === 0) return;
    addLog(`Opening & starting ${entries.length} ML jobs…`);
    let ok = 0;
    let fail = 0;
    const retryQueue: typeof entries = [];

    const startOne = async (entry: (typeof entries)[0], isRetry = false) => {
      const encId = encodeURIComponent(entry.id);
      try {
        await proxyCall({
          baseUrl: elasticUrl,
          apiKey,
          path: `/_ml/anomaly_detectors/${encId}/_open`,
          method: "POST",
          body: {},
        });
      } catch (e) {
        const msg = String(e);
        if (!msg.includes("already opened") && !msg.includes("status_exception")) {
          if (!isRetry) {
            retryQueue.push(entry);
            return;
          }
          fail++;
          addLog(`  ✗ Open job "${entry.id}": ${e}`, "error");
          return;
        }
      }
      try {
        await proxyCall({
          baseUrl: elasticUrl,
          apiKey,
          path: `/_ml/datafeeds/datafeed-${encId}/_start`,
          method: "POST",
          body: {},
        });
        ok++;
      } catch (e) {
        const msg = String(e);
        if (msg.includes("already started") || msg.includes("status_exception")) {
          ok++;
        } else if (!isRetry) {
          retryQueue.push(entry);
        } else {
          fail++;
          addLog(`  ✗ Start datafeed "datafeed-${entry.id}": ${e}`, "error");
        }
      }
    };

    const BATCH = 8;
    for (let i = 0; i < entries.length; i += BATCH) {
      await Promise.all(entries.slice(i, i + BATCH).map((e) => startOne(e)));
    }

    if (retryQueue.length > 0) {
      addLog(`  Retrying ${retryQueue.length} jobs after brief delay…`);
      await new Promise((r) => setTimeout(r, 3000));
      for (let i = 0; i < retryQueue.length; i += BATCH) {
        await Promise.all(retryQueue.slice(i, i + BATCH).map((e) => startOne(e, true)));
      }
    }

    addLog(
      `  ✓ ML jobs started: ${ok}${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  if (enableIntegration) await installIntegration(setupBundle.fleetPackage);
  if (enableApm) await installIntegration("apm");
  for (const pkg of extraFleetPackages) {
    await installIntegration(pkg.name, pkg.label);
  }
  if (enablePipelines) {
    await installPipelines();
    await installTsdsTemplates();
  }
  if (enableDashboards) await installDashboards();
  if (enableMlJobs) await installMlJobs();
  if (enableAlertRules) await installAlertRules();
  if (activateAlertRules && enableAlertRules) await activateRules();
  if (startMlJobs && enableMlJobs) await openAndStartMlJobs();
}
