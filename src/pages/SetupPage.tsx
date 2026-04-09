import { useState, useMemo, useEffect, type ReactNode } from "react";
import {
  EuiTitle,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButton,
  EuiCallOut,
  EuiCheckbox,
  EuiPanel,
  EuiCode,
  EuiHorizontalRule,
  EuiConfirmModal,
  EuiSwitch,
} from "@elastic/eui";

import type { CloudSetupBundle, MlJobFile, PipelineEntry } from "../setup/types";
import { dashboardDefToSavedObjectId } from "../setup/dashboardToImportNdjson";
import { stableDashboardKey } from "../setup/stableDashboardKey";
import { runSetupInstall } from "../setup/runSetupInstall";
import { proxyCall, resolveFleetPackageVersion } from "../setup/setupProxy";
import { InstallerRow } from "../components/InstallerRow";

interface SetupPageProps {
  setupBundle: CloudSetupBundle;
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  onInstallComplete: () => void;
  onUninstallComplete?: () => void;
  onReinstallComplete?: () => void;
}

type LogLine = { text: string; type: "info" | "ok" | "error" | "warn" };

export function SetupPage({
  setupBundle,
  elasticUrl,
  kibanaUrl,
  apiKey,
  onInstallComplete,
  onUninstallComplete,
  onReinstallComplete,
}: SetupPageProps) {
  const PIPELINES: PipelineEntry[] = setupBundle.pipelines;
  const ML_JOB_FILES: MlJobFile[] = setupBundle.mlJobFiles;
  const DASHBOARDS = setupBundle.dashboards;

  const [removeMode, setRemoveMode] = useState(false);

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

  useEffect(() => {
    setLog([]);
    setIsDone(false);
    setConfirmUninstallOpen(false);
    setConfirmReinstallOpen(false);
    setConfirmResetOpen(false);
  }, [removeMode]);

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

  const uid = removeMode ? "rm" : "in";

  const descIntegration: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> the Elastic {setupBundle.fleetPackage} integration package from
      Fleet (force=true).
    </>
  ) : (
    <>
      Installs the official Elastic {setupBundle.fleetPackage} integration package via Kibana Fleet
      (templates, ILM, dashboards).
    </>
  );

  const descApm: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> the APM Fleet package.
    </>
  ) : (
    <>
      Installs the Elastic APM integration via Kibana Fleet. Required to receive OpenTelemetry trace
      data from the generator.
    </>
  );

  const descPipelines: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> custom ingest pipelines installed by this tool (DELETE{" "}
      {PIPELINES.length} available).
    </>
  ) : (
    <>
      Installs custom Elasticsearch ingest pipelines aligned with this load generator.{" "}
      {PIPELINES.length} pipelines across {pipelineGroups.length} groups.
    </>
  );

  const descDashboards: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> dashboard saved objects by deterministic id (matches saved-object
      import from Setup). {DASHBOARDS.length} definitions.
    </>
  ) : (
    <>
      Installs pre-built Kibana dashboards for {setupBundle.fleetPackageLabel} monitoring (
      {DASHBOARDS.length} available). Uses the Dashboards API when available; otherwise falls back
      to saved object import (e.g. Serverless).
    </>
  );

  const descMl: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> ML jobs: stop datafeeds, close jobs, then delete datafeeds and
      jobs.
    </>
  ) : (
    <>
      Installs Elasticsearch ML anomaly detection jobs for synthetic{" "}
      {setupBundle.fleetPackage.toUpperCase()} logs.{" "}
      {ML_JOB_FILES.reduce((n, f) => n + f.jobs.length, 0)} jobs across {mlJobGroups.length} groups.
    </>
  );

  const filteredPipelines = () => PIPELINES.filter((p) => selectedPipelineGroups.has(p.group));
  const filteredDashboards = () =>
    DASHBOARDS.filter((d, i) => selectedDashboardKeys.has(stableDashboardKey(d, i)));
  const filteredMlFiles = () => ML_JOB_FILES.filter((f) => selectedMlGroups.has(f.group));

  const handleInstall = async () => {
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
      addLog("All selected installers complete.", "ok");
      setIsDone(true);
      onInstallComplete();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      setIsRunning(false);
    }
  };

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
    const toRemove = filteredPipelines();
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
    const toRemove = filteredDashboards();
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
    const files = filteredMlFiles();
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
      addLog("Uninstall finished.", "ok");
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

  const missingKbWarning = needsKb && !hasKb && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut title="Kibana URL required" color="warning" iconType="warning" size="s">
        <p>
          {removeMode
            ? "Set a Kibana URL on the Start page to uninstall, reinstall, or reset Fleet integrations or dashboards."
            : "Set a Kibana URL on the Start page to install integrations and dashboards."}
        </p>
      </EuiCallOut>
    </>
  );

  const missingEsWarning = !hasEs && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut title="Connection required" color="warning" iconType="warning" size="s">
        <p>
          {removeMode
            ? "Set the Elasticsearch URL and API key on the Start page before uninstalling or reinstalling assets."
            : "Set the Elasticsearch URL and API key on the Start page before installing."}
        </p>
      </EuiCallOut>
    </>
  );

  return (
    <>
      <EuiTitle size="s">
        <h2>Setup</h2>
      </EuiTitle>

      <EuiSpacer size="m" />
      <EuiFlexGroup alignItems="flexStart" gutterSize="l" responsive={true}>
        <EuiFlexItem grow={true} style={{ flex: "1 1 0%", minWidth: 0 }}>
          {removeMode ? (
            <EuiText size="s" color="subdued">
              <p style={{ maxWidth: "min(100%, 48rem)", marginBottom: 0 }}>
                <strong>Uninstalls</strong>, reinstalls, or resets the selected components.
                <br />
                Choose categories below, then use <strong>Reinstall</strong>,{" "}
                <strong>Uninstall &amp; reinstall</strong>, or <strong>Uninstall only</strong> at
                the bottom.
              </p>
            </EuiText>
          ) : (
            <EuiText size="s" color="subdued">
              <p style={{ maxWidth: 540, marginBottom: 0 }}>
                Install Elastic components to get the most from the load generator.
                <br />
                Toggle each component required, then click <strong>Install Selected</strong>.
              </p>
            </EuiText>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ flex: "0 0 auto", maxWidth: "100%" }}>
          <EuiPanel paddingSize="m" hasBorder style={{ width: "fit-content", maxWidth: "100%" }}>
            <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <strong>Uninstall/Reinstall mode</strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiSwitch
                  showLabel={false}
                  label="Uninstall/Reinstall mode"
                  checked={removeMode}
                  onChange={(e) => setRemoveMode(e.target.checked)}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              Turn on to remove or reinstall setup assets instead of installing them.
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {removeMode && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            title="Uninstall and reset are destructive"
            color="danger"
            iconType="alert"
            size="s"
          >
            <p>
              Uninstalling the integration package can remove Fleet policies and data streams tied
              to it. ML jobs are stopped and deleted. Reinstall alone does not remove assets first;
              use <strong>Uninstall &amp; reinstall</strong> for a clean reinstall of the same
              selection.
            </p>
          </EuiCallOut>
        </>
      )}

      {missingEsWarning}
      {missingKbWarning}

      <EuiSpacer size="l" />

      <InstallerRow
        label={setupBundle.fleetPackageLabel}
        badge="Kibana"
        description={descIntegration}
        enabled={enableIntegration}
        onToggle={setEnableIntegration}
      />

      <EuiSpacer size="m" />

      {setupBundle.showApmToggle && (
        <>
          <InstallerRow
            label="APM Integration"
            badge="Kibana"
            description={descApm}
            enabled={enableApm}
            onToggle={setEnableApm}
          />
          <EuiSpacer size="m" />
        </>
      )}

      <InstallerRow
        label="Ingest Pipelines"
        badge="Elasticsearch"
        description={descPipelines}
        enabled={enablePipelines}
        onToggle={setEnablePipelines}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>
            {removeMode
              ? "Select pipeline groups to uninstall:"
              : "Select pipeline groups to install:"}
          </strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {pipelineGroups.map((g) => (
            <EuiFlexItem grow={false} key={g}>
              <EuiCheckbox
                id={`pipeline-group-${g}-${uid}`}
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
        description={descDashboards}
        enabled={enableDashboards}
        onToggle={setEnableDashboards}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>Select dashboards{removeMode ? " to uninstall" : " to install"}:</strong>{" "}
          {selectedDashboardKeys.size} of {DASHBOARDS.length} selected.
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {dashboardKeys.map(({ key, title }) => (
            <EuiFlexItem grow={false} key={key}>
              <EuiCheckbox
                id={`dashboard-${key}-${uid}`}
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
        description={descMl}
        enabled={enableMlJobs}
        onToggle={setEnableMlJobs}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>
            {removeMode ? "Select job groups to uninstall:" : "Select job groups to install:"}
          </strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {mlJobGroups.map(({ group, description }) => (
            <EuiFlexItem grow={false} key={group}>
              <EuiCheckbox
                id={`ml-group-${group}-${uid}`}
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

      {removeMode ? (
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
      ) : (
        <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              iconType="exportAction"
              onClick={handleInstall}
              isLoading={isRunning}
              isDisabled={!canRun || isRunning}
            >
              Install Selected
            </EuiButton>
          </EuiFlexItem>
          {isDone && !isRunning && (
            <EuiFlexItem grow={false}>
              <EuiCallOut color="success" iconType="check" size="s" title="Installation complete" />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      )}

      {removeMode && isDone && !isRunning && (
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
            This runs the same install steps as normal Setup for your selection (Fleet, pipelines,
            dashboards, ML). Existing assets may already be present; the log will note skips or
            conflicts.
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
            This first removes the selected items, then installs them again. Use this for a clean
            reinstall when something is stuck or misconfigured.
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
