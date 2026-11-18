/**
 * Cost spike chain — a burst of Azure Functions invocations drives up a Cost
 * Management anomaly-shaped billing document for the same function
 * app/subscription/resource group/region.
 *
 * ── True-to-life note on correlation ───────────────────────────────────────
 * Real Azure Cost Management export data (and Cost Management anomaly
 * alerts) carries no event-level correlation ID — there is no field that
 * joins a specific invocation burst to a specific cost-anomaly document. The
 * only honest way to correlate the two is by shared *dimensions*
 * (subscription id, resource group, function app/name, region) landing in
 * the same cost-reporting window, exactly how a FinOps engineer (or an
 * ES|QL query) would actually find the link. This chain does not invent a
 * shared chain id; it keeps `subscription.id`, `resourceGroup`, the function
 * app/name, and the region identical across every invocation doc and the
 * billing-anomaly doc, and times the billing doc shortly after the burst to
 * model real billing lag. Azure's own per-document `correlationId` is left
 * to vary naturally (as it would for every real request) — it is never
 * forced identical across docs, since that would recreate exactly the
 * fabricated join key this design avoids.
 *
 * ── What's modelled ────────────────────────────────────────────────────────
 *   1. A burst of `azure.functions` invocation documents for one Function
 *      App, clustered into a short (5-15 min) window — reusing the real
 *      `generateFunctionsLog` shape (via its optional identity override) so
 *      every invocation looks like a genuine one.
 *   2. One `azure.cost_management` Cost Management anomaly-shaped document,
 *      rooted in that same function app/subscription/resource group, with
 *      its uplift percentage and dollar impact scaled to how far the burst
 *      ran above a normal baseline invocation rate — mirroring the same
 *      "modelled uplift, not a line-by-line recalculation" level of fidelity
 *      as Azure Cost Management's own anomaly detection, and matching the
 *      field shape already used by `generateCostManagementLog`'s "anomaly"
 *      variant (`azure.cost_management.*`, `operationName:
 *      "Microsoft.CostManagement/Alerts"`, `category: "CostAnomaly"`).
 *
 * Each document carries a `__dataset` field used by the ship pipeline for
 * per-doc index routing; strip it before indexing (already handled upstream).
 */

import {
  rand,
  randInt,
  randId,
  randUUID,
  randIp,
  randFloat,
  AZURE_REGIONS,
  randSubscription,
  randResourceGroup,
  azureCloud,
} from "./helpers.js";
import type { EcsDocument } from "./types.js";
import { generateFunctionsLog } from "./platform.js";

const SPIKE_PRONE_FUNCTIONS = [
  "OrderProcessor",
  "TelemetryIngest",
  "NightlyReport",
  "WebhookHandler",
] as const;

const COST_MANAGEMENT_SERVICE_NAME = "Azure Functions";
const BASELINE_INVOCATIONS = 40;

function generateAzureCostSpikeChain(ts: string, _er: number): EcsDocument[] {
  const region = rand([...AZURE_REGIONS]);
  const subscription = randSubscription();
  const resourceGroup = randResourceGroup();
  const fnName = rand(SPIKE_PRONE_FUNCTIONS);
  const fnApp = `func-${rand(["http", "timer", "queue"])}-${randId(4).toLowerCase()}`;
  const baseDate = new Date(ts);

  const burstMinutes = randInt(5, 15);
  const burstCount = randInt(150, 500);
  const burstErrorRate = Math.min(0.4, 0.05 + burstCount / 2000);

  const docs: EcsDocument[] = [];
  const burstStartMs = baseDate.getTime() - burstMinutes * 60_000;
  for (let i = 0; i < burstCount; i++) {
    const invTs = new Date(burstStartMs + randInt(0, burstMinutes * 60_000)).toISOString();
    const doc = generateFunctionsLog(invTs, burstErrorRate, {
      fnName,
      fnApp,
      region,
      subscription,
      resourceGroup,
    }) as Record<string, unknown>;
    doc.__dataset = "azure.functions";
    docs.push(doc as EcsDocument);
  }

  const billingTs = new Date(baseDate.getTime() + randInt(10, 45) * 60_000).toISOString();
  const spikeRatio = burstCount / BASELINE_INVOCATIONS;
  const upliftPct = Number(Math.min(900, (spikeRatio - 1) * 100).toFixed(2));
  const anomalyId = randUUID();
  const correlationId = randUUID();
  const time = billingTs;
  const exportName = `export-${randId(4).toLowerCase()}`;
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/Microsoft.CostManagement/exports/${exportName}`;
  const statusCode = 200;
  const actualCost = Number((Number(randFloat(20, 150)) * spikeRatio).toFixed(2));

  const props = {
    serviceName: COST_MANAGEMENT_SERVICE_NAME,
    upliftPct,
    anomalyId,
    statusCode,
    correlationId,
    resourceGroup,
    functionApp: fnApp,
    functionName: fnName,
    invocationCount: burstCount,
    baselineInvocationCount: BASELINE_INVOCATIONS,
  };

  const billingDoc: EcsDocument = {
    "@timestamp": billingTs,
    time,
    resourceId,
    operationName: "Microsoft.CostManagement/Alerts",
    category: "CostAnomaly",
    resultType: "Success",
    resultSignature: String(statusCode),
    callerIpAddress: randIp(),
    correlationId,
    level: "Warning",
    properties: props,
    cloud: azureCloud(region, subscription, "Microsoft.CostManagement/alerts"),
    azure: {
      subscription_id: subscription.id,
      resource: { group: resourceGroup, name: fnApp, type: "Microsoft.Web/sites" },
      billing: {
        actual_cost: actualCost,
        currency: "USD",
        usage_start: new Date(baseDate.getTime() - burstMinutes * 60_000).toISOString(),
        usage_end: billingTs,
        product: COST_MANAGEMENT_SERVICE_NAME,
      },
      cost_management: {
        export: exportName,
        resource_group: resourceGroup,
        resource_id: resourceId,
        category: "Anomaly",
        correlation_id: correlationId,
        properties: props,
      },
    },
    event: {
      kind: "event",
      outcome: "success",
      category: ["intrusion_detection"],
      type: ["info"],
      dataset: "azure.cost_management",
      provider: "Microsoft.CostManagement",
    },
    message: `Spike detected on ${COST_MANAGEMENT_SERVICE_NAME} (function app ${fnApp}) uplift=${upliftPct}%`,
    __dataset: "azure.cost_management",
  } as EcsDocument;
  docs.push(billingDoc);

  return docs;
}

export { generateAzureCostSpikeChain };
