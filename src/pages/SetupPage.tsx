import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  EuiTitle,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCheckbox,
  EuiPanel,
  EuiCode,
  EuiHorizontalRule,
  EuiConfirmModal,
  EuiSwitch,
  EuiFieldSearch,
  EuiBadge,
} from "@elastic/eui";

import type { CloudId } from "../cloud/types";
import type { ServiceGroup } from "../data/serviceGroups";
import type { CloudSetupBundle, MlJobFile, PipelineEntry } from "../setup/types";
import { dashboardDefToSavedObjectId } from "../setup/dashboardToImportNdjson";
import { stableDashboardKey } from "../setup/stableDashboardKey";
import { runSetupInstall } from "../setup/runSetupInstall";
import {
  proxyCall,
  resolveFleetPackageVersion,
  deleteKibanaDashboard,
  SAVED_OBJECT_DELETE_UNSUPPORTED_HINT,
} from "../setup/setupProxy";
import { InstallerRow } from "../components/InstallerRow";
import {
  loadSetupLog,
  saveSetupLog,
  clearSetupLog,
  MAX_SETUP_LOG_ENTRIES,
} from "../utils/sessionActivityLog";
import {
  pipelineMatchesQuery,
  pipelineMatchesSelectedServices,
  dashboardMatchesQuery,
  dashboardMatchesSelectedServices,
  dashboardTitleServiceFragment,
  mlJobFileMatchesQuery,
  mlJobFileMatchesSelectedServices,
  mlJobEntryMatchesQuery,
} from "../setup/setupAssetMatch";
import {
  groupMlJobRefsByServiceType,
  inferDashboardServiceGroupLabel,
  sortDashboardServiceGroupLabels,
  type MlJobRef,
} from "../setup/dashboardServiceGroup";
import {
  polishDashboardFragmentForGrouping,
  polishSetupCategoryLabel,
  polishSetupDashboardTitle,
} from "../setup/setupDisplayPolish";

interface SetupPageProps {
  setupBundle: CloudSetupBundle;
  /** Resets asset lists when switching vendor (AWS / GCP / Azure). */
  cloudId: CloudId;
  /** Services (or trace services) chosen on the Services step — drives “Align with Services”. */
  selectedShipServiceIds: string[];
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  onInstallComplete: () => void;
  onUninstallComplete?: () => void;
  onReinstallComplete?: () => void;
  /** sessionStorage key — survives refresh; omit to disable persistence (tests). */
  setupLogPersistenceKey?: string;
  /**
   * Same groups as the Services step — dashboard lists are grouped under these labels.
   * When empty, grouping falls back to polished dashboard title fragments.
   */
  serviceGroups?: ServiceGroup[];
}

type LogLine = { text: string; type: "info" | "ok" | "error" | "warn"; at?: string };

/**
 * Simple expand/collapse for setup asset groups. EuiAccordion uses height animation +
 * ResizeObserver; with blockSize:0 while closed the observer can stay at 0 so opening
 * shows no content — this pattern matches ServiceGrid (collapsed === true hides body).
 *
 * **`expandedSections.has(k)`** means the user opened that group. Default = all collapsed (empty Set).
 */
