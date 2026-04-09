import { useState, useMemo, useEffect } from "react";
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
} from "@elastic/eui";

import type { CloudSetupBundle, MlJobFile, PipelineEntry } from "../setup/types";
import { stableDashboardKey } from "../setup/stableDashboardKey";
import { runSetupInstall } from "../setup/runSetupInstall";
import { InstallerRow } from "../components/InstallerRow";

// ─── Props ────────────────────────────────────────────────────────────────────

interface SetupPageProps {
  setupBundle: CloudSetupBundle;
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  onInstallComplete: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

type LogLine = { text: string; type: "info" | "ok" | "error" | "warn" };

export function SetupPage({
  setupBundle,
  elasticUrl,
  kibanaUrl,
  apiKey,
  onInstallComplete,
}: SetupPageProps) {
  const PIPELINES: PipelineEntry[] = setupBundle.pipelines;
  const ML_JOB_FILES: MlJobFile[] = setupBundle.mlJobFiles;
  const DASHBOARDS = setupBundle.dashboards;
  // ── Top-level toggles ──────────────────────────────────────────────────────
  const [enableIntegration, setEnableIntegration] = useState(false);
  const [enableApm, setEnableApm] = useState(false);
  const [enablePipelines, setEnablePipelines] = useState(false);
  const [enableDashboards, setEnableDashboards] = useState(false);
  const [enableMlJobs, setEnableMlJobs] = useState(false);

  // ── Sub-selections ─────────────────────────────────────────────────────────
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

  // Resync sub-selections when the cloud bundle or list sizes change (avoids empty checks after stale first paint).
  useEffect(() => {
    setSelectedDashboardKeys(new Set(dashboardKeys.map((x) => x.key)));
  }, [setupBundle.fleetPackage, DASHBOARDS.length, dashboardKeys]);

  useEffect(() => {
    setSelectedMlGroups(new Set(ML_JOB_FILES.map((f) => f.group)));
  }, [setupBundle.fleetPackage, ML_JOB_FILES.length, ML_JOB_FILES]);

  // ── Install state ──────────────────────────────────────────────────────────
  const [isInstalling, setIsInstalling] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);

  const addLog = (text: string, type: LogLine["type"] = "info") =>
    setLog((prev) => [...prev, { text, type }]);

  // ── Validation ─────────────────────────────────────────────────────────────
  const hasEs = !!elasticUrl.trim() && !!apiKey.trim();
  const hasKb = !!kibanaUrl.trim() && !!apiKey.trim();
  const needsKb = enableIntegration || enableApm || enableDashboards;
  const anyEnabled =
    enableIntegration || enableApm || enablePipelines || enableDashboards || enableMlJobs;
  const canInstall = anyEnabled && hasEs && (!needsKb || hasKb);

