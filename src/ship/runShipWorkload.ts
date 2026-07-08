import { randTs, stripNulls } from "../helpers";
import { dryRunResponse, errMsg, fetchWithRetry } from "./bulk";
import { apmDocsToOtlp } from "./otlpTraces";
import type { LooseDoc, RunShipWorkloadDeps, ShipProgressPhase } from "./types";

type BulkRespItem = {
  create?: { error?: { type?: string; reason?: string } };
  index?: { error?: { type?: string; reason?: string } };
};

/**
 * Elastic Cloud (especially Serverless) rejects bulk bodies above ~10 MB.
 * Cap well below that to leave headroom for gzip overhead and metadata.
 */
const MAX_NDJSON_BYTES = 5 * 1024 * 1024;

/**
 * Split a document array into sub-batches whose serialized NDJSON stays
 * under MAX_NDJSON_BYTES. Each doc is measured as action-line + doc-line.
 */
function splitBySize(docs: LooseDoc[], makeActionLine: (doc: LooseDoc) => string): LooseDoc[][] {
  const batches: LooseDoc[][] = [];
  let current: LooseDoc[] = [];
  let currentBytes = 0;

  for (const doc of docs) {
    const action = makeActionLine(doc);
    const body = JSON.stringify(doc);
    const docBytes = action.length + 1 + body.length + 1;
    if (current.length > 0 && currentBytes + docBytes > MAX_NDJSON_BYTES) {
      batches.push(current);
      current = [];
      currentBytes = 0;
    }
    current.push(doc);
    currentBytes += docBytes;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/**
 * Walk a log document and multiply any field ending in `_ms`, `_us`, `_sec`,
 * `duration`, `execution_time_ms`, `total_time`, or `turn_around_time` by
 * the given factor. This makes duration-based ML detectors (high_mean) fire
 * during the anomaly injection window.
 */
function scaleLogDurationFields(doc: LooseDoc, factor: number): void {
  const DURATION_SUFFIXES = [
    "_ms",
    "_us",
    "_sec",
    "duration",
    "total_time",
    "turn_around_time",
    "execution_time",
  ];
  const walk = (obj: Record<string, unknown>) => {
    for (const [key, val] of Object.entries(obj)) {
      if (typeof val === "number" && DURATION_SUFFIXES.some((s) => key.endsWith(s) || key === s)) {
        obj[key] = Math.round(val * factor);
      } else if (val && typeof val === "object" && !Array.isArray(val)) {
        walk(val as Record<string, unknown>);
      }
    }
  };
  walk(doc);
}

export async function runShipWorkload(deps: RunShipWorkloadDeps): Promise<void> {
  const {
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
    otlpWireMode,
    apmEndpointUrl,
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
  } = deps;

  // `activeServices` may include chain scenarios (multi-signal), which are pulled
  // out and handled by a dedicated self-routing pass inside the run (see below).
  let activeServices = isTracesMode ? selectedTraceServices : selectedServices;
  if (!activeServices.length) {
    addLog("No services selected", "error");
    return;
  }
  if (!dryRun && !runConnectionValidation()) {
    addLog("Fix connection field errors before shipping.", "error");
    return;
  }
  abortRef.current = false;

  const CONCURRENCY = 4;
  const runPool = async <T>(
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
    const windowMs = eventType === "metrics" ? 10 * 60 * 1000 : 1800000;

    const freshTimeRange = () => {
      const end = new Date();
      return { startDate: new Date(end.getTime() - windowMs), endDate: end };
    };

    const { startDate, endDate } = freshTimeRange();

    // ── Chain scenario pass (multi-signal, tab-independent) ──────────────────
    // A chain scenario emits a correlated mix of logs, metrics, and traces in a
    // single run. Whichever tab (Logs/Metrics/Traces) the user is on, selecting
    // a chain lights up all of its signals — each doc is enriched and routed by
    // its OWN signal type (logs-*, metrics-*, traces-apm) rather than the run's
    // event type. Chains live in the logs generator map for every cloud; we key
    // off that (not just the "-chain" suffix) so trace-only workflows such as
    // "openai-chain" are left to the normal trace path.
    const scenarioCandidates = activeServices.filter((s) => s.endsWith("-chain"));
    const scenarioGens = scenarioCandidates.length ? await config.loadLogGenerators() : null;
    const scenarioServices = scenarioGens
      ? scenarioCandidates.filter((s) => typeof scenarioGens[s] === "function")
      : [];
    if (scenarioServices.length && scenarioGens) {
      activeServices = activeServices.filter((s) => !scenarioServices.includes(s));
      const scenarioCount = isTracesMode ? tracesPerService : logsPerService;
      // Metric docs carry a fully-qualified `metrics-*` __dataset (prefix-independent);
      // trace docs route to traces-apm. Only log docs need a logs prefix — respect the
      // user's configured logs prefix except in metrics mode, where it isn't the run prefix.
      const scenarioLogsPrefix =
        eventType === "metrics" ? config.defaultLogsIndexPrefix : indexPrefix;

      const docSignal = (doc: LooseDoc): "logs" | "metrics" | "traces" => {
        const ds = typeof doc.__dataset === "string" ? doc.__dataset : "";
        const t = (doc.data_stream as { type?: string } | undefined)?.type;
        if (ds === "apm" || ds.startsWith("traces-") || t === "traces") return "traces";
        if (ds.startsWith("metrics-") || t === "metrics") return "metrics";
        return "logs";
      };
      const scenarioIndexFor = (doc: LooseDoc): string => {
        const sig = docSignal(doc);
        const prefix = sig === "metrics" ? config.defaultMetricsIndexPrefix : scenarioLogsPrefix;
        const routeDs =
          (typeof doc.__dataset === "string" && doc.__dataset) ||
          (doc.data_stream as { dataset?: string } | undefined)?.dataset ||
          (doc.event as { dataset?: string } | undefined)?.dataset ||
          "unknown";
        return config.formatDocDatasetIndex(prefix, routeDs);
      };

      setProgress({ sent: 0, total: 0, errors: 0, phase: "main" });
      let scenSent = 0;
      let scenErrors = 0;
      const shipScenarioBatch = async (batch: LooseDoc[]) => {
        if (!batch.length || abortRef.current) return;
        const subBatches = splitBySize(batch, (d) =>
          JSON.stringify({ create: { _index: scenarioIndexFor(d) } })
        );
        for (const sub of subBatches) {
          if (abortRef.current) return;
          const parts: string[] = [];
          for (const d of sub) {
            parts.push(
              JSON.stringify({ create: { _index: scenarioIndexFor(d) } }),
              "\n",
              JSON.stringify(d),
              "\n"
            );
          }
          let sentDelta = 0;
          let errDelta = 0;
          try {
            const res = dryRun
              ? dryRunResponse()
              : await fetchWithRetry(`/proxy/_bulk`, {
                  method: "POST",
                  headers,
                  body: parts.join(""),
                });
            const json = (await res.json()) as {
              error?: { reason?: string };
              items?: BulkRespItem[];
            };
            if (!res.ok) {
              errDelta = sub.length;
              addLog(`  ✗ scenario batch rejected: ${json.error?.reason || res.status}`, "warn");
            } else {
              const failed = json.items?.filter((it) => it.create?.error || it.index?.error) || [];
              errDelta = failed.length;
              sentDelta = sub.length - failed.length;
            }
          } catch (e: unknown) {
            errDelta = sub.length;
            addLog(`  ✗ scenario network error: ${errMsg(e)}`, "error");
          }
          scenSent += sentDelta;
          scenErrors += errDelta;
          setProgress((p) => ({
            ...p,
            total: Math.max(p.total, p.sent + sentDelta + errDelta),
            sent: p.sent + sentDelta,
            errors: p.errors + errDelta,
          }));
          if (batchDelayMs > 0) await new Promise((r) => setTimeout(r, batchDelayMs));
        }
      };

      for (const svc of scenarioServices) {
        if (abortRef.current) break;
        const gen = scenarioGens[svc];
        if (!gen) {
          addLog(`Scenario "${svc}" not found — skipping`, "warn");
          continue;
        }
        addLog(
          `▶ scenario ${svc} → correlated logs + metrics + traces (${scenarioCount} run(s))`,
          "info"
        );
        const pending: LooseDoc[] = [];
        for (let i = 0; i < scenarioCount; i++) {
          if (abortRef.current) break;
          const raw = gen(randTs(startDate, endDate), errorRate);
          const arr = Array.isArray(raw) ? raw : [raw];
          for (const d of arr) {
            const sig = docSignal(d as LooseDoc);
            const src = sig === "traces" ? traceIngestionSource : getEffectiveSource(svc);
            const enriched = enrichDoc(d as LooseDoc, svc, src, sig) as LooseDoc;
            stripNulls(enriched);
            pending.push(enriched);
            if (pending.length >= batchSize) {
              await shipScenarioBatch(pending.splice(0, batchSize));
            }
          }
        }
        while (pending.length > 0 && !abortRef.current) {
          await shipScenarioBatch(pending.splice(0, batchSize));
        }
      }
      addLog(
        `✓ scenario pass complete — ${scenSent.toLocaleString()} docs indexed${scenErrors ? `, ${scenErrors} errors` : ""}`,
        scenErrors ? "warn" : "ok"
      );

      if (!activeServices.length) {
        setStatus(abortRef.current ? "aborted" : "done");
        addLog(
          abortRef.current
            ? `Aborted. ${scenSent.toLocaleString()} scenario docs shipped.`
            : `Done! ${scenSent.toLocaleString()} scenario docs indexed, ${scenErrors} errors.`,
          scenErrors > 0 ? "warn" : "ok"
        );
        return;
      }
    }

    if (isTracesMode) {
      const TRACE_GENERATORS = await config.loadTraceGenerators();
      const APM_INDEX = "traces-apm-default";
      // Real OTLP wire mode: POST OTLP/HTTP JSON to <apm-endpoint>/v1/traces via the
      // proxy passthrough, instead of ES-bulk-indexing APM-schema docs into traces-apm-*.
      if (otlpWireMode && !apmEndpointUrl.trim()) {
        addLog(
          "OTLP wire mode is enabled but no APM/OTLP endpoint URL is set — add it on the Start page.",
          "error"
        );
        setStatus("done");
        return;
      }
      const otlpWire = otlpWireMode && !!apmEndpointUrl.trim();
      const otlpBase = (apmEndpointUrl || "").replace(/\/$/, "");
      const otlpHeaders = {
        "Content-Type": "application/json",
        "x-elastic-url": otlpBase,
        "x-elastic-key": apiKey,
        "x-elastic-path": "/v1/traces",
        "x-elastic-method": "POST",
      };
      const traceTarget = otlpWire ? `${otlpBase}/v1/traces` : APM_INDEX;

      /**
       * Ship one batch of span/transaction docs. In OTLP wire mode the batch is
       * converted to an ExportTraceServiceRequest and POSTed to /v1/traces; the
       * APM/OTLP intake reports rejections via `partialSuccess.rejectedSpans`.
       * Otherwise docs are ES-bulk-indexed. Returns errored-doc count + a sample.
       */
      const shipSpanDocs = async (
        batch: LooseDoc[],
        metaLine: string
      ): Promise<{ errors: number; reason?: string }> => {
        if (!batch.length) return { errors: 0 };
        if (otlpWire) {
          const res = dryRun
            ? dryRunResponse()
            : await fetchWithRetry(`/proxy`, {
                method: "POST",
                headers: otlpHeaders,
                body: JSON.stringify(apmDocsToOtlp(batch)),
              });
          const json = (await res.json()) as {
            error?: { reason?: string } | string;
            partialSuccess?: { rejectedSpans?: number | string; errorMessage?: string };
          };
          if (!res.ok) {
            const reason =
              typeof json.error === "string"
                ? json.error
                : json.error?.reason || `HTTP ${res.status}`;
            return { errors: batch.length, reason };
          }
          const rejected = Number(json.partialSuccess?.rejectedSpans ?? 0) || 0;
          return rejected > 0
            ? { errors: rejected, reason: json.partialSuccess?.errorMessage }
            : { errors: 0 };
        }
        const ndjsonParts: string[] = [];
        for (const doc of batch) ndjsonParts.push(metaLine, "\n", JSON.stringify(doc), "\n");
        const res = dryRun
          ? dryRunResponse()
          : await fetchWithRetry(`/proxy/_bulk`, {
              method: "POST",
              headers,
              body: ndjsonParts.join(""),
            });
        const json = (await res.json()) as { error?: { reason?: string }; items?: BulkRespItem[] };
        if (!res.ok)
          return { errors: batch.length, reason: json.error?.reason || String(res.status) };
        const failedItems =
          json.items?.filter((it: BulkRespItem) => it.create?.error || it.index?.error) || [];
        const firstErr = failedItems[0]?.create?.error || failedItems[0]?.index?.error;
        return failedItems.length > 0
          ? {
              errors: failedItems.length,
              reason: firstErr ? `${firstErr.type}: ${firstErr.reason}` : undefined,
            }
          : { errors: 0 };
      };

      const totalTraces = activeServices.length * tracesPerService;
      setProgress({ sent: 0, total: totalTraces, errors: 0, phase: "main" });
      addLog(
        `Starting: ${totalTraces.toLocaleString()} traces across ${activeServices.length} service(s) → ${traceTarget}${otlpWire ? " [real OTLP wire]" : ""}`
      );
      let totalSent = 0,
        totalErrors = 0;

      const shipTraceService = async (svc: string, _svcIndex: number) => {
        addLog(
          `▶ ${svc} → ${traceTarget} [${otlpWire ? "OTLP /v1/traces" : "OTel / _bulk"}]`,
          "info"
        );
        const prefixEnd: number[] = [];
        let traceAccDocs = 0;
        const pendingDocs: LooseDoc[] = [];

        const progress = makeProgressFlusher("main");
        let svcSent = 0,
          svcErrors = 0,
          batchNum = 0,
          lastReportedTraces = 0;

        const apmMeta = JSON.stringify({ create: { _index: APM_INDEX } });

        const shipTraceBatch = async (batch: LooseDoc[]) => {
          if (!batch.length) return;
          const subs = splitBySize(batch, () => apmMeta);
          for (const sub of subs) {
            if (abortRef.current) return;
            await shipTraceSubBatch(sub);
          }
        };

        const shipTraceSubBatch = async (batch: LooseDoc[]) => {
          if (!batch.length || abortRef.current) return;
          batchNum++;
          let errDelta = 0;
          try {
            const { errors: errs, reason } = await shipSpanDocs(batch, apmMeta);
            svcErrors += errs;
            errDelta = errs;
            svcSent += batch.length - errs;
            if (errs > 0) {
              addLog(
                `  ✗ batch ${batchNum}: ${errs} errors — ${reason?.substring(0, 140) || "rejected"}`,
                "warn"
              );
            } else {
              addLog(
                `  ✓ batch ${batchNum}: ${batch.length} span docs ${otlpWire ? "accepted (OTLP)" : "indexed"}`,
                "ok"
              );
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
        };

        for (let traceIdx = 0; traceIdx < tracesPerService; traceIdx++) {
          if (abortRef.current) break;
          const rawChunk = TRACE_GENERATORS[svc](randTs(startDate, endDate), errorRate);
          traceAccDocs += rawChunk.length;
          prefixEnd.push(traceAccDocs);
          for (const d of rawChunk) {
            stripNulls(d);
            pendingDocs.push(enrichDoc(d as LooseDoc, svc, traceIngestionSource, "traces"));
            while (pendingDocs.length >= batchSize) {
              const batch = pendingDocs.splice(0, batchSize);
              await shipTraceBatch(batch);
            }
          }
        }
        while (pendingDocs.length > 0 && !abortRef.current) {
          const batch = pendingDocs.splice(0, batchSize);
          await shipTraceBatch(batch);
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
              stripNulls(d);
              const out = enrichDoc(d as LooseDoc, svc, traceIngestionSource, "traces");
              if (out["transaction.duration.us"]) out["transaction.duration.us"] *= 15;
              if (out["span.duration.us"]) out["span.duration.us"] *= 15;
              return out;
            })
          ).flat();
          injWork.push({ svc, docs });
        }
        const injTotalDocs = injWork.reduce((s, w) => s + w.docs.length, 0);
        if (injWork.length > 0) {
          setProgress((prev) => ({
            phase: "injection",
            sent: prev.sent,
            total: prev.total + injTotalDocs,
            errors: prev.errors,
          }));
          const injFlush = makeProgressFlusher("injection");
          for (const { svc, docs: injDocs } of injWork) {
            if (abortRef.current) break;
            let injIndexed = 0,
              injErrs = 0;
            const apmMetaInj = JSON.stringify({ create: { _index: APM_INDEX } });
            const traceInjSubBatches = splitBySize(injDocs, () => apmMetaInj);
            for (const batch of traceInjSubBatches) {
              if (abortRef.current) break;
              let sentDelta = 0;
              let errDelta = 0;
              try {
                const { errors: bErrs, reason } = await shipSpanDocs(batch, apmMetaInj);
                injIndexed += batch.length - bErrs;
                injErrs += bErrs;
                sentDelta = batch.length - bErrs;
                errDelta = bErrs;
                if (bErrs > 0) {
                  addLog(
                    `  ✗ anomaly injection (${svc}): ${bErrs} errors — ${reason?.substring(0, 140) || "rejected"}`,
                    "warn"
                  );
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

    const GENERATORS = eventType === "logs" ? await config.loadLogGenerators() : null;
    const METRICS_GENERATORS =
      eventType === "metrics" ? await config.loadMetricsGenerators() : null;
    setProgress({ sent: 0, total: 0, errors: 0, phase: "main" });
    addLog(
      `Starting: ${activeServices.length} service(s) [${eventType}] — ${logsPerService.toLocaleString()} calls each`
    );
    let totalSent = 0,
      totalErrors = 0;

    const REFERENCE_DATA_CAPS: Record<string, number> = {
      servicenow_cmdb: 50,
    };

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
      const isDimensionalMetrics = METRICS_GENERATORS?.[svc] != null;
      const svcDocCount = REFERENCE_DATA_CAPS[svc]
        ? Math.min(logsPerService, REFERENCE_DATA_CAPS[svc])
        : logsPerService;

      /** Documents accumulated for the next bulk request (max batchSize). */
      const pendingBulkDocs: LooseDoc[] = [];

      let cumulativeDocsProcessed = 0;
      docCountByIdx[svcIndex] = 0;

      const refreshProgressTotal = () => {
        docCountByIdx[svcIndex] = cumulativeDocsProcessed;
        setProgress((prev) => {
          const t = docCountByIdx.reduce((s, x) => s + (typeof x === "number" ? x : 0), 0);
          return { ...prev, phase: "main", total: t };
        });
      };

      const svcProgress = makeProgressFlusher("main");
      let svcSent = 0,
        svcErrors = 0,
        batchNum = 0;

      const flushDocBatch = async (batch: LooseDoc[]) => {
        if (!batch.length) return;
        if (abortRef.current) return;

        const subBatches = splitBySize(batch, (doc) => {
          const { __dataset } = doc as LooseDoc;
          const idx = __dataset ? config.formatDocDatasetIndex(indexPrefix, __dataset) : indexName;
          return JSON.stringify({ create: { _index: idx } });
        });

        for (const sub of subBatches) {
          if (abortRef.current) return;
          await flushDocSubBatch(sub);
        }
      };

      const flushDocSubBatch = async (batch: LooseDoc[]): Promise<void> => {
        if (!batch.length || abortRef.current) return;
        batchNum++;
        const ndjsonParts: string[] = [];
        for (const doc of batch) {
          const { __dataset, ...cleanDoc } = doc as LooseDoc;
          const idx = __dataset ? config.formatDocDatasetIndex(indexPrefix, __dataset) : indexName;
          ndjsonParts.push(
            JSON.stringify({ create: { _index: idx } }),
            "\n",
            JSON.stringify(cleanDoc),
            "\n"
          );
        }
        const ndjson = ndjsonParts.join("");
        let sentDelta = 0;
        let errDelta = 0;
        try {
          const res = dryRun
            ? dryRunResponse()
            : await fetchWithRetry(`/proxy/_bulk`, { method: "POST", headers, body: ndjson });
          const json = (await res.json()) as {
            error?: { reason?: string };
            items?: BulkRespItem[];
          };
          if (!res.ok) {
            svcErrors += batch.length;
            errDelta = batch.length;
            addLog(`  ✗ batch ${batchNum} failed: ${json.error?.reason || res.status}`, "error");
          } else {
            const failedItems =
              json.items?.filter((it: BulkRespItem) => it.create?.error || it.index?.error) || [];
            const conflictItems = failedItems.filter(
              (it: BulkRespItem) =>
                (it.create?.error?.type || it.index?.error?.type) ===
                "version_conflict_engine_exception"
            );
            const realErrors = failedItems.filter(
              (it: BulkRespItem) =>
                (it.create?.error?.type || it.index?.error?.type) !==
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
          const msg = errMsg(e);
          if (msg.includes("413") && batch.length > 1) {
            addLog(`  ⚠ batch too large (${batch.length} docs) — halving and retrying`, "warn");
            const mid = Math.ceil(batch.length / 2);
            await flushDocSubBatch(batch.slice(0, mid));
            await flushDocSubBatch(batch.slice(mid));
            return;
          }
          svcErrors += batch.length;
          errDelta = batch.length;
          addLog(`  ✗ network error: ${msg}`, "error");
        }
        svcProgress.add(sentDelta, errDelta);
        if (batchDelayMs > 0) await new Promise((r) => setTimeout(r, batchDelayMs));
      };

      const pushPreparedDoc = async (doc: LooseDoc) => {
        pendingBulkDocs.push(doc);
        cumulativeDocsProcessed++;
        if (pendingBulkDocs.length >= batchSize) {
          const batch = pendingBulkDocs.splice(0, batchSize);
          refreshProgressTotal();
          await flushDocBatch(batch);
        }
      };
      const svcTime = freshTimeRange();
      invocationLoop: for (let docOffset = 0; docOffset < svcDocCount; docOffset++) {
        if (abortRef.current) break invocationLoop;
        if (isDimensionalMetrics) {
          const raw = METRICS_GENERATORS![svc](
            randTs(svcTime.startDate, svcTime.endDate),
            errorRate
          );
          const docs = Array.isArray(raw) ? raw : [raw];
          for (const d of docs) {
            if (abortRef.current) break invocationLoop;
            stripNulls(d as LooseDoc);
            await pushPreparedDoc(d as LooseDoc);
          }
        } else {
          const result = GENERATORS![svc](randTs(svcTime.startDate, svcTime.endDate), errorRate);
          if (Array.isArray(result)) {
            for (const d of result) {
              if (abortRef.current) break invocationLoop;
              const enriched = enrichDoc(d as LooseDoc, svc, src, eventType);
              stripNulls(enriched);
              await pushPreparedDoc(enriched as LooseDoc);
            }
          } else {
            const enriched = enrichDoc(result as LooseDoc, svc, src, eventType);
            stripNulls(enriched);
            await pushPreparedDoc(enriched as LooseDoc);
          }
        }
      }

      refreshProgressTotal();
      while (pendingBulkDocs.length > 0 && !abortRef.current) {
        const batch = pendingBulkDocs.splice(0, batchSize);
        await flushDocBatch(batch);
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

    // ── Companion APM traces for services with native OTel instrumentation ──
    const TRACE_CAPABLE_SERVICES = ["lambda", "emr"];
    const traceEligible = activeServices.filter((s) => TRACE_CAPABLE_SERVICES.includes(s));
    if (traceEligible.length > 0 && !abortRef.current) {
      const TRACE_GENERATORS = await config.loadTraceGenerators();
      const APM_INDEX = "traces-apm-default";
      const traceCount = Math.max(20, Math.round(logsPerService * 0.15));
      addLog(`🔗 Shipping companion APM traces for ${traceEligible.join(", ")} → ${APM_INDEX}`);
      const shipCompanionTrace = async (
        svc: string,
        _i: number
      ): Promise<{ traceSent: number; traceErrs: number }> => {
        if (abortRef.current) return { traceSent: 0, traceErrs: 0 };
        if (!TRACE_GENERATORS[svc]) return { traceSent: 0, traceErrs: 0 };
        const traceDocs = Array.from({ length: traceCount }, () =>
          TRACE_GENERATORS[svc](randTs(startDate, endDate), errorRate).map((d) => {
            stripNulls(d);
            return enrichDoc(d as LooseDoc, svc, "otel", "traces");
          })
        ).flat();
        const apmMeta = JSON.stringify({ create: { _index: APM_INDEX } });
        let traceSent = 0,
          traceErrs = 0;
        const traceSubBatches = splitBySize(traceDocs, () => apmMeta);
        for (const batch of traceSubBatches) {
          if (abortRef.current) break;
          const ndjsonParts: string[] = [];
          for (const doc of batch) {
            ndjsonParts.push(apmMeta, "\n", JSON.stringify(doc), "\n");
          }
          const ndjson = ndjsonParts.join("");
          try {
            const res = dryRun
              ? dryRunResponse()
              : await fetchWithRetry(`/proxy/_bulk`, { method: "POST", headers, body: ndjson });
            const json = (await res.json()) as {
              error?: { reason?: string };
              items?: BulkRespItem[];
            };
            if (!res.ok) {
              traceErrs += batch.length;
            } else {
              const errs =
                json.items?.filter((it: BulkRespItem) => it.create?.error || it.index?.error)
                  .length ?? 0;
              traceSent += batch.length - errs;
              traceErrs += errs;
            }
          } catch {
            traceErrs += batch.length;
          }
        }
        addLog(
          `  ✓ ${svc} APM traces: ${traceSent} docs → ${APM_INDEX}`,
          traceErrs > 0 ? "warn" : "ok"
        );
        return { traceSent, traceErrs };
      };
      const companionResults = await runPool(traceEligible, shipCompanionTrace);
      for (const r of companionResults) {
        totalSent += r.traceSent;
        totalErrors += r.traceErrs;
      }
    }

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
              stripNulls(d as LooseDoc);
              const out = d as LooseDoc;
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
                : (() => {
                    const enriched = enrichDoc(
                      result as LooseDoc,
                      svc,
                      getEffectiveSource(svc),
                      eventType
                    );
                    stripNulls(enriched);
                    return [enriched];
                  })()
            ).map((d: unknown) => {
              const out = d as LooseDoc;
              stripNulls(out);
              scaleLogDurationFields(out, 15);
              return out;
            });
          }).flat() as LooseDoc[];
        }
        if (injDocs?.length) injWork.push({ svc, indexName, docs: injDocs });
      }
      const injTotalDocs = injWork.reduce((s, w) => s + w.docs.length, 0);
      if (injWork.length > 0) {
        setProgress((prev) => ({
          phase: "injection",
          sent: prev.sent,
          total: prev.total + injTotalDocs,
          errors: prev.errors,
        }));
        const injFlush = makeProgressFlusher("injection");
        for (const { svc, indexName, docs: injDocs } of injWork) {
          if (abortRef.current) break;
          let injIndexed = 0,
            injRealErrs = 0;
          const injSubBatches = splitBySize(injDocs, (doc) => {
            const { __dataset } = doc;
            const idx = __dataset
              ? config.formatDocDatasetIndex(indexPrefix, __dataset)
              : indexName;
            return JSON.stringify({ create: { _index: idx } });
          });
          for (const batch of injSubBatches) {
            if (abortRef.current) break;
            const ndjsonPartsInj: string[] = [];
            for (const doc of batch) {
              const { __dataset, ...cleanDoc } = doc;
              const idx = __dataset
                ? config.formatDocDatasetIndex(indexPrefix, __dataset)
                : indexName;
              ndjsonPartsInj.push(
                JSON.stringify({ create: { _index: idx } }),
                "\n",
                JSON.stringify(cleanDoc),
                "\n"
              );
            }
            const ndjsonInj = ndjsonPartsInj.join("");
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
              const json = (await res.json()) as {
                error?: { reason?: string };
                items?: BulkRespItem[];
              };
              if (!res.ok) {
                injRealErrs += batch.length;
                errDelta = batch.length;
                addLog(
                  `  ✗ anomaly injection batch failed (${svc}): ${json.error?.reason || res.status}`,
                  "error"
                );
              } else {
                const failedInj =
                  json.items?.filter((it: BulkRespItem) => it.create?.error || it.index?.error) ||
                  [];
                const conflictInj = failedInj.filter(
                  (it: BulkRespItem) =>
                    (it.create?.error?.type || it.index?.error?.type) ===
                    "version_conflict_engine_exception"
                );
                const realErrInj = failedInj.filter(
                  (it: BulkRespItem) =>
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
}