function SetupCollapsible({
  sectionKey,
  expandedSections,
  setExpandedSections,
  header,
  children,
}: {
  sectionKey: string;
  expandedSections: Set<string>;
  setExpandedSections: Dispatch<SetStateAction<Set<string>>>;
  header: ReactNode;
  children: ReactNode;
}) {
  const expanded = expandedSections.has(sectionKey);
  return (
    <div style={{ marginBottom: 8 }}>
      <button
        type="button"
        onClick={() =>
          setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionKey)) next.delete(sectionKey);
            else next.add(sectionKey);
            return next;
          })
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          border: "1px solid var(--euiColorLightShade, #d3dae6)",
          borderRadius: 6,
          padding: "8px 12px",
          background: "var(--euiColorEmptyShade, #fff)",
          font: "inherit",
        }}
      >
        <span style={{ fontSize: 10, color: "var(--euiColorSubdued, #69707d)", flexShrink: 0 }}>
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>{header}</span>
      </button>
      {expanded && (
        <div
          style={{
            padding: "8px 4px 0 4px",
            borderLeft: "2px solid var(--euiColorLightShade, #d3dae6)",
            marginLeft: 10,
            marginTop: 4,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function SetupPage({
  setupBundle,
  cloudId,
  selectedShipServiceIds,
  elasticUrl,
  kibanaUrl,
  apiKey,
  onInstallComplete,
  onUninstallComplete,
  onReinstallComplete,
  setupLogPersistenceKey,
  serviceGroups = [],
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
  /** Pipeline / dashboard / ML group section keys the user has expanded (default: none). */
  const [expandedSetupSections, setExpandedSetupSections] = useState<Set<string>>(() => new Set());

  const pipelineGroups = useMemo(
    () => [...new Set(PIPELINES.map((p) => p.group))].sort(),
    [PIPELINES]
  );
  const [selectedPipelineIds, setSelectedPipelineIds] = useState<Set<string>>(
    () => new Set(PIPELINES.map((p) => p.id))
  );
  const [assetFilterQuery, setAssetFilterQuery] = useState("");

  const [selectedDashboardKeys, setSelectedDashboardKeys] = useState<Set<string>>(
    () => new Set(setupBundle.dashboards.map((d, i) => stableDashboardKey(d, i)))
  );

  const [selectedMlJobIds, setSelectedMlJobIds] = useState<Set<string>>(
    () => new Set(ML_JOB_FILES.flatMap((f) => f.jobs.map((j) => j.id)))
  );

  useEffect(() => {
    setSelectedPipelineIds(new Set(setupBundle.pipelines.map((p) => p.id)));
    setSelectedDashboardKeys(
      new Set(setupBundle.dashboards.map((d, i) => stableDashboardKey(d, i)))
    );
    setSelectedMlJobIds(new Set(setupBundle.mlJobFiles.flatMap((f) => f.jobs.map((j) => j.id))));
    setAssetFilterQuery("");
    setExpandedSetupSections(new Set());
  }, [cloudId, setupBundle.fleetPackage]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only on vendor switch

  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const initialSetupSnap = setupLogPersistenceKey ? loadSetupLog(setupLogPersistenceKey) : null;
  const [log, setLog] = useState<LogLine[]>(
    () => initialSetupSnap?.entries.map((e) => ({ text: e.text, type: e.type, at: e.at })) ?? []
  );
  const [showInterruptedBanner, setShowInterruptedBanner] = useState(
    () => !!(initialSetupSnap?.installRunActive && (initialSetupSnap.entries?.length ?? 0) > 0)
  );
  const [confirmUninstallOpen, setConfirmUninstallOpen] = useState(false);
  const [confirmReinstallOpen, setConfirmReinstallOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const installRunActiveRef = useRef(false);
  const logRef = useRef<LogLine[]>(log);
  logRef.current = log;

  useEffect(() => {
    if (!setupLogPersistenceKey) return;
    const s = loadSetupLog(setupLogPersistenceKey);
    if (s?.installRunActive) {
      saveSetupLog(setupLogPersistenceKey, { ...s, installRunActive: false });
    }
  }, [setupLogPersistenceKey]);

  useEffect(() => {
    setLog([]);
    setIsDone(false);
    setConfirmUninstallOpen(false);
    setConfirmReinstallOpen(false);
    setConfirmResetOpen(false);
    if (setupLogPersistenceKey) clearSetupLog(setupLogPersistenceKey);
  }, [removeMode, setupLogPersistenceKey]);

  const flushSetupSnapshot = useCallback(() => {
    if (!setupLogPersistenceKey) return;
    const entries = logRef.current.map((e) => ({
      text: e.text,
      type: e.type,
      at: e.at ?? new Date().toISOString(),
    }));
    saveSetupLog(setupLogPersistenceKey, {
      v: 1,
      installRunActive: installRunActiveRef.current,
      entries,
    });
  }, [setupLogPersistenceKey]);

  const addLog = useCallback(
    (text: string, type: LogLine["type"] = "info") => {
      const at = new Date().toISOString();
      setLog((prev) => {
        const next = [...prev, { text, type, at }].slice(-MAX_SETUP_LOG_ENTRIES);
        logRef.current = next;
        if (setupLogPersistenceKey) {
          saveSetupLog(setupLogPersistenceKey, {
            v: 1,
            installRunActive: installRunActiveRef.current,
            entries: next.map((e) => ({
              text: e.text,
              type: e.type,
              at: e.at ?? at,
            })),
          });
        }
        return next;
      });
    },
    [setupLogPersistenceKey]
  );

  const clearSetupActivityLog = () => {
    setLog([]);
    logRef.current = [];
    setShowInterruptedBanner(false);
    if (setupLogPersistenceKey) clearSetupLog(setupLogPersistenceKey);
  };

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
      {PIPELINES.length} pipelines in {pipelineGroups.length} groups — pick individual pipelines,
      filter the list, or <strong>Align with Services</strong> to match the Services step.
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
      {DASHBOARDS.length} available). Filter or align to your Services selection; uses the
      Dashboards API when available, otherwise saved object import (e.g. Serverless).
    </>
  );

  const totalMlJobsAll = ML_JOB_FILES.reduce((n, f) => n + f.jobs.length, 0);
  const descMl: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> ML jobs: stop datafeeds, close jobs, then delete datafeeds and
      jobs.
    </>
  ) : (
    <>
      Installs Elasticsearch ML anomaly detection jobs for synthetic{" "}
      {setupBundle.fleetPackage.toUpperCase()} logs. Pick individual jobs, filter the list, or use{" "}
      <strong>Align with Services step</strong>. {totalMlJobsAll} jobs in {ML_JOB_FILES.length}{" "}
      files.
    </>
  );

  const filteredPipelines = () => PIPELINES.filter((p) => selectedPipelineIds.has(p.id));

  const visiblePipelineIds = useMemo(
    () => PIPELINES.filter((p) => pipelineMatchesQuery(p, assetFilterQuery)).map((p) => p.id),
    [PIPELINES, assetFilterQuery]
  );

  const visibleDashboardIndices = useMemo(
    () =>
      DASHBOARDS.map((_, i) => i).filter((i) =>
        dashboardMatchesQuery(DASHBOARDS[i], i, assetFilterQuery)
      ),
    [DASHBOARDS, assetFilterQuery]
  );

  const dashboardIndexToGroup = useMemo(() => {
    const m = new Map<number, string>();
    for (const i of visibleDashboardIndices) {
      if (serviceGroups.length > 0) {
        m.set(i, inferDashboardServiceGroupLabel(DASHBOARDS[i], cloudId, serviceGroups));
      } else {
        const frag = dashboardTitleServiceFragment(DASHBOARDS[i], cloudId);
        const trimmed = frag?.trim() ?? "";
        m.set(i, trimmed ? polishDashboardFragmentForGrouping(trimmed, cloudId) : "Other");
      }
    }
    return m;
  }, [visibleDashboardIndices, DASHBOARDS, cloudId, serviceGroups]);

  const dashboardGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const i of visibleDashboardIndices) {
      keys.add(dashboardIndexToGroup.get(i) ?? "Uncategorized");
    }
    return sortDashboardServiceGroupLabels([...keys], serviceGroups);
  }, [visibleDashboardIndices, dashboardIndexToGroup, serviceGroups]);

  const dashboardIndicesInGroup = useCallback(
    (groupKey: string) =>
      visibleDashboardIndices
        .filter((i) => (dashboardIndexToGroup.get(i) ?? "Uncategorized") === groupKey)
        .sort((ia, ib) => (DASHBOARDS[ia].title ?? "").localeCompare(DASHBOARDS[ib].title ?? "")),
    [visibleDashboardIndices, dashboardIndexToGroup, DASHBOARDS]
  );

  const visibleMlFiles = useMemo(
    () => ML_JOB_FILES.filter((f) => mlJobFileMatchesQuery(f, assetFilterQuery)),
    [ML_JOB_FILES, assetFilterQuery]
  );

  const visibleMlJobRefs = useMemo((): MlJobRef[] => {
    const out: MlJobRef[] = [];
    for (const f of visibleMlFiles) {
      for (const j of f.jobs) {
        if (mlJobEntryMatchesQuery(j, assetFilterQuery)) {
          out.push({ file: f, job: j });
        }
      }
    }
    return out;
  }, [visibleMlFiles, assetFilterQuery]);

  const useAwsMlUnifiedByServiceType = cloudId === "aws" && serviceGroups.length > 0;

  const mlJobSectionsByServiceType = useMemo(() => {
    if (!useAwsMlUnifiedByServiceType) return null;
    return groupMlJobRefsByServiceType(visibleMlJobRefs, cloudId, serviceGroups);
  }, [useAwsMlUnifiedByServiceType, visibleMlJobRefs, cloudId, serviceGroups]);

  const alignSelectionsToShipServices = useCallback(() => {
    const sel = new Set(selectedShipServiceIds.map((s) => s.trim()).filter(Boolean));
    if (sel.size === 0) {
      addLog(
        "Choose at least one service on the Services step before using Align with Services.",
        "warn"
      );
      return;
    }
    const pIds = new Set(
      PIPELINES.filter((p) => pipelineMatchesSelectedServices(p, sel)).map((p) => p.id)
    );
    const dKeys = new Set<string>();
    DASHBOARDS.forEach((d, i) => {
      if (dashboardMatchesSelectedServices(d, cloudId, sel)) dKeys.add(stableDashboardKey(d, i));
    });
    const mlIds = new Set<string>();
    for (const f of ML_JOB_FILES) {
      if (!mlJobFileMatchesSelectedServices(f, sel)) continue;
      for (const j of f.jobs) mlIds.add(j.id);
    }
    if (pIds.size === 0 && dKeys.size === 0 && mlIds.size === 0) {
      addLog(
        "No pipelines, dashboards, or ML jobs matched the current Services selection — adjust Services or pick assets manually.",
        "warn"
      );
      return;
    }
    setSelectedPipelineIds(pIds);
    setSelectedDashboardKeys(dKeys);
    setSelectedMlJobIds(mlIds);
    addLog(
      `Aligned setup to Services: ${pIds.size} pipeline(s), ${dKeys.size} dashboard(s), ${mlIds.size} ML job(s).`,
      "ok"
    );
  }, [PIPELINES, DASHBOARDS, ML_JOB_FILES, selectedShipServiceIds, cloudId, addLog]);

  const selectAllVisiblePipelines = () => {
    setSelectedPipelineIds((prev) => new Set([...prev, ...visiblePipelineIds]));
  };

  const clearVisiblePipelines = () => {
    const vis = new Set(visiblePipelineIds);
    setSelectedPipelineIds((prev) => new Set([...prev].filter((id) => !vis.has(id))));
  };

  const selectAllVisibleDashboards = () => {
    setSelectedDashboardKeys((prev) => {
      const next = new Set(prev);
      for (const i of visibleDashboardIndices) {
        next.add(stableDashboardKey(DASHBOARDS[i], i));
      }
      return next;
    });
  };

  const clearVisibleDashboards = () => {
    const vis = new Set(visibleDashboardIndices.map((i) => stableDashboardKey(DASHBOARDS[i], i)));
    setSelectedDashboardKeys((prev) => new Set([...prev].filter((k) => !vis.has(k))));
  };

  const selectAllVisibleMlJobs = () => {
    setSelectedMlJobIds((prev) => {
      const next = new Set(prev);
      for (const f of visibleMlFiles) {
        for (const j of f.jobs) {
          if (mlJobEntryMatchesQuery(j, assetFilterQuery)) next.add(j.id);
        }
      }
      return next;
    });
  };

  const clearVisibleMlJobs = () => {
    const vis = new Set<string>();
    for (const f of visibleMlFiles) {
      for (const j of f.jobs) {
        if (mlJobEntryMatchesQuery(j, assetFilterQuery)) vis.add(j.id);
      }
    }
    setSelectedMlJobIds((prev) => new Set([...prev].filter((id) => !vis.has(id))));
  };

  const setAllInPipelineGroup = (group: string, checked: boolean) => {
    const ids = PIPELINES.filter(
      (p) => p.group === group && pipelineMatchesQuery(p, assetFilterQuery)
    ).map((p) => p.id);
    setSelectedPipelineIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };
  const filteredDashboards = () =>
    DASHBOARDS.filter((d, i) => selectedDashboardKeys.has(stableDashboardKey(d, i)));
  const filteredMlJobPayload = (): MlJobFile[] =>
    ML_JOB_FILES.map((f) => ({
      ...f,
      jobs: f.jobs.filter((j) => selectedMlJobIds.has(j.id)),
    })).filter((f) => f.jobs.length > 0);

  const setAllInDashboardGroup = (groupKey: string, checked: boolean) => {
    const idxs = dashboardIndicesInGroup(groupKey);
    setSelectedDashboardKeys((prev) => {
      const next = new Set(prev);
      for (const i of idxs) {
        const k = stableDashboardKey(DASHBOARDS[i], i);
        if (checked) next.add(k);
        else next.delete(k);
      }
      return next;
    });
  };

  const setAllJobsInMlFile = (file: MlJobFile, checked: boolean) => {
    const ids = file.jobs
      .filter((j) => mlJobEntryMatchesQuery(j, assetFilterQuery))
      .map((j) => j.id);
    setSelectedMlJobIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const setAllJobsInMlServiceGroup = useCallback(
    (groupLabel: string, checked: boolean) => {
      if (!mlJobSectionsByServiceType) return;
      const section = mlJobSectionsByServiceType.find((s) => s.label === groupLabel);
      if (!section) return;
      setSelectedMlJobIds((prev) => {
        const next = new Set(prev);
        for (const { job } of section.refs) {
          if (checked) next.add(job.id);
          else next.delete(job.id);
        }
        return next;
      });
    },
    [mlJobSectionsByServiceType]
  );

  const expandableSetupSectionKeys = useMemo(() => {
    const keys: string[] = [];
    for (const g of pipelineGroups) {
      const inGroup = PIPELINES.filter(
        (p) => p.group === g && pipelineMatchesQuery(p, assetFilterQuery)
      );
      if (inGroup.length > 0) keys.push(`pipe:${g}:${uid}`);
    }
    for (const gk of dashboardGroupKeys) {
      if (dashboardIndicesInGroup(gk).length > 0) keys.push(`dash:${gk}:${uid}`);
    }
    if (useAwsMlUnifiedByServiceType && mlJobSectionsByServiceType) {
      for (const section of mlJobSectionsByServiceType) {
        keys.push(`ml:srv:${section.label}:${uid}`);
      }
    } else {
      for (const file of visibleMlFiles) {
        const visibleJobs = file.jobs.filter((j) => mlJobEntryMatchesQuery(j, assetFilterQuery));
        if (visibleJobs.length > 0) keys.push(`ml:${file.group}:${uid}`);
      }
    }
    return keys;
  }, [
    pipelineGroups,
    PIPELINES,
    assetFilterQuery,
    uid,
    dashboardGroupKeys,
    dashboardIndicesInGroup,
    useAwsMlUnifiedByServiceType,
    mlJobSectionsByServiceType,
    visibleMlFiles,
  ]);

  const expandAllSetupAssetGroups = useCallback(() => {
    setExpandedSetupSections(new Set(expandableSetupSectionKeys));
  }, [expandableSetupSectionKeys]);

  const handleInstall = async () => {
    setIsRunning(true);
    setIsDone(false);
    installRunActiveRef.current = true;
    addLog(`── Install run started ${new Date().toLocaleString()} ──`, "info");
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
        mlJobFiles: filteredMlJobPayload(),
        addLog,
      });
      addLog("All selected installers complete.", "ok");
      setIsDone(true);
      onInstallComplete();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      installRunActiveRef.current = false;
      queueMicrotask(() => {
        if (setupLogPersistenceKey) {
          saveSetupLog(setupLogPersistenceKey, {
            v: 1,
            installRunActive: false,
            entries: logRef.current.map((e) => ({
              text: e.text,
              type: e.type,
              at: e.at ?? new Date().toISOString(),
            })),
          });
        }
      });
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
    let stoppedForApiDisabled = false;
    const kb = kibanaUrl.replace(/\/$/, "");
    for (let idx = 0; idx < toRemove.length; idx++) {
      const dash = toRemove[idx];
      try {
        const dashId = await dashboardDefToSavedObjectId(dash);
        const outcome = await deleteKibanaDashboard(kb, apiKey, dashId);
        if (outcome.result === "not_found") {
          addLog(
            `  – Dashboard "${dash.title}" — not found (may use a different id if created via Dashboards API only)`,
            "warn"
          );
          ok++;
        } else if (outcome.result === "deleted") {
          addLog(`  ✓ Dashboard "${dash.title}"`, "ok");
          ok++;
        } else if (outcome.result === "api_disabled") {
          stoppedForApiDisabled = true;
          addLog(
            `  ! Saved Object delete APIs are disabled on this Kibana (first hit: "${dash.title}").`,
            "warn"
          );
          const remaining = toRemove.length - idx - 1;
          if (remaining > 0) {
            addLog(
              `  – Skipped ${remaining} other dashboard(s); same limitation applies to all.`,
              "warn"
            );
          }
          break;
        } else if (outcome.result === "error") {
          fail++;
          addLog(`  ✗ Dashboard "${dash.title}": ${outcome.message}`, "error");
        }
      } catch (e) {
        fail++;
        addLog(`  ✗ Dashboard "${dash.title}": ${e}`, "error");
      }
    }
    if (stoppedForApiDisabled) {
      addLog(
        `  – Dashboards: ${toRemove.length - ok} not removed via API. ${SAVED_OBJECT_DELETE_UNSUPPORTED_HINT}`,
        "warn"
      );
    } else {
      addLog(
        `  ✓ Dashboards: ${ok} processed${fail > 0 ? `, ${fail} failed` : ""}`,
        fail > 0 ? "warn" : "ok"
      );
    }
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
    const files = filteredMlJobPayload();
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
    installRunActiveRef.current = false;
    setLog([]);
    logRef.current = [];
    if (setupLogPersistenceKey) {
      saveSetupLog(setupLogPersistenceKey, { v: 1, installRunActive: false, entries: [] });
    }
    try {
      await performUninstallSteps();
      addLog("Uninstall finished.", "ok");
      setIsDone(true);
      onUninstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      queueMicrotask(flushSetupSnapshot);
      setIsRunning(false);
    }
  };

  const runReinstall = async () => {
    setConfirmReinstallOpen(false);
    setIsRunning(true);
    setIsDone(false);
    installRunActiveRef.current = true;
    setLog([]);
    logRef.current = [];
    if (setupLogPersistenceKey) {
      saveSetupLog(setupLogPersistenceKey, { v: 1, installRunActive: true, entries: [] });
    }
    try {
      addLog(`── Reinstall run started ${new Date().toLocaleString()} ──`, "info");
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
        mlJobFiles: filteredMlJobPayload(),
        addLog,
      });
      addLog("Reinstall finished.", "ok");
      setIsDone(true);
      onReinstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      installRunActiveRef.current = false;
      queueMicrotask(() => {
        if (setupLogPersistenceKey) {
          saveSetupLog(setupLogPersistenceKey, {
            v: 1,
            installRunActive: false,
            entries: logRef.current.map((e) => ({
              text: e.text,
              type: e.type,
              at: e.at ?? new Date().toISOString(),
            })),
          });
        }
      });
      setIsRunning(false);
    }
  };

  const runReset = async () => {
    setConfirmResetOpen(false);
    setIsRunning(true);
    setIsDone(false);
    installRunActiveRef.current = true;
    setLog([]);
    logRef.current = [];
    if (setupLogPersistenceKey) {
      saveSetupLog(setupLogPersistenceKey, { v: 1, installRunActive: true, entries: [] });
    }
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
        mlJobFiles: filteredMlJobPayload(),
        addLog,
      });
      addLog("Uninstall and reinstall finished.", "ok");
      setIsDone(true);
      onReinstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      installRunActiveRef.current = false;
      queueMicrotask(() => {
        if (setupLogPersistenceKey) {
          saveSetupLog(setupLogPersistenceKey, {
            v: 1,
            installRunActive: false,
            entries: logRef.current.map((e) => ({
              text: e.text,
              type: e.type,
              at: e.at ?? new Date().toISOString(),
            })),
          });
        }
      });
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

      {showInterruptedBanner && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            title="Setup may have been interrupted"
            color="warning"
            iconType="alert"
            size="s"
            onDismiss={() => setShowInterruptedBanner(false)}
          >
            <p>
              This tab was closed or reloaded while an install was in progress. The log below shows
              everything recorded up to that point. Work may still be running on the cluster—confirm
              in Kibana or Elasticsearch.
            </p>
          </EuiCallOut>
        </>
      )}

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

      <EuiPanel paddingSize="s" hasBorder>
        <EuiFieldSearch
          placeholder="Filter pipelines, dashboards, ML jobs…"
          value={assetFilterQuery}
          onChange={(e) => setAssetFilterQuery(e.target.value)}
          isClearable
          fullWidth
        />
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="s" alignItems="center" wrap responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="s"
              iconType="aggregate"
              onClick={alignSelectionsToShipServices}
              disabled={selectedShipServiceIds.length === 0}
            >
              Align with Services step
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {selectedShipServiceIds.length} service(s) on Services page
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="s" onClick={expandAllSetupAssetGroups}>
              Expand all pipeline / dashboard / ML groups
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPanel>
      <EuiSpacer size="m" />

      <InstallerRow
        label="Ingest Pipelines"
        badge="Elasticsearch"
        description={descPipelines}
        enabled={enablePipelines}
        onToggle={(v) => {
          setEnablePipelines(v);
          if (v) setExpandedSetupSections(new Set());
        }}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>
            {removeMode ? "Select pipelines to uninstall:" : "Select pipelines to install:"}
          </strong>{" "}
          {selectedPipelineIds.size} of {PIPELINES.length} selected
          {assetFilterQuery.trim() ? <> ({visiblePipelineIds.length} visible)</> : null}.
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              onClick={selectAllVisiblePipelines}
              disabled={!enablePipelines}
            >
              Select visible
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={clearVisiblePipelines} disabled={!enablePipelines}>
              Clear visible
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="s" />
        {pipelineGroups.map((g) => {
          const inGroup = PIPELINES.filter(
            (p) => p.group === g && pipelineMatchesQuery(p, assetFilterQuery)
          );
          if (inGroup.length === 0) return null;
          const nSel = inGroup.filter((p) => selectedPipelineIds.has(p.id)).length;
          return (
            <SetupCollapsible
              key={g}
              sectionKey={`pipe:${g}:${uid}`}
              expandedSections={expandedSetupSections}
              setExpandedSections={setExpandedSetupSections}
              header={
                <EuiText size="s">
                  <strong>{polishSetupCategoryLabel(g)}</strong>{" "}
                  <EuiBadge color="hollow">
                    {nSel}/{inGroup.length}
                  </EuiBadge>
                </EuiText>
              }
            >
              <EuiFlexGroup gutterSize="s" wrap responsive={false} alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => setAllInPipelineGroup(g, true)}
                    disabled={!enablePipelines}
                  >
                    All in group
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => setAllInPipelineGroup(g, false)}
                    disabled={!enablePipelines}
                  >
                    None in group
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                {inGroup.map((p) => (
                  <EuiFlexItem grow={false} key={p.id} style={{ minWidth: 280, maxWidth: 420 }}>
                    <EuiCheckbox
                      id={`pipeline-${p.id}-${uid}`}
                      label={
                        <span title={p.description}>
                          <EuiCode>{p.id}</EuiCode>
                          <EuiText size="xs" color="subdued">
                            {p.description}
                          </EuiText>
                        </span>
                      }
                      checked={selectedPipelineIds.has(p.id)}
                      disabled={!enablePipelines}
                      onChange={() => setSelectedPipelineIds((prev) => toggleGroup(prev, p.id))}
                    />
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            </SetupCollapsible>
          );
        })}
        {PIPELINES.length === 0 ? (
          <EuiText size="s" color="danger">
            <p>No ingest pipelines are bundled for this cloud in this build.</p>
          </EuiText>
        ) : visiblePipelineIds.length === 0 ? (
          <EuiText size="s" color="subdued">
            <p>No pipelines match the current filter — clear the search box.</p>
          </EuiText>
        ) : null}
      </InstallerRow>

      <EuiSpacer size="m" />

      <InstallerRow
        label="Custom Dashboards"
        badge="Kibana"
        description={descDashboards}
        enabled={enableDashboards}
        onToggle={(v) => {
          setEnableDashboards(v);
          if (v) setExpandedSetupSections(new Set());
        }}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>Select dashboards{removeMode ? " to uninstall" : " to install"}:</strong>{" "}
          {selectedDashboardKeys.size} of {DASHBOARDS.length} selected
          {assetFilterQuery.trim() ? <> ({visibleDashboardIndices.length} visible)</> : null}.
          {!enableDashboards && DASHBOARDS.length > 0 && (
            <>
              {" "}
              Turn on <strong>Custom Dashboards</strong> above to include them in Install Selected.
            </>
          )}
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              size="xs"
              onClick={selectAllVisibleDashboards}
              disabled={!enableDashboards}
            >
              Select visible
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={clearVisibleDashboards} disabled={!enableDashboards}>
              Clear visible
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xs" />
        {dashboardGroupKeys.map((gk) => {
          const idxs = dashboardIndicesInGroup(gk);
          if (idxs.length === 0) return null;
          const nSel = idxs.filter((i) =>
            selectedDashboardKeys.has(stableDashboardKey(DASHBOARDS[i], i))
          ).length;
          return (
            <SetupCollapsible
              key={`dash-${gk}-${uid}`}
              sectionKey={`dash:${gk}:${uid}`}
              expandedSections={expandedSetupSections}
              setExpandedSections={setExpandedSetupSections}
              header={
                <EuiText size="s">
                  <strong>{gk}</strong>{" "}
                  <EuiBadge color="hollow">
                    {nSel}/{idxs.length}
                  </EuiBadge>
                </EuiText>
              }
            >
              <EuiFlexGroup gutterSize="s" wrap responsive={false} alignItems="center">
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => setAllInDashboardGroup(gk, true)}
                    disabled={!enableDashboards}
                  >
                    All in group
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    size="xs"
                    onClick={() => setAllInDashboardGroup(gk, false)}
                    disabled={!enableDashboards}
                  >
                    None in group
                  </EuiButtonEmpty>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="s" />
              <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                {idxs.map((i) => {
                  const d = DASHBOARDS[i];
                  const key = stableDashboardKey(d, i);
                  const title = polishSetupDashboardTitle(d.title ?? `Dashboard ${i + 1}`, cloudId);
                  return (
                    <EuiFlexItem
                      grow={false}
                      key={`${gk}:${i}:${key}`}
                      style={{ minWidth: 280, maxWidth: 440 }}
                    >
                      <EuiCheckbox
                        id={`dashboard-${key}-${uid}`}
                        label={
                          <span title={title}>
                            <EuiCode>{title}</EuiCode>
                          </span>
                        }
                        checked={selectedDashboardKeys.has(key)}
                        disabled={!enableDashboards}
                        onChange={() => setSelectedDashboardKeys((prev) => toggleGroup(prev, key))}
                      />
                    </EuiFlexItem>
                  );
                })}
              </EuiFlexGroup>
            </SetupCollapsible>
          );
        })}
        {DASHBOARDS.length === 0 ? (
          <EuiText size="s" color="danger">
            <p>
              No dashboard definitions are bundled for this cloud in this build. The UI is built from
              JSON under <EuiCode>installer/</EuiCode> (for example{" "}
              <EuiCode>installer/azure-custom-dashboards/*-dashboard.json</EuiCode>). Rebuild from a
              full clone that includes <EuiCode>installer/</EuiCode>, or hard-refresh if you suspect a
              cached old bundle.
            </p>
          </EuiText>
        ) : visibleDashboardIndices.length === 0 ? (
          <EuiText size="s" color="subdued">
            <p>No dashboards match the current filter — clear the search box.</p>
          </EuiText>
        ) : null}
      </InstallerRow>

      <EuiSpacer size="m" />

      <InstallerRow
        label="ML Anomaly Jobs"
        badge="Elasticsearch"
        description={descMl}
        enabled={enableMlJobs}
        onToggle={(v) => {
          setEnableMlJobs(v);
          if (v) setExpandedSetupSections(new Set());
        }}
      >
        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>
            {removeMode ? "Select ML jobs to uninstall:" : "Select ML jobs to install:"}
          </strong>{" "}
          {selectedMlJobIds.size} of {totalMlJobsAll} jobs
          {assetFilterQuery.trim() ? (
            <>
              {" "}
              (
              {useAwsMlUnifiedByServiceType && mlJobSectionsByServiceType
                ? `${mlJobSectionsByServiceType.length} group(s)`
                : `${visibleMlFiles.length} file(s)`}{" "}
              visible)
            </>
          ) : null}
          .
          {!enableMlJobs && ML_JOB_FILES.length > 0 && (
            <>
              {" "}
              Turn on <strong>ML Anomaly Jobs</strong> above to include them in Install Selected.
            </>
          )}
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiFlexGroup gutterSize="s" wrap responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={selectAllVisibleMlJobs} disabled={!enableMlJobs}>
              Select visible
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={clearVisibleMlJobs} disabled={!enableMlJobs}>
              Clear visible
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="xs" />
        {useAwsMlUnifiedByServiceType && mlJobSectionsByServiceType
          ? mlJobSectionsByServiceType.map((section) => {
              const nSel = section.refs.filter((r) => selectedMlJobIds.has(r.job.id)).length;
              return (
                <SetupCollapsible
                  key={`ml-srv-${section.label}-${uid}`}
                  sectionKey={`ml:srv:${section.label}:${uid}`}
                  expandedSections={expandedSetupSections}
                  setExpandedSections={setExpandedSetupSections}
                  header={
                    <EuiText size="s">
                      <strong>{section.label}</strong>{" "}
                      <EuiBadge color="hollow">
                        {nSel}/{section.refs.length}
                      </EuiBadge>
                    </EuiText>
                  }
                >
                  <EuiFlexGroup gutterSize="s" wrap responsive={false} alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size="xs"
                        onClick={() => setAllJobsInMlServiceGroup(section.label, true)}
                        disabled={!enableMlJobs}
                      >
                        All in group
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size="xs"
                        onClick={() => setAllJobsInMlServiceGroup(section.label, false)}
                        disabled={!enableMlJobs}
                      >
                        None in group
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer size="s" />
                  <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                    {section.refs.map(({ file, job }) => (
                      <EuiFlexItem
                        grow={false}
                        key={job.id}
                        style={{ minWidth: 260, maxWidth: 420 }}
                      >
                        <EuiCheckbox
                          id={`ml-job-${file.group}-${job.id}-${uid}`}
                          label={
                            <span title={job.description}>
                              <EuiCode>{job.id}</EuiCode>
                              <EuiText size="xs" color="subdued">
                                {job.description}
                              </EuiText>
                            </span>
                          }
                          checked={selectedMlJobIds.has(job.id)}
                          disabled={!enableMlJobs}
                          onChange={() => setSelectedMlJobIds((prev) => toggleGroup(prev, job.id))}
                        />
                      </EuiFlexItem>
                    ))}
                  </EuiFlexGroup>
                </SetupCollapsible>
              );
            })
          : visibleMlFiles.map((file) => {
              const visibleJobs = file.jobs.filter((j) =>
                mlJobEntryMatchesQuery(j, assetFilterQuery)
              );
              if (visibleJobs.length === 0) return null;
              const nSel = visibleJobs.filter((j) => selectedMlJobIds.has(j.id)).length;
              return (
                <SetupCollapsible
                  key={`ml-${file.group}-${uid}`}
                  sectionKey={`ml:${file.group}:${uid}`}
                  expandedSections={expandedSetupSections}
                  setExpandedSections={setExpandedSetupSections}
                  header={
                    <EuiText size="s">
                      <strong>{polishSetupCategoryLabel(file.group)}</strong>{" "}
                      <EuiBadge color="hollow">
                        {nSel}/{visibleJobs.length}
                      </EuiBadge>
                    </EuiText>
                  }
                >
                  <EuiText size="xs" color="subdued">
                    {file.description}
                  </EuiText>
                  <EuiSpacer size="s" />
                  <EuiFlexGroup gutterSize="s" wrap responsive={false} alignItems="center">
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size="xs"
                        onClick={() => setAllJobsInMlFile(file, true)}
                        disabled={!enableMlJobs}
                      >
                        All in file
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiButtonEmpty
                        size="xs"
                        onClick={() => setAllJobsInMlFile(file, false)}
                        disabled={!enableMlJobs}
                      >
                        None in file
                      </EuiButtonEmpty>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiSpacer size="s" />
                  <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                    {visibleJobs.map((j) => (
                      <EuiFlexItem
                        grow={false}
                        key={`${file.group}:${j.id}`}
                        style={{ minWidth: 260, maxWidth: 420 }}
                      >
                        <EuiCheckbox
                          id={`ml-job-${file.group}-${j.id}-${uid}`}
                          label={
                            <span title={j.description}>
                              <EuiCode>{j.id}</EuiCode>
                              <EuiText size="xs" color="subdued">
                                {j.description}
                              </EuiText>
                            </span>
                          }
                          checked={selectedMlJobIds.has(j.id)}
                          disabled={!enableMlJobs}
                          onChange={() => setSelectedMlJobIds((prev) => toggleGroup(prev, j.id))}
                        />
                      </EuiFlexItem>
                    ))}
                  </EuiFlexGroup>
                </SetupCollapsible>
              );
            })}
        {ML_JOB_FILES.length === 0 || totalMlJobsAll === 0 ? (
          <EuiText size="s" color="danger">
            <p>No ML job definitions are bundled for this cloud in this build.</p>
          </EuiText>
        ) : visibleMlJobRefs.length === 0 ? (
          <EuiText size="s" color="subdued">
            <p>No ML jobs match the current filter — clear the search box.</p>
          </EuiText>
        ) : null}
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
          <EuiPanel paddingSize="s" color="subdued">
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  Setup log ({log.length} lines, kept for this browser session)
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" iconType="trash" onClick={clearSetupActivityLog}>
                  Clear log
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {log.map((line, i) => {
                const timeLabel = line.at
                  ? new Date(line.at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "";
                return (
                  <div
                    key={`${line.at ?? ""}-${i}-${line.text.slice(0, 24)}`}
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
                    {timeLabel && (
                      <span style={{ opacity: 0.65, marginRight: 8 }}>{timeLabel}</span>
                    )}
                    {line.text}
                  </div>
                );
              })}
            </div>
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
