import { useState, useMemo } from "react";
import {
  EuiTitle,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSwitch,
  EuiText,
  EuiBadge,
  EuiButton,
  EuiCallOut,
  EuiCheckbox,
  EuiPanel,
  EuiCode,
  EuiHorizontalRule,
} from "@elastic/eui";

import type { CloudSetupBundle, DashboardDef, MlJobFile, PipelineEntry } from "../setup/types";

// ─── Proxy helper ─────────────────────────────────────────────────────────────

async function proxyCall(opts: {
  baseUrl: string;
  apiKey: string;
  path: string;
  method?: "GET" | "POST" | "PUT";
  body?: Record<string, unknown>;
}): Promise<unknown> {
  const { baseUrl, apiKey, path, method = "PUT", body } = opts;
  const res = await fetch("/proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-elastic-url": baseUrl.replace(/\/$/, ""),
      "x-elastic-key": apiKey,
      "x-elastic-path": path,
      "x-elastic-method": method,
    },
    body: body !== undefined ? JSON.stringify(body) : "{}",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // 409 from Fleet means already installed — treat as success
    if (res.status === 409) return { alreadyInstalled: true };
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json().catch(() => ({}));
}

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
  const DASHBOARDS: DashboardDef[] = setupBundle.dashboards;
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

  const mlJobGroups = useMemo(
    () => ML_JOB_FILES.map((f) => ({ group: f.group, description: f.description })),
    [ML_JOB_FILES]
  );
  const [selectedMlGroups, setSelectedMlGroups] = useState<Set<string>>(
    () => new Set(ML_JOB_FILES.map((f) => f.group))
  );

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

  // ── Install handlers ───────────────────────────────────────────────────────

  const installIntegration = async (pkgName: string) => {
    const label = pkgName === "apm" ? "APM Integration" : `${setupBundle.fleetPackageLabel}`;
    addLog(`Installing ${label}…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    // Fetch latest version from Kibana Fleet
    let version: string | null = null;
    try {
      const data = (await proxyCall({
        baseUrl: kb,
        apiKey,
        path: `/api/fleet/epm/packages/${pkgName}`,
        method: "GET",
      })) as { item?: { latestVersion?: string } };
      version = data?.item?.latestVersion ?? null;
    } catch {
      // Fall through to EPR
    }

    if (!version) {
      // Fall back to public EPR
      try {
        const epr = await fetch(`https://epr.elastic.co/search?package=${pkgName}`);
        const data = (await epr.json()) as Array<{ version?: string }>;
        version = data?.[0]?.version ?? null;
      } catch (e) {
        addLog(`  ✗ ${label}: could not resolve version — ${e}`, "error");
        return;
      }
    }

    if (!version) {
      addLog(`  ✗ ${label}: no version found`, "error");
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
    const toInstall = PIPELINES.filter((p) => selectedPipelineGroups.has(p.group));
    addLog(`Installing ${toInstall.length} ingest pipelines…`);
    let ok = 0;
    let fail = 0;
    for (const pipeline of toInstall) {
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
    addLog(`Installing ${DASHBOARDS.length} dashboards…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    let ok = 0;
    let fail = 0;
    for (const dash of DASHBOARDS) {
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
        fail++;
        addLog(`  ✗ Dashboard "${dash.title}": ${e}`, "error");
      }
    }
    addLog(
      `  ✓ Dashboards: ${ok} installed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  const installMlJobs = async () => {
    const files = ML_JOB_FILES.filter((f) => selectedMlGroups.has(f.group));
    const totalJobs = files.reduce((n, f) => n + f.jobs.length, 0);
    addLog(`Installing ${totalJobs} ML jobs across ${files.length} groups…`);
    let ok = 0;
    let fail = 0;
    for (const file of files) {
      for (const entry of file.jobs) {
        try {
          await proxyCall({
            baseUrl: elasticUrl,
            apiKey,
            path: `/_ml/anomaly_detectors/${encodeURIComponent(entry.id)}`,
            method: "PUT",
            body: entry.job,
          });
          await proxyCall({
            baseUrl: elasticUrl,
            apiKey,
            path: `/_ml/datafeeds/datafeed-${encodeURIComponent(entry.id)}`,
            method: "PUT",
            body: entry.datafeed,
          });
          ok++;
        } catch (e) {
          fail++;
          addLog(`  ✗ ML job ${entry.id}: ${e}`, "error");
        }
      }
    }
    addLog(
      `  ✓ ML jobs: ${ok} installed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    setIsDone(false);
    setLog([]);
    try {
      if (enableIntegration) await installIntegration(setupBundle.fleetPackage);
      if (enableApm) await installIntegration("apm");
      if (enablePipelines) await installPipelines();
      if (enableDashboards) await installDashboards();
      if (enableMlJobs) await installMlJobs();
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
        description={`Installs ${DASHBOARDS.length} pre-built Kibana dashboards for ${setupBundle.fleetPackageLabel} monitoring. Requires Kibana 9.4+ (Dashboards API).`}
        enabled={enableDashboards}
        onToggle={setEnableDashboards}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          All {DASHBOARDS.length} dashboards will be installed. Requires Kibana 9.4+.
        </EuiText>
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

// ─── InstallerRow sub-component ───────────────────────────────────────────────

interface InstallerRowProps {
  label: string;
  badge: "Kibana" | "Elasticsearch";
  description: string;
  enabled: boolean;
  onToggle: (val: boolean) => void;
  children?: React.ReactNode;
}

function InstallerRow({
  label,
  badge,
  description,
  enabled,
  onToggle,
  children,
}: InstallerRowProps) {
  return (
    <EuiPanel paddingSize="m" hasBorder>
      <EuiFlexGroup alignItems="flexStart" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false} style={{ paddingTop: 2 }}>
          <EuiSwitch
            label=""
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            showLabel={false}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="s">
                <strong>{label}</strong>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={badge === "Kibana" ? "primary" : "hollow"}>{badge}</EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            <p>{description}</p>
          </EuiText>
          {enabled && children}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
