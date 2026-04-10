import { useState, useCallback, useRef, useEffect, useMemo, lazy, Suspense } from "react";
import { rand, stripNulls } from "./helpers";
import { enrichForCloud } from "./helpers/enrichGcpAzure";
import { serviceIdsInGroup } from "./data/serviceGroups";
import type { CloudAppConfig, CloudId } from "./cloud/types";
import {
  unifiedVendorCard,
  UNIFIED_HEADER_CLOUD_MARK_SRC,
  UNIFIED_HEADER_WORDMARK_SRC,
} from "./cloud/unifiedVendorMeta";
import {
  validateElasticUrl,
  validateApiKey,
  validateIndexPrefix,
  testConnection,
} from "./utils/validation";
import { loadAndScrubSavedConfig, toPersistedStorageObject } from "./utils/persistedConfig";
import { isOtelPipelineSource } from "./helpers/otelPipeline";
import {
  analyzeIngestionConflicts,
  clampGlobalIngestionOverride,
  type IngestionClampGcpAzureCtx,
} from "./helpers/ingestionCompatibility";
import { AppLayout } from "./components/AppLayout";
import { WizardFooter } from "./components/WizardFooter";
import { runShipWorkload } from "./ship/runShipWorkload";
import type { LooseDoc } from "./ship/types";

const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage }))
);
const ShipPage = lazy(() => import("./pages/ShipPage").then((m) => ({ default: m.ShipPage })));
const ConnectionPage = lazy(() =>
  import("./pages/ConnectionPage").then((m) => ({ default: m.ConnectionPage }))
);
const ServicesPage = lazy(() =>
  import("./pages/ServicesPage").then((m) => ({ default: m.ServicesPage }))
);
const ConfigPage = lazy(() =>
  import("./pages/ConfigPage").then((m) => ({ default: m.ConfigPage }))
);
const AnomaliesPage = lazy(() =>
  import("./pages/AnomaliesPage").then((m) => ({ default: m.AnomaliesPage }))
);
const ActivityPage = lazy(() =>
  import("./pages/ActivityPage").then((m) => ({ default: m.ActivityPage }))
);
const SetupPage = lazy(() => import("./pages/SetupPage").then((m) => ({ default: m.SetupPage })));

type LogEntry = { id: number; msg: string; type: string; ts: string };
type ShipStatus = "running" | "done" | "aborted" | null;
type ShipProgressPhase = "main" | "injection";
type ShipProgress = { sent: number; total: number; errors: number; phase: ShipProgressPhase };

const WIZARD_PAGE_IDS = new Set([
  "welcome",
  "connection",
  "setup",
  "services",
  "config",
  "anomalies",
  "ship",
  "log",
]);

function readStoredWizardPage(lsKey: string): string {
  try {
    const raw = sessionStorage.getItem(`${lsKey}:activeWizardPage`);
    if (raw && WIZARD_PAGE_IDS.has(raw)) return raw;
  } catch {
    /* ignore */
  }
  return "welcome";
}