  const handleInstall = async () => {
    setIsInstalling(true);
    setIsDone(false);
    setLog([]);
    try {
      const pipelinesToInstall = PIPELINES.filter((p) => selectedPipelineGroups.has(p.group));
      const dashboardsToInstall = DASHBOARDS.filter((d, i) =>
        selectedDashboardKeys.has(stableDashboardKey(d, i))
      );
      const mlFilesToInstall = ML_JOB_FILES.filter((f) => selectedMlGroups.has(f.group));
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
        pipelines: pipelinesToInstall,
        dashboards: dashboardsToInstall,
        mlJobFiles: mlFilesToInstall,
        addLog,
      });
      addLog("All selected installers complete.", "ok");
      setIsDone(true);
      onInstallComplete();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      setIsInstalling(false);
    }
  };

  // ── Toggle helpers ─────────────────────────────────────────────────────────

  function toggleGroup<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const missingKbWarning = needsKb && !hasKb && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut title="Kibana URL required" color="warning" iconType="warning" size="s">
        <p>Set a Kibana URL on the Start page to install integrations and dashboards.</p>
      </EuiCallOut>
    </>
  );

  const missingEsWarning = !hasEs && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut title="Connection required" color="warning" iconType="warning" size="s">
        <p>Set the Elasticsearch URL and API key on the Start page before installing.</p>
      </EuiCallOut>
    </>
  );

  return (
    <>
      <EuiTitle size="s">
        <h2>Setup</h2>
      </EuiTitle>
      <EuiText size="s" color="subdued">
        <p>
          Install Elastic components to get the most from the load generator. Toggle each component
          on to select what to install, then click <strong>Install Selected</strong>.
        </p>
      </EuiText>

      {missingEsWarning}
      {missingKbWarning}

      <EuiSpacer size="l" />

      <InstallerRow
        label={setupBundle.fleetPackageLabel}
        badge="Kibana"
        description={`Installs the official Elastic ${setupBundle.fleetPackage} integration package via Kibana Fleet (templates, ILM, dashboards).`}
        enabled={enableIntegration}
        onToggle={setEnableIntegration}
      />

      <EuiSpacer size="m" />

      {setupBundle.showApmToggle && (
        <>
          <InstallerRow
            label="APM Integration"
            badge="Kibana"
            description="Installs the Elastic APM integration via Kibana Fleet. Required to receive OpenTelemetry trace data from the generator."
            enabled={enableApm}
            onToggle={setEnableApm}
          />
          <EuiSpacer size="m" />
        </>
      )}

      <InstallerRow
        label="Ingest Pipelines"
        badge="Elasticsearch"
        description={`Installs custom Elasticsearch ingest pipelines aligned with this load generator. ${PIPELINES.length} pipelines across ${pipelineGroups.length} groups.`}
        enabled={enablePipelines}
        onToggle={setEnablePipelines}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>Select pipeline groups to install:</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {pipelineGroups.map((g) => (
            <EuiFlexItem grow={false} key={g}>
              <EuiCheckbox
                id={`pipeline-group-${g}`}
                label={<EuiCode>{g}</EuiCode>}
                checked={selectedPipelineGroups.has(g)}
                onChange={() => setSelectedPipelineGroups((prev) => toggleGroup(prev, g))}
              />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </InstallerRow>

      <EuiSpacer size="m" />

      {/* ── Custom Dashboards ───────────────────────────────────────────── */}
      <InstallerRow
        label="Custom Dashboards"
        badge="Kibana"
        description={`Installs pre-built Kibana dashboards for ${setupBundle.fleetPackageLabel} monitoring (${DASHBOARDS.length} available). Uses the Dashboards API when available; otherwise falls back to saved object import (e.g. Serverless).`}
        enabled={enableDashboards}
        onToggle={setEnableDashboards}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>Select dashboards to install:</strong> {selectedDashboardKeys.size} of{" "}
          {DASHBOARDS.length} selected.
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {dashboardKeys.map(({ key, title }) => (
            <EuiFlexItem grow={false} key={key}>
              <EuiCheckbox
                id={`dashboard-${key}`}
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

      {/* ── ML Anomaly Jobs ─────────────────────────────────────────────── */}
      <InstallerRow
        label="ML Anomaly Jobs"
        badge="Elasticsearch"
        description={`Installs Elasticsearch ML anomaly detection jobs for synthetic ${setupBundle.fleetPackage.toUpperCase()} logs. ${ML_JOB_FILES.reduce((n, f) => n + f.jobs.length, 0)} jobs across ${mlJobGroups.length} groups.`}
        enabled={enableMlJobs}
        onToggle={setEnableMlJobs}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>Select job groups to install:</strong>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          {mlJobGroups.map(({ group, description }) => (
            <EuiFlexItem grow={false} key={group}>
              <EuiCheckbox
                id={`ml-group-${group}`}
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

      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            iconType="exportAction"
            onClick={handleInstall}
            isLoading={isInstalling}
            isDisabled={!canInstall || isInstalling}
          >
            Install Selected
          </EuiButton>
        </EuiFlexItem>
        {isDone && !isInstalling && (
          <EuiFlexItem grow={false}>
            <EuiCallOut color="success" iconType="check" size="s" title="Installation complete" />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {/* ── Install log ─────────────────────────────────────────────────── */}
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
    </>
  );
}
