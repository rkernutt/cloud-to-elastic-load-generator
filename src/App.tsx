import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { rand, randTs, stripNulls } from "./helpers";
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
import { ShipPage } from "./pages/ShipPage";
import { ConnectionPage } from "./pages/ConnectionPage";
import { ServicesPage } from "./pages/ServicesPage";
import { ConfigPage } from "./pages/ConfigPage";
import { AnomaliesPage } from "./pages/AnomaliesPage";
import { ActivityPage } from "./pages/ActivityPage";
import { SetupPage } from "./pages/SetupPage";
import { LandingPage } from "./pages/LandingPage";

type LogEntry = { id: number; msg: string; type: string; ts: string };
type ShipStatus = "running" | "done" | "aborted" | null;
type ShipProgressPhase = "main" | "injection";
type ShipProgress = { sent: number; total: number; errors: number; phase: ShipProgressPhase };
/** Generator / enrich output — intentionally loose (ECS-shaped JSON). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- ECS docs are dynamic per service
type LooseDoc = Record<string, any>;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Simulated response for dry-run mode. */
function dryRunResponse(): Response {
  return new Response(JSON.stringify({ took: 0, errors: false, items: [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

/** Fetch with exponential-backoff retry for transient network errors and 5xx responses. */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      // 4xx = real error, don't retry; 5xx = transient, retry
      if (res.ok || (res.status >= 400 && res.status < 500)) return res;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    if (attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
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
  const [eventType, setEventType] = useState(() =>
    unifiedMode ? "logs" : (savedConfig.eventType ?? "logs")
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
  const [activePage, setActivePage] = useState("welcome");
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
        if (config.eventType) setEventType(config.eventType);
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
    const activeServices = isTracesMode ? selectedTraceServices : selectedServices;
    if (!activeServices.length) {
      addLog("No services selected", "error");
      return;
    }
    if (!dryRun && !runConnectionValidation()) {
      addLog("Fix connection field errors before shipping.", "error");
      return;
    }
    abortRef.current = false;

    // Run up to CONCURRENCY service shippers in parallel. Workers pull from a shared
    // index so fast services don't block behind slow ones.
    const CONCURRENCY = 4;
    const runPool = async <T,>(
      items: string[],
      task: (item: string, index: number) => Promise<T>
    ): Promise<T[]> => {
      const results: T[] = new Array(items.length);
      let next = 0;
      const worker = async () => {
        while (next < items.length) {
          if (abortRef.current) return;
          const i = next++;
          results[i] = await task(items[i], i);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
      return results;
    };
    setStatus("running");
    setLog([]);
    // Throttle progress bar updates — accumulate deltas and flush at most every 120 ms.
    // Each service worker has its own accumulator; React batches the resulting setState calls.
    const makeProgressFlusher = (phase: ShipProgressPhase) => {
      let pendingSent = 0,
        pendingErrs = 0,
        lastFlush = 0;
      const flush = (force = false) => {
        const now = Date.now();
        if (!force && now - lastFlush < 120) return;
        if (pendingSent === 0 && pendingErrs === 0) return;
        const s = pendingSent,
          e = pendingErrs;
        pendingSent = 0;
        pendingErrs = 0;
        lastFlush = now;
        setProgress((prev) => ({
          ...prev,
          phase,
          sent: prev.sent + s,
          errors: prev.errors + e,
        }));
      };
      return {
        add: (sent: number, errs: number) => {
          pendingSent += sent;
          pendingErrs += errs;
          flush();
        },
        done: () => flush(true),
      };
    };
    try {
      const url = elasticUrl.replace(/\/$/, "");
      const headers = {
        "Content-Type": "application/x-ndjson",
        "x-elastic-url": url,
        "x-elastic-key": apiKey,
      };
      const endDate = new Date();
      // Metrics mode uses a 2-hour window: TSDS data streams only accept documents within
      // their writable range (~2h look-back by default on Elastic Cloud). Millisecond-precision
      // timestamps from randTs make dimension+timestamp collisions effectively impossible.
      // Logs and traces stay at 30 minutes — their IDs are not timestamp-derived.
      const windowMs = eventType === "metrics" ? 2 * 3600 * 1000 : 1800000;
      const startDate = new Date(endDate.getTime() - windowMs);

      /** ── Traces mode: each "trace" = 1 transaction + N spans ─────────────── */
      if (isTracesMode) {
        const TRACE_GENERATORS = await config.loadTraceGenerators();
        const APM_INDEX = "traces-apm-default";
        const totalTraces = activeServices.length * tracesPerService;
        setProgress({ sent: 0, total: totalTraces, errors: 0, phase: "main" });
        addLog(
          `Starting: ${totalTraces.toLocaleString()} traces across ${activeServices.length} service(s) → ${APM_INDEX}`
        );
        let totalSent = 0,
          totalErrors = 0;

        const shipTraceService = async (svc: string, _svcIndex: number) => {
          addLog(`▶ ${svc} → ${APM_INDEX} [OTel / OTLP]`, "info");
          const traceChunks = Array.from({ length: tracesPerService }, () =>
            TRACE_GENERATORS[svc](randTs(startDate, endDate), errorRate).map((d) =>
              enrichDoc(stripNulls(d) as LooseDoc, svc, traceIngestionSource, "traces")
            )
          );
          const prefixEnd: number[] = [];
          let acc = 0;
          for (const ch of traceChunks) {
            acc += ch.length;
            prefixEnd.push(acc);
          }
          const allDocs = traceChunks.flat();
          const progress = makeProgressFlusher("main");
          let svcSent = 0,
            svcErrors = 0,
            batchNum = 0,
            lastReportedTraces = 0;
          for (let i = 0; i < allDocs.length; i += batchSize) {
            if (abortRef.current) break;
            batchNum++;
            const batch = allDocs.slice(i, i + batchSize);
            const apmMeta = JSON.stringify({ create: { _index: APM_INDEX } });
            let ndjson = "";
            for (const doc of batch) {
              ndjson += apmMeta + "\n" + JSON.stringify(doc) + "\n";
            }
            let errDelta = 0;
            try {
              const res = dryRun
                ? dryRunResponse()
                : await fetchWithRetry(`/proxy/_bulk`, { method: "POST", headers, body: ndjson });
              const json = await res.json();
              if (!res.ok) {
                svcErrors += batch.length;
                errDelta = batch.length;
                addLog(
                  `  ✗ batch ${batchNum} failed: ${json.error?.reason || res.status}`,
                  "error"
                );
              } else {
                const failedItems =
                  json.items?.filter((it) => it.create?.error || it.index?.error) || [];
                const errs = failedItems.length;
                svcErrors += errs;
                errDelta = errs;
                svcSent += batch.length - errs;
                if (errs > 0) {
                  const firstErr = failedItems[0]?.create?.error || failedItems[0]?.index?.error;
                  addLog(
                    `  ✗ batch ${batchNum}: ${errs} errors — ${firstErr?.type}: ${firstErr?.reason?.substring(0, 120)}`,
                    "warn"
                  );
                } else {
                  addLog(`  ✓ batch ${batchNum}: ${batch.length} span docs indexed`, "ok");
                }
              }
            } catch (e: unknown) {
              svcErrors += batch.length;
              errDelta = batch.length;
              addLog(`  ✗ network error: ${errMsg(e)}`, "error");
            }
            let tComplete = 0;
            while (tComplete < prefixEnd.length && prefixEnd[tComplete] <= svcSent) {
              tComplete++;
            }
            const currentTraces = Math.min(tracesPerService, tComplete);
            const sentDelta = currentTraces - lastReportedTraces;
            lastReportedTraces = currentTraces;
            progress.add(sentDelta, errDelta);
            if (batchDelayMs > 0) await new Promise((r) => setTimeout(r, batchDelayMs));
          }
          progress.done();
          addLog(`✓ ${svc} complete (${svcSent} span docs for ${tracesPerService} traces)`, "ok");
          return { sent: tracesPerService, errors: svcErrors > 0 ? 1 : 0 };
        };

        const traceResults = await runPool(activeServices, shipTraceService);
        for (const r of traceResults) {
          if (r) {
            totalSent += r.sent;
            totalErrors += r.errors;
          }
        }

        // ── Anomaly injection pass (traces) ────────────────────────────────
        if (injectAnomalies && !abortRef.current) {
          addLog("⚡ Anomaly injection pass — shipping spike traces at current time…", "info");
          const injCount = Math.max(50, Math.round(tracesPerService * 0.3));
          const injEnd = new Date();
          const injStart = new Date(injEnd.getTime() - 5 * 60 * 1000);
          const injWork: { svc: string; docs: LooseDoc[] }[] = [];
          for (const svc of activeServices) {
            if (!TRACE_GENERATORS[svc]) continue;
            const docs = Array.from({ length: injCount }, () =>
              TRACE_GENERATORS[svc](randTs(injStart, injEnd), 1.0).map((d) => {
                const out = enrichDoc(
                  stripNulls(d) as LooseDoc,
                  svc,
                  traceIngestionSource,
                  "traces"
                );
                if (out["transaction.duration.us"]) out["transaction.duration.us"] *= 15;
                if (out["span.duration.us"]) out["span.duration.us"] *= 15;
                return out;
              })
            ).flat();
            injWork.push({ svc, docs });
          }
          const injTotalDocs = injWork.reduce((s, w) => s + w.docs.length, 0);
          if (injWork.length > 0) {
            setProgress({
              phase: "injection",
              sent: 0,
              total: Math.max(1, injTotalDocs),
              errors: 0,
            });
            const injFlush = makeProgressFlusher("injection");
            for (const { svc, docs: injDocs } of injWork) {
              if (abortRef.current) break;
              let injIndexed = 0,
                injErrs = 0;
              for (let i = 0; i < injDocs.length; i += batchSize) {
                if (abortRef.current) break;
                const batch = injDocs.slice(i, i + batchSize);
                const apmMetaInj = JSON.stringify({ create: { _index: APM_INDEX } });
                let ndjsonInj = "";
                for (const doc of batch) {
                  ndjsonInj += apmMetaInj + "\n" + JSON.stringify(doc) + "\n";
                }
                let sentDelta = 0;
                let errDelta = 0;
                try {
                  const res = dryRun
                    ? dryRunResponse()
                    : await fetchWithRetry(`/proxy/_bulk`, {
                        method: "POST",
                        headers,
                        body: ndjsonInj,
                      });
                  const json = await res.json();
                  if (!res.ok) {
                    injErrs += batch.length;
                    errDelta = batch.length;
                    addLog(
                      `  ✗ anomaly injection batch failed (${svc}): ${json.error?.reason || res.status}`,
                      "error"
                    );
                  } else {
                    const bErrs =
                      json.items?.filter((it) => it.create?.error || it.index?.error).length ?? 0;
                    injIndexed += batch.length - bErrs;
                    injErrs += bErrs;
                    sentDelta = batch.length - bErrs;
                    errDelta = bErrs;
                  }
                } catch (e: unknown) {
                  addLog(`  ✗ anomaly injection network error (${svc}): ${errMsg(e)}`, "error");
                  injErrs += batch.length;
                  errDelta = batch.length;
                }
                injFlush.add(sentDelta, errDelta);
              }
              injFlush.done();
              addLog(
                `  ⚡ ${svc}: ${injIndexed} anomaly trace docs injected`,
                injErrs > 0 ? "warn" : "ok"
              );
            }
          }
        }

        setProgress((p) => ({ ...p, phase: "main" }));
        setStatus(abortRef.current ? "aborted" : "done");
        addLog(
          abortRef.current
            ? `Aborted. ${totalSent} traces shipped.`
            : `Done! ${totalSent.toLocaleString()} traces indexed, ${totalErrors} errors.`,
          totalErrors > 0 ? "warn" : "ok"
        );
        return;
      }

      /** ── Logs / Metrics mode ──────────────────────────────────────────────── */
      const GENERATORS = eventType === "logs" ? await config.loadLogGenerators() : null;
      const METRICS_GENERATORS =
        eventType === "metrics" ? await config.loadMetricsGenerators() : null;
      setProgress({ sent: 0, total: 0, errors: 0, phase: "main" });
      addLog(
        `Starting: ${activeServices.length} service(s) [${eventType}] — ${logsPerService.toLocaleString()} calls each`
      );
      let totalSent = 0,
        totalErrors = 0;

      const docCountByIdx: number[] = new Array(activeServices.length);
      const servicesWithIngestionClamp: string[] = [];

      const shipService = async (svc: string, svcIndex: number) => {
        const dataset =
          eventType === "metrics"
            ? (config.elasticMetricsDatasetMap[svc] ??
              config.elasticDatasetMap[svc] ??
              config.fallbackDatasetForService(svc))
            : (config.elasticDatasetMap[svc] ?? config.fallbackDatasetForService(svc));
        const indexName = config.formatBulkIndexName(indexPrefix, dataset);
        const ingestDetail = getIngestionClampDetail(svc);
        if (ingestDetail.clampedFrom) servicesWithIngestionClamp.push(svc);
        const src = ingestDetail.source;
        addLog(`▶ ${svc} → ${indexName} [${config.ingestionMeta[src]?.label || src}]`, "info");
        // In metrics mode, prefer dimensional generators that produce per-resource docs
        const isDimensionalMetrics = METRICS_GENERATORS?.[svc] != null;
        const allDocs = isDimensionalMetrics
          ? Array.from({ length: logsPerService }, () =>
              METRICS_GENERATORS![svc](randTs(startDate, endDate), errorRate)
            )
              .flat()
              .map((d) => stripNulls(d as LooseDoc))
          : Array.from({ length: logsPerService }, () => {
              const result = GENERATORS![svc](randTs(startDate, endDate), errorRate);
              if (Array.isArray(result)) {
                return result.map((d) => stripNulls(d as LooseDoc));
              }
              return [stripNulls(enrichDoc(result as LooseDoc, svc, src, eventType))];
            }).flat();
        docCountByIdx[svcIndex] = allDocs.length;
        setProgress((prev) => {
          const t = docCountByIdx.reduce((s, x) => s + (typeof x === "number" ? x : 0), 0);
          return { ...prev, phase: "main", total: t };
        });
        const svcProgress = makeProgressFlusher("main");
        let svcSent = 0,
          svcErrors = 0,
          batchNum = 0;
        for (let i = 0; i < allDocs.length; i += batchSize) {
          if (abortRef.current) break;
          batchNum++;
          const batch = allDocs.slice(i, i + batchSize);
          let ndjson = "";
          for (const doc of batch) {
            const { __dataset, ...cleanDoc } = doc as LooseDoc;
            const idx = __dataset
              ? config.formatDocDatasetIndex(indexPrefix, __dataset)
              : indexName;
            ndjson +=
              JSON.stringify({ create: { _index: idx } }) + "\n" + JSON.stringify(cleanDoc) + "\n";
          }
          let sentDelta = 0;
          let errDelta = 0;
          try {
            const res = dryRun
              ? dryRunResponse()
              : await fetchWithRetry(`/proxy/_bulk`, { method: "POST", headers, body: ndjson });
            const json = await res.json();
            if (!res.ok) {
              svcErrors += batch.length;
              errDelta = batch.length;
              addLog(`  ✗ batch ${batchNum} failed: ${json.error?.reason || res.status}`, "error");
            } else {
              const failedItems =
                json.items?.filter((i) => i.create?.error || i.index?.error) || [];
              const conflictItems = failedItems.filter(
                (i) =>
                  (i.create?.error?.type || i.index?.error?.type) ===
                  "version_conflict_engine_exception"
              );
              const realErrors = failedItems.filter(
                (i) =>
                  (i.create?.error?.type || i.index?.error?.type) !==
                  "version_conflict_engine_exception"
              );
              const conflicts = conflictItems.length;
              const errs = realErrors.length;
              svcErrors += errs;
              errDelta = errs;
              sentDelta = batch.length - errs - conflicts;
              svcSent += sentDelta;
              if (errs > 0) {
                const firstErr = realErrors[0]?.create?.error || realErrors[0]?.index?.error;
                addLog(
                  `  ✗ batch ${batchNum}: ${errs} errors — ${firstErr?.type}: ${firstErr?.reason?.substring(0, 120)}`,
                  "warn"
                );
              } else if (conflicts > 0) {
                addLog(
                  `  ↷ batch ${batchNum}: ${batch.length - conflicts} indexed, ${conflicts} skipped (already exists)`,
                  "ok"
                );
              } else {
                addLog(`  ✓ batch ${batchNum}: ${batch.length} indexed`, "ok");
              }
            }
          } catch (e: unknown) {
            svcErrors += batch.length;
            errDelta = batch.length;
            addLog(`  ✗ network error: ${errMsg(e)}`, "error");
          }
          svcProgress.add(sentDelta, errDelta);
          if (batchDelayMs > 0) await new Promise((r) => setTimeout(r, batchDelayMs));
        }
        svcProgress.done();
        addLog(`✓ ${svc} complete`, "ok");
        return { sent: svcSent, errors: svcErrors };
      };

      const svcResults = await runPool(activeServices, shipService);
      for (const r of svcResults) {
        if (r) {
          totalSent += r.sent;
          totalErrors += r.errors;
        }
      }

      if (servicesWithIngestionClamp.length > 0) {
        addLog(
          `Ingestion: global override was adjusted to per-service defaults for: ${[...new Set(servicesWithIngestionClamp)].join(", ")}.`,
          "warn"
        );
      }

      // ── Anomaly injection pass (logs / metrics) ──────────────────────────
      if (injectAnomalies && !abortRef.current) {
        addLog("⚡ Anomaly injection pass — shipping spike events at current time…", "info");
        const injCount = Math.max(50, Math.round(logsPerService * 0.3));
        const injEnd = new Date();
        const injStart = new Date(injEnd.getTime() - 5 * 60 * 1000);
        const injWork: { svc: string; indexName: string; docs: LooseDoc[] }[] = [];
        for (const svc of activeServices) {
          const dataset =
            eventType === "metrics"
              ? (config.elasticMetricsDatasetMap[svc] ??
                config.elasticDatasetMap[svc] ??
                config.fallbackDatasetForService(svc))
              : (config.elasticDatasetMap[svc] ?? config.fallbackDatasetForService(svc));
          const indexName = config.formatBulkIndexName(indexPrefix, dataset);
          const isDimensional = METRICS_GENERATORS?.[svc] != null;
          let injDocs: LooseDoc[] | undefined;
          if (isDimensional) {
            injDocs = Array.from({ length: injCount }, () => {
              const docs = METRICS_GENERATORS![svc](randTs(injStart, injEnd), 1.0);
              return (Array.isArray(docs) ? docs : [docs]).map((d) => {
                const out = stripNulls(d) as LooseDoc;
                for (const [k, v] of Object.entries(out)) {
                  if (typeof v === "number" && !k.startsWith("@") && k !== "_doc_count") {
                    out[k] = v * 20;
                  }
                }
                return out;
              });
            }).flat() as LooseDoc[];
          } else if (GENERATORS?.[svc]) {
            injDocs = Array.from({ length: injCount }, () => {
              const result = GENERATORS![svc](randTs(injStart, injEnd), 1.0);
              return (
                Array.isArray(result)
                  ? result
                  : [
                      stripNulls(
                        enrichDoc(result as LooseDoc, svc, getEffectiveSource(svc), eventType)
                      ),
                    ]
              ).map((d) => stripNulls(d as LooseDoc));
            }).flat() as LooseDoc[];
          }
          if (injDocs?.length) injWork.push({ svc, indexName, docs: injDocs });
        }
        const injTotalDocs = injWork.reduce((s, w) => s + w.docs.length, 0);
        if (injWork.length > 0) {
          setProgress({
            phase: "injection",
            sent: 0,
            total: Math.max(1, injTotalDocs),
            errors: 0,
          });
          const injFlush = makeProgressFlusher("injection");
          for (const { svc, indexName, docs: injDocs } of injWork) {
            if (abortRef.current) break;
            let injIndexed = 0,
              injRealErrs = 0;
            for (let i = 0; i < injDocs.length; i += batchSize) {
              if (abortRef.current) break;
              const batch = injDocs.slice(i, i + batchSize);
              let ndjsonInj = "";
              for (const doc of batch) {
                const { __dataset, ...cleanDoc } = doc;
                const idx = __dataset
                  ? config.formatDocDatasetIndex(indexPrefix, __dataset)
                  : indexName;
                ndjsonInj +=
                  JSON.stringify({ create: { _index: idx } }) +
                  "\n" +
                  JSON.stringify(cleanDoc) +
                  "\n";
              }
              let sentDelta = 0;
              let errDelta = 0;
              try {
                const res = dryRun
                  ? dryRunResponse()
                  : await fetchWithRetry(`/proxy/_bulk`, {
                      method: "POST",
                      headers,
                      body: ndjsonInj,
                    });
                const json = await res.json();
                if (!res.ok) {
                  injRealErrs += batch.length;
                  errDelta = batch.length;
                  addLog(
                    `  ✗ anomaly injection batch failed (${svc}): ${json.error?.reason || res.status}`,
                    "error"
                  );
                } else {
                  const failedInj =
                    json.items?.filter((it) => it.create?.error || it.index?.error) || [];
                  const conflictInj = failedInj.filter(
                    (it) =>
                      (it.create?.error?.type || it.index?.error?.type) ===
                      "version_conflict_engine_exception"
                  );
                  const realErrInj = failedInj.filter(
                    (it) =>
                      (it.create?.error?.type || it.index?.error?.type) !==
                      "version_conflict_engine_exception"
                  );
                  const conflicts = conflictInj.length;
                  const errs = realErrInj.length;
                  injIndexed += batch.length - errs - conflicts;
                  injRealErrs += errs;
                  sentDelta = batch.length - errs - conflicts;
                  errDelta = errs;
                }
              } catch (e: unknown) {
                addLog(`  ✗ anomaly injection network error (${svc}): ${errMsg(e)}`, "error");
                injRealErrs += batch.length;
                errDelta = batch.length;
              }
              injFlush.add(sentDelta, errDelta);
            }
            injFlush.done();
            addLog(
              `  ⚡ ${svc}: ${injIndexed} anomaly docs injected${injRealErrs > 0 ? `, ${injRealErrs} errors` : ""}`,
              injRealErrs > 0 ? "warn" : "ok"
            );
          }
        }
      }

      setProgress((p) => ({ ...p, phase: "main" }));
      setStatus(abortRef.current ? "aborted" : "done");
      addLog(
        abortRef.current
          ? `Aborted. ${totalSent} shipped.`
          : `Done! ${totalSent.toLocaleString()} indexed, ${totalErrors} errors.`,
        totalErrors > 0 ? "warn" : "ok"
      );
    } catch (fatal: unknown) {
      setProgress((p) => ({ ...p, phase: "main" }));
      setStatus("done");
      addLog(`Fatal error: ${errMsg(fatal)}`, "error");
      console.error("Ship error:", fatal);
    }
    // indexPrefix already reflects logs vs metrics; enrichDoc is stable ([] deps).
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
    setActivePage("connection");
  }, []);

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
      onNavigate={setActivePage}
      footer={
        <WizardFooter
          activePage={activePage}
          onNavigate={setActivePage}
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
      {activePage === "welcome" && (
        <LandingPage
          isUnifiedCloud={!!unifiedMode}
          onGetStarted={() => setActivePage("connection")}
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
    </AppLayout>
  );
}