export function LoadGeneratorApp({
  config,
  unifiedMode,
}: {
  config: CloudAppConfig;
  /** Multi-cloud UI: neutral header + vendor choice on the Start step */
  unifiedMode?: { cloudVendor: CloudId; onCloudVendorChange: (id: CloudId) => void };
}) {
  const LS_KEY = config.lsKey;
  const savedConfig = loadAndScrubSavedConfig(LS_KEY);

  useEffect(() => {
    document.title = unifiedMode ? "Cloud to Elastic Load Generator" : config.htmlTitle;
  }, [config.htmlTitle, unifiedMode]);

  const [selectedServices, setSelectedServices] = useState(config.defaultSelectedLogServices);
  const [selectedTraceServices, setSelectedTraceServices] = useState(
    config.defaultSelectedTraceServices
  );
  const [logsPerService, setLogsPerService] = useState(savedConfig.logsPerService ?? 500);
  const [tracesPerService, setTracesPerService] = useState(savedConfig.tracesPerService ?? 100);
  const [errorRate, setErrorRate] = useState(savedConfig.errorRate ?? 0.05);
  const [batchSize, setBatchSize] = useState(savedConfig.batchSize ?? 250);
  const [deploymentType, setDeploymentType] = useState<
    "self-managed" | "cloud-hosted" | "serverless"
  >(() => {
    if (unifiedMode) return "serverless";
    const d = savedConfig.deploymentType as
      | "self-managed"
      | "cloud-hosted"
      | "serverless"
      | undefined;
    return d ?? "serverless";
  });
  const [elasticUrl, setElasticUrl] = useState("");
  const [kibanaUrl, setKibanaUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [setupHasInstalled, setSetupHasInstalled] = useState(false);
  const [logsIndexPrefix, setLogsIndexPrefix] = useState(
    savedConfig.logsIndexPrefix ?? config.defaultLogsIndexPrefix
  );
  const [metricsIndexPrefix, setMetricsIndexPrefix] = useState(
    savedConfig.metricsIndexPrefix ?? config.defaultMetricsIndexPrefix
  );
  const [eventType, setEventType] = useState<"logs" | "metrics" | "traces">(() =>
    unifiedMode
      ? "logs"
      : ((savedConfig.eventType as "logs" | "metrics" | "traces" | undefined) ?? "logs")
  );
  const [ingestionSource, setIngestionSource] = useState(() =>
    unifiedMode ? "default" : (savedConfig.ingestionSource ?? "default")
  );
  const [batchDelayMs, setBatchDelayMs] = useState(savedConfig.batchDelayMs ?? 20);
  const [injectAnomalies, setInjectAnomalies] = useState(savedConfig.injectAnomalies ?? false);
  const [scheduleEnabled, setScheduleEnabled] = useState(savedConfig.scheduleEnabled ?? false);
  const [scheduleTotalRuns, setScheduleTotalRuns] = useState(savedConfig.scheduleTotalRuns ?? 12);
  const [scheduleIntervalMin, setScheduleIntervalMin] = useState(
    savedConfig.scheduleIntervalMin ?? 15
  );
  const [scheduleActive, setScheduleActive] = useState(false);
  const [scheduleCurrentRun, setScheduleCurrentRun] = useState(0);
  const [nextRunAt, setNextRunAt] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [validationErrors, setValidationErrors] = useState({
    elasticUrl: "",
    apiKey: "",
    indexPrefix: "",
  });
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "testing" | "ok" | "fail">(
    "idle"
  );
  const [connectionMsg, setConnectionMsg] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [ingestionResetNotice, setIngestionResetNotice] = useState<string | null>(null);

  const isTracesMode = eventType === "traces";
  /** Traces ship via OTLP; honor OTel pipeline override when user selected one. */
  const traceIngestionSource = useMemo(() => {
    if (ingestionSource !== "default" && isOtelPipelineSource(ingestionSource)) {
      return ingestionSource;
    }
    return "otel";
  }, [ingestionSource]);
  const indexPrefix = eventType === "metrics" ? metricsIndexPrefix : logsIndexPrefix;
  const setIndexPrefix = eventType === "metrics" ? setMetricsIndexPrefix : setLogsIndexPrefix;

  const connectionStepComplete = useMemo(() => {
    const urlOk = validateElasticUrl(elasticUrl).valid;
    const keyOk = validateApiKey(apiKey).valid;
    const prefixOk = isTracesMode || validateIndexPrefix(indexPrefix).valid;
    return urlOk && keyOk && prefixOk;
  }, [elasticUrl, apiKey, indexPrefix, isTracesMode]);

  // Auto-derive Kibana URL from ES URL for cloud deployments (.es. → .kb.)
  const effectiveKibanaUrl =
    kibanaUrl ||
    (deploymentType !== "self-managed" && elasticUrl.includes(".es.")
      ? elasticUrl.replace(".es.", ".kb.")
      : "");

  const [status, setStatus] = useState<ShipStatus>(null);
  const [progress, setProgress] = useState<ShipProgress>({
    sent: 0,
    total: 0,
    errors: 0,
    phase: "main",
  });
  const [log, setLog] = useState<LogEntry[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [activePage, setActivePageState] = useState(() => readStoredWizardPage(LS_KEY));
  const navigateToPage = useCallback(
    (page: string) => {
      setActivePageState(page);
      try {
        sessionStorage.setItem(`${LS_KEY}:activeWizardPage`, page);
      } catch {
        /* ignore quota / private mode */
      }
    },
    [LS_KEY]
  );
  const abortRef = useRef(false);
  const scheduleLoopRef = useRef<AbortController | null>(null);
  const logSeqRef = useRef(0);
  /** Tracks cloud config so we can reset vendor-specific state without remounting (unified mode). */
  const prevCloudIdRef = useRef<CloudId | undefined>(undefined);

  // traceServiceGroups moved to ServicesPage

  // When vendor/config changes in unified mode, keep navigation (e.g. Stay on Start) but reload cloud defaults.
  useEffect(() => {
    if (prevCloudIdRef.current === undefined) {
      prevCloudIdRef.current = config.id;
      return;
    }
    if (prevCloudIdRef.current === config.id) return;
    prevCloudIdRef.current = config.id;

    const sc = loadAndScrubSavedConfig(config.lsKey);
    setSelectedServices(config.defaultSelectedLogServices);
    setSelectedTraceServices(config.defaultSelectedTraceServices);
    setLogsIndexPrefix(sc.logsIndexPrefix ?? config.defaultLogsIndexPrefix);
    setMetricsIndexPrefix(sc.metricsIndexPrefix ?? config.defaultMetricsIndexPrefix);
    setSetupHasInstalled(false);
    setCollapsedGroups({});
    setStatus(null);
    setProgress({ sent: 0, total: 0, errors: 0, phase: "main" });
    setPreview(null);
    setIngestionResetNotice(null);
    if (unifiedMode) {
      setEventType("logs");
      setIngestionSource("default");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when `config.id` changes; read latest `config` / `unifiedMode` from closure
  }, [config.id]);

  // ─── Persist config to localStorage (allowlisted keys only — no URL/API key) ─
  useEffect(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify(
          toPersistedStorageObject({
            logsIndexPrefix,
            metricsIndexPrefix,
            logsPerService,
            tracesPerService,
            errorRate,
            batchSize,
            batchDelayMs,
            ingestionSource,
            eventType,
            injectAnomalies,
            scheduleEnabled,
            scheduleTotalRuns,
            scheduleIntervalMin,
            deploymentType,
          })
        )
      );
    } catch (e) {
      if (import.meta.env.DEV) console.warn("[LS] Failed to save config:", e);
    }
  }, [
    LS_KEY,
    logsIndexPrefix,
    metricsIndexPrefix,
    logsPerService,
    tracesPerService,
    errorRate,
    batchSize,
    batchDelayMs,
    ingestionSource,
    eventType,
    injectAnomalies,
    scheduleEnabled,
    scheduleTotalRuns,
    scheduleIntervalMin,
    deploymentType,
  ]);

  const clearSavedConfig = () => {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    setLogsPerService(500);
    setTracesPerService(100);
    setErrorRate(0.05);
    setBatchSize(250);
    setLogsIndexPrefix(config.defaultLogsIndexPrefix);
    setMetricsIndexPrefix(config.defaultMetricsIndexPrefix);
    setEventType("logs");
    setIngestionSource("default");
    setBatchDelayMs(20);
    setInjectAnomalies(false);
    setScheduleEnabled(false);
    setScheduleTotalRuns(12);
    setScheduleIntervalMin(15);
    setDeploymentType("serverless");
  };

  // ─── Scheduled mode countdown ────────────────────────────────────────────────
  useEffect(() => {
    if (!nextRunAt) {
      setCountdown(0);
      return;
    }
    const tick = () =>
      setCountdown(Math.max(0, Math.ceil((nextRunAt.getTime() - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRunAt]);

  // toggleTraceService, selectAllTraces, selectNoneTraces moved to ServicesPage inline handlers

  const addLog = (msg: string, type = "info") =>
    setLog((prev) => [
      ...prev.slice(-5000),
      {
        id: logSeqRef.current++,
        msg,
        type,
        ts: new Date().toLocaleTimeString(),
      },
    ]);

  const downloadLog = () => {
    const lines = log
      .map((e) => `[${e.ts}] [${e.type.toUpperCase().padEnd(5)}] ${e.msg}`)
      .join("\n");
    const blob = new Blob([lines], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `load-generator-log-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEventTypeChange = (val: string) => {
    if (val !== "logs" && val !== "metrics" && val !== "traces") return;
    setEventType(val);
    if (val === "metrics") {
      setSelectedServices((prev) => prev.filter((id) => config.metricsSupportedServiceIds.has(id)));
    }
  };

  const handleTestConnection = async () => {
    if (!validateElasticUrl(elasticUrl).valid || !validateApiKey(apiKey).valid) {
      runConnectionValidation();
      return;
    }
    setConnectionStatus("testing");
    setConnectionMsg("");
    const result = await testConnection(elasticUrl, apiKey);
    if (result.valid) {
      setConnectionStatus("ok");
      setConnectionMsg("Connected successfully");
    } else {
      setConnectionStatus("fail");
      setConnectionMsg(result.message ?? "Connection failed");
    }
  };

  const exportConfig = () => {
    const config = {
      selectedServices,
      selectedTraceServices,
      logsPerService,
      tracesPerService,
      errorRate,
      batchSize,
      batchDelayMs,
      logsIndexPrefix,
      metricsIndexPrefix,
      eventType,
      ingestionSource,
      injectAnomalies,
      scheduleEnabled,
      scheduleTotalRuns,
      scheduleIntervalMin,
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `load-generator-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addLog("Config exported", "ok");
  };

  const importConfig = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const config = JSON.parse(text);
        if (config.selectedServices) setSelectedServices(config.selectedServices);
        if (config.selectedTraceServices) setSelectedTraceServices(config.selectedTraceServices);
        if (config.logsPerService != null) setLogsPerService(config.logsPerService);
        if (config.tracesPerService != null) setTracesPerService(config.tracesPerService);
        if (config.errorRate != null) setErrorRate(config.errorRate);
        if (config.batchSize != null) setBatchSize(config.batchSize);
        if (config.batchDelayMs != null) setBatchDelayMs(config.batchDelayMs);
        if (config.logsIndexPrefix) setLogsIndexPrefix(config.logsIndexPrefix);
        if (config.metricsIndexPrefix) setMetricsIndexPrefix(config.metricsIndexPrefix);
        if (
          config.eventType === "logs" ||
          config.eventType === "metrics" ||
          config.eventType === "traces"
        ) {
          setEventType(config.eventType);
        }
        if (config.ingestionSource) setIngestionSource(config.ingestionSource);
        if (config.injectAnomalies != null) setInjectAnomalies(config.injectAnomalies);
        if (config.scheduleEnabled != null) setScheduleEnabled(config.scheduleEnabled);
        if (config.scheduleTotalRuns != null) setScheduleTotalRuns(config.scheduleTotalRuns);
        if (config.scheduleIntervalMin != null) setScheduleIntervalMin(config.scheduleIntervalMin);
        addLog(`Config imported from ${file.name}`, "ok");
      } catch {
        addLog("Failed to import config — invalid JSON", "error");
      }
    };
    input.click();
  };

  // Service selection helpers — used by ServicesPage via inline props

  const ingestionClampCtx = useMemo<IngestionClampGcpAzureCtx | null>(() => {
    if (config.enrichContext.kind !== "gcp-azure") return null;
    const c = config.enrichContext.ctx;
    return {
      serviceIngestionDefaults: c.serviceIngestionDefaults,
      defaultIngestion: c.defaultIngestion,
      ingestionUiFallback: c.ingestionUiFallback,
    };
  }, [config.enrichContext]);

  const getEffectiveSource = useCallback(
    (svcId: string) =>
      clampGlobalIngestionOverride(
        config.id,
        svcId,
        svcId,
        ingestionSource === "default" ? undefined : ingestionSource,
        config.id === "aws" ? null : ingestionClampCtx
      ).source,
    [config.id, ingestionClampCtx, ingestionSource]
  );

  const getIngestionClampDetail = useCallback(
    (svcId: string) =>
      clampGlobalIngestionOverride(
        config.id,
        svcId,
        svcId,
        ingestionSource === "default" ? undefined : ingestionSource,
        config.id === "aws" ? null : ingestionClampCtx
      ),
    [config.id, ingestionClampCtx, ingestionSource]
  );

  /** Reset impossible global overrides (e.g. Entra + AKS) before generate/ship. */
  useEffect(() => {
    if (ingestionSource === "default" || isTracesMode) {
      return;
    }
    const selected = selectedServices;
    const { hasConflict, incompatibleServiceIds } = analyzeIngestionConflicts(
      config.id,
      ingestionSource,
      selected,
      config.id === "aws" ? null : ingestionClampCtx
    );
    if (!hasConflict) return;
    const label = config.ingestionMeta[ingestionSource]?.label ?? ingestionSource;
    setIngestionResetNotice(
      `Ingestion override "${label}" does not apply to: ${incompatibleServiceIds.join(", ")}. Reset to Default.`
    );
    setIngestionSource("default");
  }, [ingestionSource, selectedServices, isTracesMode, config, ingestionClampCtx]);

  const ingestionOverrideCompatibleHint = useMemo(() => {
    if (ingestionSource === "default" || isTracesMode) return null;
    const { hasConflict } = analyzeIngestionConflicts(
      config.id,
      ingestionSource,
      selectedServices,
      config.id === "aws" ? null : ingestionClampCtx
    );
    if (hasConflict) return null;
    const label = config.ingestionMeta[ingestionSource]?.label ?? ingestionSource;
    return `Override "${label}" is compatible with all ${selectedServices.length} selected service(s).`;
  }, [ingestionSource, isTracesMode, selectedServices, config, ingestionClampCtx]);

  useEffect(() => {
    if (!ingestionResetNotice) return;
    const t = setTimeout(() => setIngestionResetNotice(null), 12000);
    return () => clearTimeout(t);
  }, [ingestionResetNotice]);

  const enrichDoc = useCallback(
    (doc: LooseDoc, svc: string, source: string, evType: string): LooseDoc =>
      enrichForCloud(
        doc,
        {
          serviceId: svc,
          ingestionSource: source,
          eventType: evType as "logs" | "metrics" | "traces",
        },
        config.enrichContext
      ),
    [config.enrichContext]
  );

  const generatePreview = async () => {
    if (isTracesMode) {
      if (!selectedTraceServices.length) return;
      const svc = rand(selectedTraceServices);
      const TRACE_GENERATORS = await config.loadTraceGenerators();
      const traceDocs = TRACE_GENERATORS[svc](new Date().toISOString(), errorRate);
      setPreview(
        JSON.stringify(
          enrichDoc(stripNulls(traceDocs[0]) as LooseDoc, svc, traceIngestionSource, "traces"),
          null,
          2
        )
      );
    } else {
      if (!selectedServices.length) return;
      const svc = rand(selectedServices);
      if (eventType === "metrics") {
        const METRICS_GENERATORS = await config.loadMetricsGenerators();
        if (METRICS_GENERATORS[svc]) {
          const raw = METRICS_GENERATORS[svc](new Date().toISOString(), errorRate);
          const first = Array.isArray(raw) ? raw[0] : raw;
          setPreview(
            JSON.stringify(
              enrichDoc(stripNulls(first) as LooseDoc, svc, getEffectiveSource(svc), "metrics"),
              null,
              2
            )
          );
          return;
        }
      }
      const GENERATORS = await config.loadLogGenerators();
      const result = GENERATORS[svc](new Date().toISOString(), errorRate);
      if (Array.isArray(result)) {
        const row = stripNulls(result[0]) as LooseDoc;
        const { __dataset: _omitDataset, ...cleanDoc } = row;
        setPreview(JSON.stringify(cleanDoc, null, 2));
      } else {
        setPreview(
          JSON.stringify(
            stripNulls(enrichDoc(result as LooseDoc, svc, getEffectiveSource(svc), eventType)),
            null,
            2
          )
        );
      }
    }
  };

  const runConnectionValidation = useCallback(() => {
    const urlResult = validateElasticUrl(elasticUrl);
    const keyResult = validateApiKey(apiKey);
    const prefixResult = validateIndexPrefix(indexPrefix);
    setValidationErrors({
      elasticUrl: urlResult.valid ? "" : (urlResult.message ?? ""),
      apiKey: keyResult.valid ? "" : (keyResult.message ?? ""),
      indexPrefix: prefixResult.valid ? "" : (prefixResult.message ?? ""),
    });
    return urlResult.valid && keyResult.valid && prefixResult.valid;
  }, [elasticUrl, apiKey, indexPrefix]);

  const ship = useCallback(async () => {
    await runShipWorkload({
      config,
      isTracesMode,
      selectedServices,
      selectedTraceServices,
      tracesPerService,
      logsPerService,
      errorRate,
      batchSize,
      batchDelayMs,
      elasticUrl,
      apiKey,
      indexPrefix,
      eventType,
      traceIngestionSource,
      dryRun,
      injectAnomalies,
      enrichDoc,
      getEffectiveSource,
      getIngestionClampDetail,
      runConnectionValidation,
      abortRef,
      addLog,
      setStatus,
      setLog,
      setProgress,
    });
  }, [
    selectedServices,
    selectedTraceServices,
    logsPerService,
    tracesPerService,
    errorRate,
    batchSize,
    batchDelayMs,
    elasticUrl,
    apiKey,
    indexPrefix,
    enrichDoc,
    getEffectiveSource,
    getIngestionClampDetail,
    eventType,
    isTracesMode,
    traceIngestionSource,
    runConnectionValidation,
    injectAnomalies,
    dryRun,
    config,
  ]);

  // ─── Scheduled mode loop ─────────────────────────────────────────────────────
  const startSchedule = useCallback(async () => {
    const controller = new AbortController();
    scheduleLoopRef.current = controller;
    setScheduleActive(true);

    for (let run = 1; run <= scheduleTotalRuns; run++) {
      if (controller.signal.aborted) break;
      setScheduleCurrentRun(run);
      setNextRunAt(null);
      await ship();
      // If the user stopped the current run, cancel the whole schedule too
      if (abortRef.current) controller.abort();
      if (controller.signal.aborted || run === scheduleTotalRuns) break;

      const nextTime = new Date(Date.now() + scheduleIntervalMin * 60 * 1000);
      setNextRunAt(nextTime);
      await new Promise<void>((resolve) => {
        const id = setTimeout(resolve, scheduleIntervalMin * 60 * 1000);
        controller.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(id);
            resolve();
          },
          { once: true }
        );
      });
    }

    scheduleLoopRef.current = null;
    setScheduleActive(false);
    setScheduleCurrentRun(0);
    setNextRunAt(null);
  }, [ship, scheduleTotalRuns, scheduleIntervalMin]);

  const pct = progress.total > 0 ? Math.round((progress.sent / progress.total) * 100) : 0;
  const totalSelected = isTracesMode ? selectedTraceServices.length : selectedServices.length;

  const wizardCanGoNext = useMemo(() => {
    switch (activePage) {
      case "connection":
        return connectionStepComplete;
      case "setup":
        return true;
      case "services":
      case "config":
        return totalSelected > 0;
      default:
        return false;
    }
  }, [activePage, connectionStepComplete, totalSelected]);

  const totalServices = isTracesMode
    ? config.traceServices.length
    : eventType === "metrics"
      ? config.metricsSupportedServiceIds.size
      : config.allServiceIds.length;

  // ─── Estimated volume ──────────────────────────────────────────────────────
  const estimatedDocs = isTracesMode
    ? totalSelected * tracesPerService
    : totalSelected * logsPerService;
  const estimatedBatches = totalSelected > 0 ? Math.ceil(estimatedDocs / batchSize) : 0;

  const canShip = !!(
    totalSelected &&
    (dryRun ||
      (elasticUrl &&
        apiKey &&
        !(
          validationErrors.elasticUrl ||
          validationErrors.apiKey ||
          (!isTracesMode && validationErrors.indexPrefix)
        )))
  );

  const estimatedMBNum = isTracesMode
    ? parseFloat(((estimatedDocs * 3) / 1024).toFixed(1))
    : parseFloat(((estimatedDocs * 1.5) / 1024).toFixed(1));

  const restartWizard = useCallback(() => {
    setStatus(null);
    setProgress({ sent: 0, total: 0, errors: 0, phase: "main" });
    navigateToPage("connection");
  }, [navigateToPage]);

  const layoutBranding = unifiedMode
    ? { headerLogoSrc: UNIFIED_HEADER_CLOUD_MARK_SRC, headerLogoAlt: "Cloud" }
    : config.branding;
  const vendorCard = unifiedMode ? unifiedVendorCard(unifiedMode.cloudVendor) : null;

  return (
    <AppLayout
      branding={layoutBranding}
      headerAppTitle={unifiedMode ? "Cloud to Elastic Load Generator" : undefined}
      headerVendorBadge={
        unifiedMode && vendorCard
          ? {
              logoSrc: vendorCard.logoSrcDarkBg,
              logoAlt: vendorCard.logoAlt,
            }
          : undefined
      }
      headerWordmarkSrc={unifiedMode ? UNIFIED_HEADER_WORDMARK_SRC : undefined}
      activePage={activePage}
      onNavigate={navigateToPage}
      footer={
        <WizardFooter
          activePage={activePage}
          onNavigate={navigateToPage}
          canGoNext={wizardCanGoNext}
        />
      }
      status={status}
      totalSelected={totalSelected}
      totalServices={totalServices}
      scheduleActive={scheduleActive}
      scheduleCurrentRun={scheduleCurrentRun}
      scheduleTotalRuns={scheduleTotalRuns}
      isConnected={!!(elasticUrl && apiKey)}
      hasServicesSelected={totalSelected > 0}
      isSetupDone={setupHasInstalled}
    >
      <Suspense
        fallback={
          <div
            style={{
              padding: "2rem",
              textAlign: "center",
              color: "var(--euiColorSubdued, #69707d)",
            }}
          >
            Loading…
          </div>
        }
      >
        {activePage === "welcome" && (
          <LandingPage
            isUnifiedCloud={!!unifiedMode}
            onGetStarted={() => navigateToPage("connection")}
          />
        )}

        {activePage === "ship" && (
          <ShipPage
            status={status}
            progress={progress}
            pct={pct}
            totalSelected={totalSelected}
            estimatedDocs={estimatedDocs}
            estimatedMB={estimatedMBNum}
            estimatedBatches={estimatedBatches}
            isTracesMode={isTracesMode}
            eventType={eventType}
            tracesPerService={tracesPerService}
            logsPerService={logsPerService}
            dryRun={dryRun}
            scheduleEnabled={scheduleEnabled}
            scheduleTotalRuns={scheduleTotalRuns}
            scheduleIntervalMin={scheduleIntervalMin}
            scheduleActive={scheduleActive}
            scheduleCurrentRun={scheduleCurrentRun}
            nextRunAt={nextRunAt}
            countdown={countdown}
            canShip={canShip}
            onShip={scheduleEnabled ? startSchedule : ship}
            onStop={() => {
              abortRef.current = true;
              scheduleLoopRef.current?.abort();
            }}
            onPreview={generatePreview}
            onDryRunChange={setDryRun}
            onScheduleEnabledChange={setScheduleEnabled}
            onScheduleTotalRunsChange={setScheduleTotalRuns}
            onScheduleIntervalMinChange={setScheduleIntervalMin}
            onRestartWizard={restartWizard}
            preview={preview}
          />
        )}

        {activePage === "connection" && (
          <ConnectionPage
            unifiedCloudPicker={
              unifiedMode
                ? { vendor: unifiedMode.cloudVendor, onChange: unifiedMode.onCloudVendorChange }
                : undefined
            }
            deploymentType={deploymentType}
            elasticUrl={elasticUrl}
            kibanaUrl={effectiveKibanaUrl}
            apiKey={apiKey}
            indexPrefix={indexPrefix}
            isTracesMode={isTracesMode}
            eventType={eventType}
            connectionStatus={connectionStatus}
            connectionMsg={connectionMsg}
            validationErrors={validationErrors}
            ingestionSource={ingestionSource}
            onDeploymentTypeChange={setDeploymentType}
            onElasticUrlChange={(val) => {
              setElasticUrl(val);
              setValidationErrors((prev) => ({ ...prev, elasticUrl: "" }));
            }}
            onKibanaUrlChange={setKibanaUrl}
            onApiKeyChange={(val) => {
              setApiKey(val);
              setValidationErrors((prev) => ({ ...prev, apiKey: "" }));
            }}
            onIndexPrefixChange={(val) => {
              setIndexPrefix(val);
              setValidationErrors((prev) => ({ ...prev, indexPrefix: "" }));
            }}
            onEventTypeChange={handleEventTypeChange}
            onTestConnection={handleTestConnection}
            onIngestionSourceChange={setIngestionSource}
            onExportConfig={exportConfig}
            onImportConfig={importConfig}
            onResetConfig={clearSavedConfig}
            onBlurElasticUrl={() =>
              setValidationErrors((prev) => ({
                ...prev,
                elasticUrl: validateElasticUrl(elasticUrl).valid
                  ? ""
                  : (validateElasticUrl(elasticUrl).message ?? ""),
              }))
            }
            onBlurApiKey={() =>
              setValidationErrors((prev) => ({
                ...prev,
                apiKey: validateApiKey(apiKey).valid ? "" : (validateApiKey(apiKey).message ?? ""),
              }))
            }
            onBlurIndexPrefix={() =>
              setValidationErrors((prev) => ({
                ...prev,
                indexPrefix: validateIndexPrefix(indexPrefix).valid
                  ? ""
                  : (validateIndexPrefix(indexPrefix).message ?? ""),
              }))
            }
            ingestionOverrideOptions={config.ingestionOverrideOptions}
            ingestionResetNotice={ingestionResetNotice}
            ingestionOverrideCompatibleHint={ingestionOverrideCompatibleHint}
          />
        )}

        {activePage === "setup" && (
          <SetupPage
            key={config.setupBundle.fleetPackage}
            setupBundle={config.setupBundle}
            elasticUrl={elasticUrl}
            kibanaUrl={effectiveKibanaUrl}
            apiKey={apiKey}
            onInstallComplete={() => setSetupHasInstalled(true)}
            onUninstallComplete={() => setSetupHasInstalled(false)}
            onReinstallComplete={() => setSetupHasInstalled(true)}
          />
        )}

        {activePage === "services" && (
          <ServicesPage
            isTracesMode={isTracesMode}
            eventType={eventType}
            selectedServices={selectedServices}
            selectedTraceServices={selectedTraceServices}
            onSelectedServicesChange={setSelectedServices}
            onSelectedTraceServicesChange={setSelectedTraceServices}
            totalSelected={totalSelected}
            totalServices={totalServices}
            collapsedGroups={collapsedGroups}
            onToggleGroup={(gid) => setCollapsedGroups((prev) => ({ ...prev, [gid]: !prev[gid] }))}
            ingestionSource={ingestionSource}
            serviceGroups={config.serviceGroups}
            traceServices={config.traceServices}
            ingestionMeta={config.ingestionMeta}
            metricsSupportedServiceIds={config.metricsSupportedServiceIds}
            serviceIcons={config.serviceIcons}
            selectAll={() => {
              if (isTracesMode) {
                setSelectedTraceServices(config.traceServices.map((s) => s.id));
              } else if (eventType === "metrics") {
                setSelectedServices(
                  config.allServiceIds.filter((id) => config.metricsSupportedServiceIds.has(id))
                );
              } else {
                setSelectedServices([...config.allServiceIds]);
              }
            }}
            selectNone={() => {
              if (isTracesMode) {
                setSelectedTraceServices([]);
              } else {
                setSelectedServices([]);
              }
            }}
            toggleService={(id) => {
              if (isTracesMode) {
                setSelectedTraceServices((prev) =>
                  prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
                );
              } else {
                setSelectedServices((prev) =>
                  prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
                );
              }
            }}
            toggleGroupSelection={(gid) => {
              const group = config.serviceGroups.find((g) => g.id === gid);
              if (!group) return;
              let groupIds = serviceIdsInGroup(group);
              if (eventType === "metrics") {
                groupIds = groupIds.filter((id) => config.metricsSupportedServiceIds.has(id));
              }
              if (groupIds.length === 0) return;
              const allSelected = groupIds.every((id) => selectedServices.includes(id));
              if (allSelected) {
                setSelectedServices((prev) => prev.filter((id) => !groupIds.includes(id)));
              } else {
                setSelectedServices((prev) => [...new Set([...prev, ...groupIds])]);
              }
            }}
            getEffectiveSource={getEffectiveSource}
          />
        )}

        {activePage === "config" && (
          <ConfigPage
            eventType={eventType}
            isTracesMode={isTracesMode}
            logsPerService={logsPerService}
            tracesPerService={tracesPerService}
            errorRate={errorRate}
            batchSize={batchSize}
            batchDelayMs={batchDelayMs}
            injectAnomalies={injectAnomalies}
            onLogsPerServiceChange={setLogsPerService}
            onTracesPerServiceChange={setTracesPerService}
            onErrorRateChange={setErrorRate}
            onBatchSizeChange={setBatchSize}
            onBatchDelayMsChange={setBatchDelayMs}
            onInjectAnomaliesChange={setInjectAnomalies}
          />
        )}

        {activePage === "anomalies" && (
          <AnomaliesPage
            injectAnomalies={injectAnomalies}
            onInjectAnomaliesChange={setInjectAnomalies}
          />
        )}

        {activePage === "log" && (
          <ActivityPage log={log} preview={preview} onDownloadLog={downloadLog} />
        )}
      </Suspense>
    </AppLayout>
  );
}
