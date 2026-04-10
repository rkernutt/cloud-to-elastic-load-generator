import { randTs, stripNulls } from "../helpers";
import { dryRunResponse, errMsg, fetchWithRetry } from "./bulk";
import type { LooseDoc, RunShipWorkloadDeps, ShipProgressPhase } from "./types";

type BulkRespItem = {
  create?: { error?: { type?: string; reason?: string } };
  index?: { error?: { type?: string; reason?: string } };
};

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
    const endDate = new Date();
    const windowMs = eventType === "metrics" ? 2 * 3600 * 1000 : 1800000;
    const startDate = new Date(endDate.getTime() - windowMs);

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
              const out = enrichDoc(stripNulls(d) as LooseDoc, svc, traceIngestionSource, "traces");
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
                const json = (await res.json()) as {
                  error?: { reason?: string };
                  items?: BulkRespItem[];
                };
                if (!res.ok) {
                  injErrs += batch.length;
                  errDelta = batch.length;
                  addLog(
                    `  ✗ anomaly injection batch failed (${svc}): ${json.error?.reason || res.status}`,
                    "error"
                  );
                } else {
                  const bErrs =
                    json.items?.filter((it: BulkRespItem) => it.create?.error || it.index?.error)
                      .length ?? 0;
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
          const idx = __dataset ? config.formatDocDatasetIndex(indexPrefix, __dataset) : indexName;
          ndjson +=
            JSON.stringify({ create: { _index: idx } }) + "\n" + JSON.stringify(cleanDoc) + "\n";
        }
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
