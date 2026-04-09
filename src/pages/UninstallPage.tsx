import { useState, useMemo, useEffect } from "react";
import {
  EuiTitle,
  EuiSpacer,
  EuiText,
  EuiButton,
  EuiCallOut,
  EuiCheckbox,
  EuiPanel,
  EuiCode,
  EuiHorizontalRule,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
} from "@elastic/eui";

import type { CloudSetupBundle, MlJobFile, PipelineEntry } from "../setup/types";
import { dashboardDefToSavedObjectId } from "../setup/dashboardToImportNdjson";
import { stableDashboardKey } from "../setup/stableDashboardKey";
import { runSetupInstall } from "../setup/runSetupInstall";
import { proxyCall, resolveFleetPackageVersion } from "../setup/setupProxy";
import { InstallerRow } from "../components/InstallerRow";

type LogLine = { text: string; type: "info" | "ok" | "error" | "warn" };

interface UninstallPageProps {
  setupBundle: CloudSetupBundle;
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  onUninstallComplete?: () => void;
  onReinstallComplete?: () => void;
}

export function UninstallPage({
  setupBundle,
  elasticUrl,
  kibanaUrl,
  apiKey,
  onUninstallComplete,
  onReinstallComplete,
}: UninstallPageProps) {
  const PIPELINES: PipelineEntry[] = setupBundle.pipelines;
  const ML_JOB_FILES: MlJobFile[] = setupBundle.mlJobFiles;
  const DASHBOARDS = setupBundle.dashboards;

  const [enableIntegration, setEnableIntegration] = useState(false);
  const [enableApm, setEnableApm] = useState(false);
  const [enablePipelines, setEnablePipelines] = useState(false);
  const [enableDashboards, setEnableDashboards] = useState(false);
  const [enableMlJobs, setEnableMlJobs] = useState(false);

  const pipelineGroups = useMemo(
    () => [...new Set(PIPELINES.map((p) => p.group))].sort(),
    [PIPELINES]
  );
  const [selectedPipelineGroups, setSelectedPipelineGroups] = useState<Set<string>>(
    () => new Set(pipelineGroups)
  );

  const dashboardKeys = useMemo(
    () =>
      DASHBOARDS.map((d, i) => ({
        key: stableDashboardKey(d, i),
        title: d.title ?? `Dashboard ${i + 1}`,
      })),
    [DASHBOARDS]
  );
  const [selectedDashboardKeys, setSelectedDashboardKeys] = useState<Set<string>>(
    () => new Set(dashboardKeys.map((x) => x.key))
  );

  const mlJobGroups = useMemo(
    () => ML_JOB_FILES.map((f) => ({ group: f.group, description: f.description })),
    [ML_JOB_FILES]
  );
  const [selectedMlGroups, setSelectedMlGroups] = useState<Set<string>>(
    () => new Set(ML_JOB_FILES.map((f) => f.group))
  );

  useEffect(() => {
    setSelectedPipelineGroups(new Set(pipelineGroups));
  }, [setupBundle.fleetPackage, PIPELINES.length, pipelineGroups]);

  useEffect(() => {
    setSelectedDashboardKeys(new Set(dashboardKeys.map((x) => x.key)));
  }, [setupBundle.fleetPackage, DASHBOARDS.length, dashboardKeys]);

  useEffect(() => {
    setSelectedMlGroups(new Set(ML_JOB_FILES.map((f) => f.group)));
  }, [setupBundle.fleetPackage, ML_JOB_FILES.length, ML_JOB_FILES]);

  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [confirmUninstallOpen, setConfirmUninstallOpen] = useState(false);
  const [confirmReinstallOpen, setConfirmReinstallOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const addLog = (text: string, type: LogLine["type"] = "info") =>
    setLog((prev) => [...prev, { text, type }]);

  const hasEs = !!elasticUrl.trim() && !!apiKey.trim();
  const hasKb = !!kibanaUrl.trim() && !!apiKey.trim();
  const needsKb = enableIntegration || enableApm || enableDashboards;
  const anyEnabled =
    enableIntegration || enableApm || enablePipelines || enableDashboards || enableMlJobs;
  const canRun = anyEnabled && hasEs && (!needsKb || hasKb);

  function toggleGroup<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  const missingKbWarning = needsKb && !hasKb && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut title="Kibana URL required" color="warning" iconType="warning" size="s">
        <p>
          Set a Kibana URL on the Start page to uninstall, reinstall, or reset Fleet integrations or
          dashboards.
        </p>
      </EuiCallOut>
    </>
  );

  const missingEsWarning = !hasEs && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut title="Connection required" color="warning" iconType="warning" size="s">
        <p>
          Set the Elasticsearch URL and API key on the Start page before uninstalling or
          reinstalling assets.
        </p>
      </EuiCallOut>
    </>
  );

  async function removeFleetPackage(pkgName: string, label: string) {
    addLog(`Removing ${label}…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    const version = await resolveFleetPackageVersion(kb, apiKey, pkgName);
    if (!version) {
      addLog(`  ✗ ${label}: could not resolve installed version to uninstall.`, "error");
      return;
    }
    const path = `/api/fleet/epm/packages/${encodeURIComponent(pkgName)}/${encodeURIComponent(
      version
    )}?force=true`;
    const deleted = await proxyCall({
      baseUrl: kb,
      apiKey,
      path,
      method: "DELETE",
      allow404: true,
    });
    if (deleted == null) {
      addLog(`  – ${label} not installed for this version (v${version})`, "warn");
    } else {
      addLog(`  ✓ ${label} uninstall completed (v${version})`, "ok");
    }
  }

  async function uninstallIntegration() {
    await removeFleetPackage(setupBundle.fleetPackage, setupBundle.fleetPackageLabel);
  }

  async function uninstallApm() {
    await removeFleetPackage("apm", "APM Integration");
  }

  async function uninstallPipelines() {
    const toRemove = PIPELINES.filter((p) => selectedPipelineGroups.has(p.group));
    addLog(`Removing ${toRemove.length} ingest pipelines…`);
    let ok = 0;
    let fail = 0;
    for (const pipeline of toRemove) {
      try {
        await proxyCall({
          baseUrl: elasticUrl,
          apiKey,
          path: `/_ingest/pipeline/${encodeURIComponent(pipeline.id)}`,
          method: "DELETE",
          allow404: true,
        });
        ok++;
      } catch (e) {
        fail++;
        addLog(`  ✗ Pipeline ${pipeline.id}: ${e}`, "error");
      }
    }
    addLog(
      `  ✓ Pipelines: ${ok} removed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  }

  async function uninstallDashboards() {
    const toRemove = DASHBOARDS.filter((d, i) =>
      selectedDashboardKeys.has(stableDashboardKey(d, i))
    );
    addLog(`Removing ${toRemove.length} custom dashboards…`);
    let ok = 0;
    let fail = 0;
    const kb = kibanaUrl.replace(/\/$/, "");
    for (const dash of toRemove) {
      try {
        const dashId = await dashboardDefToSavedObjectId(dash);
        const del = await proxyCall({
          baseUrl: kb,
          apiKey,
          path: `/api/saved_objects/dashboard/${encodeURIComponent(dashId)}`,
          method: "DELETE",
          allow404: true,
        });
        if (del == null) {
          addLog(
            `  – Dashboard "${dash.title}" — not found (may use a different id if created via Dashboards API only)`,
            "warn"
          );
        } else {
          addLog(`  ✓ Dashboard "${dash.title}"`, "ok");
        }
        ok++;
      } catch (e) {
        fail++;
        addLog(`  ✗ Dashboard "${dash.title}": ${e}`, "error");
      }
    }
    addLog(
      `  ✓ Dashboards: ${ok} processed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  }

  async function uninstallOneMlJob(jobId: string) {
    const dfId = `datafeed-${jobId}`;
    const encJob = encodeURIComponent(jobId);
    const encDf = encodeURIComponent(dfId);

    try {
      await proxyCall({
        baseUrl: elasticUrl,
        apiKey,
        path: `/_ml/datafeeds/${encDf}/_stop`,
        method: "POST",
        body: { force: true },
      });
    } catch {
      /* already stopped or missing */
    }
    try {
      await proxyCall({
        baseUrl: elasticUrl,
        apiKey,
        path: `/_ml/anomaly_detectors/${encJob}/_close`,
        method: "POST",
        body: { force: true },
      });
    } catch {
      /* already closed or missing */
    }
    await proxyCall({
      baseUrl: elasticUrl,
      apiKey,
      path: `/_ml/datafeeds/${encDf}`,
      method: "DELETE",
      allow404: true,
    });
    await proxyCall({
      baseUrl: elasticUrl,
      apiKey,
      path: `/_ml/anomaly_detectors/${encJob}`,
      method: "DELETE",
      allow404: true,
    });
  }

  async function uninstallMlJobs() {
    const files = ML_JOB_FILES.filter((f) => selectedMlGroups.has(f.group));
    const totalJobs = files.reduce((n, f) => n + f.jobs.length, 0);
    addLog(`Removing ${totalJobs} ML jobs across ${files.length} groups…`);
    let ok = 0;
    let fail = 0;
    for (const file of files) {
      for (const entry of file.jobs) {
        try {
          await uninstallOneMlJob(entry.id);
          ok++;
        } catch (e) {
          fail++;
          addLog(`  ✗ ML job ${entry.id}: ${e}`, "error");
        }
      }
    }
    addLog(
      `  ✓ ML jobs: ${ok} removed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  }

  const filteredPipelines = () => PIPELINES.filter((p) => selectedPipelineGroups.has(p.group));
  const filteredDashboards = () =>
    DASHBOARDS.filter((d, i) => selectedDashboardKeys.has(stableDashboardKey(d, i)));
  const filteredMlFiles = () => ML_JOB_FILES.filter((f) => selectedMlGroups.has(f.group));

  async function performUninstallSteps() {
    if (enableIntegration) await uninstallIntegration();
    if (enableApm) await uninstallApm();
    if (enablePipelines) await uninstallPipelines();
    if (enableDashboards) await uninstallDashboards();
    if (enableMlJobs) await uninstallMlJobs();
  }

  const runUninstall = async () => {
    setConfirmUninstallOpen(false);
    setIsRunning(true);
    setIsDone(false);
    setLog([]);
    try {
      await performUninstallSteps();
      addLog("Removal finished.", "ok");
      setIsDone(true);
      onUninstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      setIsRunning(false);
    }
  };

  const runReinstall = async () => {
    setConfirmReinstallOpen(false);
    setIsRunning(true);
    setIsDone(false);
    setLog([]);
    try {
      await runSetupInstall({
        setupBundle,
        elasticUrl,
        kibanaUrl,
        apiKey,
        enableIntegration,
        enableApm,
        enablePipelines,
        enableDashboards,
        enableMlJobs,
        pipelines: filteredPipelines(),
        dashboards: filteredDashboards(),
        mlJobFiles: filteredMlFiles(),
        addLog,
      });
      addLog("Reinstall finished.", "ok");
      setIsDone(true);
      onReinstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      setIsRunning(false);
    }
  };

  const runReset = async () => {
    setConfirmResetOpen(false);
    setIsRunning(true);
    setIsDone(false);
    setLog([]);
    try {
      await performUninstallSteps();
      addLog("--- Reinstalling selected components ---", "info");
      await runSetupInstall({
        setupBundle,
        elasticUrl,
        kibanaUrl,
        apiKey,
        enableIntegration,
        enableApm,
        enablePipelines,
        enableDashboards,
        enableMlJobs,
        pipelines: filteredPipelines(),
        dashboards: filteredDashboards(),
        mlJobFiles: filteredMlFiles(),
        addLog,
      });
      addLog("Uninstall and reinstall finished.", "ok");
      setIsDone(true);
      onReinstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <EuiTitle size="s">
        <h2>Uninstall / reinstall</h2>
      </EuiTitle>
      <EuiText size="s" color="subdued">
        <p>
          Use the same categories as <strong>Setup</strong> to reinstall assets, remove them only,
          or run a full <strong>reset</strong> (uninstall then reinstall). Fleet operations need a
          Kibana URL; dashboard removal uses the same saved-object id as import when dashboards were
          installed that way.
        </p>
      </EuiText>

      <EuiSpacer size="s" />
      <EuiCallOut
        title="Uninstall and reset are destructive"
        color="danger"
        iconType="alert"
        size="s"
      >
        <p>
          Uninstalling the cloud integration package can remove Fleet policies and data streams tied
          to it. ML jobs are stopped and deleted. Reinstall alone adds or restores components
          without removing them first — use reset for a clean reinstall of the same selection.
        </p>
      </EuiCallOut>

      {missingEsWarning}
      {missingKbWarning}

      <EuiSpacer size="l" />

      <InstallerRow
        label={setupBundle.fleetPackageLabel}
        badge="Kibana"
        description={`Uninstall the Elastic ${setupBundle.fleetPackage} integration package from Fleet (force=true).`}
        enabled={enableIntegration}
        onToggle={setEnableIntegration}
      />

      <EuiSpacer size="m" />

      {setupBundle.showApmToggle && (
        <>
          <InstallerRow
            label="APM Integration"
            badge="Kibana"
            description="Uninstall the APM Fleet package."
            enabled={enableApm}
            onToggle={setEnableApm}
          />
          <EuiSpacer size="m" />
        </>
      )}

      <InstallerRow
        label="Ingest Pipelines"
        badge="Elasticsearch"
        description={`DELETE custom ingest pipelines installed by this tool (${PIPELINES.length} available).`}
        enabled={enablePipelines}
        onToggle={setEnablePipelines}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>Pipeline groups:</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {pipelineGroups.map((g) => (
            <EuiFlexItem grow={false} key={g}>
              <EuiCheckbox
                id={`un-pipeline-${g}`}
                label={<EuiCode>{g}</EuiCode>}
                checked={selectedPipelineGroups.has(g)}
                onChange={() => setSelectedPipelineGroups((prev) => toggleGroup(prev, g))}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </InstallerRow>

      <EuiSpacer size="m" />

      <InstallerRow
        label="Custom Dashboards"
        badge="Kibana"
        description={`DELETE dashboard saved objects by deterministic id (matches saved-object import from Setup). ${DASHBOARDS.length} definitions.`}
        enabled={enableDashboards}
        onToggle={setEnableDashboards}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>Select dashboards:</strong> {selectedDashboardKeys.size} of {DASHBOARDS.length}{" "}
          selected.
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {dashboardKeys.map(({ key, title }) => (
            <EuiFlexItem grow={false} key={key}>
              <EuiCheckbox
                id={`un-dash-${key}`}
                label={
                  <span title={title}>
                    <EuiCode>{title}</EuiCode>
                  </span>
                }
                checked={selectedDashboardKeys.has(key)}
                onChange={() => setSelectedDashboardKeys((prev) => toggleGroup(prev, key))}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </InstallerRow>

      <EuiSpacer size="m" />

      <InstallerRow
        label="ML Anomaly Jobs"
        badge="Elasticsearch"
        description="Stop datafeeds, close jobs, then delete datafeeds and jobs."
        enabled={enableMlJobs}
        onToggle={setEnableMlJobs}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>Job groups:</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {mlJobGroups.map(({ group, description }) => (
            <EuiFlexItem grow={false} key={group}>
              <EuiCheckbox
                id={`un-ml-${group}`}
                label={
                  <span title={description}>
                    <EuiCode>{group}</EuiCode>
                  </span>
                }
                checked={selectedMlGroups.has(group)}
                onChange={() => setSelectedMlGroups((prev) => toggleGroup(prev, group))}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </InstallerRow>

      <EuiSpacer size="xl" />
      <EuiHorizontalRule margin="none" />
      <EuiSpacer size="m" />

      <EuiFlexGroup alignItems="center" gutterSize="m" wrap responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            iconType="importAction"
            onClick={() => setConfirmReinstallOpen(true)}
            isLoading={isRunning}
            isDisabled={!canRun || isRunning}
          >
            Reinstall selected…
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            color="warning"
            onClick={() => setConfirmResetOpen(true)}
            isLoading={isRunning}
            isDisabled={!canRun || isRunning}
          >
            Uninstall &amp; reinstall…
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            color="danger"
            iconType="trash"
            onClick={() => setConfirmUninstallOpen(true)}
            isLoading={isRunning}
            isDisabled={!canRun || isRunning}
          >
            Uninstall only…
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {isDone && !isRunning && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut color="success" iconType="check" size="s" title="Last run completed" />
        </>
      )}

      {log.length > 0 && (
        <>
          <EuiSpacer size="m" />
          <EuiPanel
            paddingSize="s"
            color="subdued"
            style={{ fontFamily: "monospace", fontSize: 12, maxHeight: 300, overflowY: "auto" }}
          >
            {log.map((line, i) => (
              <div
                key={i}
                style={{
                  color:
                    line.type === "ok"
                      ? "#00bfa5"
                      : line.type === "error"
                        ? "#ff4040"
                        : line.type === "warn"
                          ? "#f5a623"
                          : "inherit",
                }}
              >
                {line.text}
              </div>
            ))}
          </EuiPanel>
        </>
      )}

      {confirmReinstallOpen && (
        <EuiConfirmModal
          title="Reinstall selected components?"
          onCancel={() => setConfirmReinstallOpen(false)}
          onConfirm={runReinstall}
          cancelButtonText="Cancel"
          confirmButtonText="Reinstall"
          buttonColor="primary"
          defaultFocusedButton="confirm"
        >
          <p>
            This runs the same install steps as <strong>Setup</strong> for your selection (Fleet,
            pipelines, dashboards, ML). Existing assets may already be present; the log will note
            skips or conflicts.
          </p>
        </EuiConfirmModal>
      )}

      {confirmResetOpen && (
        <EuiConfirmModal
          title="Uninstall, then reinstall?"
          onCancel={() => setConfirmResetOpen(false)}
          onConfirm={runReset}
          cancelButtonText="Cancel"
          confirmButtonText="Uninstall & reinstall"
          buttonColor="warning"
          defaultFocusedButton="confirm"
        >
          <p>
            This first removes the selected items (same as uninstall only), then installs them
            again. Use this for a clean reinstall when something is stuck or misconfigured.
          </p>
        </EuiConfirmModal>
      )}

      {confirmUninstallOpen && (
        <EuiConfirmModal
          title="Uninstall selected components?"
          onCancel={() => setConfirmUninstallOpen(false)}
          onConfirm={runUninstall}
          cancelButtonText="Cancel"
          confirmButtonText="Uninstall"
          buttonColor="danger"
          defaultFocusedButton="confirm"
        >
          <p>This will uninstall or delete the selected items from Elasticsearch / Kibana.</p>
        </EuiConfirmModal>
      )}
    </>
  );
}
