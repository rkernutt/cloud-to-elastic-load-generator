/**
 * Cost spike chain — a burst of Cloud Functions invocations drives up a
 * billing cost-spike-shaped document for the same project/function/region.
 *
 * ── True-to-life note on correlation ───────────────────────────────────────
 * Real GCP billing export data (Cloud Billing export to BigQuery) carries no
 * event-level correlation ID — there is no field that joins a specific
 * invocation burst to a specific cost-spike document. The only honest way to
 * correlate the two is by shared *dimensions* (project, service/function,
 * region) landing in the same billing window, exactly how a FinOps engineer
 * (or an ES|QL query) would actually find the link. This chain does not
 * invent a shared chain id; it keeps `project.id`, the function name, and the
 * region identical across every invocation doc and the billing doc, and
 * times the billing doc shortly after the burst to model real billing lag.
 *
 * ── What's modelled ────────────────────────────────────────────────────────
 *   1. A burst of `gcp.cloudfunctions` invocation documents for one Cloud
 *      Function, clustered into a short (5-15 min) window — reusing the real
 *      `generateCloudFunctionsLog` shape so every invocation looks genuine.
 *   2. One `gcp.billing` cost-spike-shaped document, rooted in that same
 *      function/project/region, with its dollar impact and uplift percentage
 *      scaled to how far the burst ran above a normal baseline rate — not a
 *      literal GCP unit-cost recomputation (a few hundred extra invocations
 *      is financially trivial in reality). GCP doesn't have a distinct "Cost
 *      Anomaly Detection" product the way AWS does — Google's nearest
 *      equivalents are budget alerts and recommender cost insights — so this
 *      document is kept simple and clearly cost/anomaly-flavored rather than
 *      overclaiming a specific GCP product's exact schema.
 *
 * Each document carries a `__dataset` field used by the ship pipeline for
 * per-doc index routing; strip it before indexing (already handled upstream).
 */

import {
  rand,
  randInt,
  randFloat,
  randId,
  randProject,
  gcpCloud,
  type EcsDocument,
} from "./helpers.js";
import { GCP_REGIONS } from "./helpers.js";
import { generateCloudFunctionsLog } from "./serverless.js";

const SPIKE_PRONE_FUNCTIONS = [
  "ingest-api",
  "webhook-notify",
  "payment-validate",
  "event-router",
] as const;

const BASELINE_INVOCATIONS = 40;

function generateGcpCostSpikeChain(ts: string, _er: number): EcsDocument[] {
  const region = rand(GCP_REGIONS);
  const project = randProject();
  const fn = rand(SPIKE_PRONE_FUNCTIONS);
  const baseDate = new Date(ts);

  const burstMinutes = randInt(5, 15);
  const burstCount = randInt(150, 500);
  const burstErrorRate = Math.min(0.4, 0.05 + burstCount / 2000);

  const docs: EcsDocument[] = [];
  const burstStartMs = baseDate.getTime() - burstMinutes * 60_000;
  for (let i = 0; i < burstCount; i++) {
    const invTs = new Date(burstStartMs + randInt(0, burstMinutes * 60_000)).toISOString();
    const doc = generateCloudFunctionsLog(invTs, burstErrorRate, {
      functionName: fn,
      region,
      project: { id: project.id, name: project.name },
    }) as Record<string, unknown>;
    doc.__dataset = "gcp.cloudfunctions";
    docs.push(doc as EcsDocument);
  }

  const billingTs = new Date(baseDate.getTime() + randInt(10, 45) * 60_000).toISOString();
  const spikeRatio = burstCount / BASELINE_INVOCATIONS;
  const upliftPercentage = Math.min(900, Math.round((spikeRatio - 1) * 100));
  const baselineDailySpend = Number(randFloat(20, 150));
  const costAmount = Number((baselineDailySpend * spikeRatio).toFixed(2));
  const currency = "USD";
  const usageUnit = "request";
  const usageAmount = burstCount;

  const billingDoc: EcsDocument = {
    "@timestamp": billingTs,
    cloud: gcpCloud(region, project, "cloudbilling.googleapis.com"),
    gcp: {
      billing: {
        billing_account_id: `01${randId(6)}-${randId(4)}-${randId(4)}`,
        service_description: "Cloud Functions",
        sku_description: "Invocations",
        cost_amount: costAmount,
        currency,
        usage_amount: usageAmount,
        usage_unit: usageUnit,
        credits_amount: 0,
        project_id: project.id,
        anomaly: {
          id: `cost-anomaly-${randId(10).toLowerCase()}`,
          uplift_percentage: upliftPercentage,
          baseline_daily_spend: baselineDailySpend,
          root_cause: {
            service: "Cloud Functions",
            function_name: fn,
            region,
            project_id: project.id,
          },
        },
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: ["info"],
      outcome: "failure",
      dataset: "gcp.billing",
      provider: "cloudbilling.googleapis.com",
      duration: randInt(100, 5000) * 1e6,
    },
    message: `Billing cost row: service="Cloud Functions" sku="Invocations" cost=${costAmount.toFixed(2)} ${currency} usage=${usageAmount} ${usageUnit} project=${project.id} — ${upliftPercentage}% above baseline, root cause function=${fn} region=${region}`,
    log: { level: "warn" },
    error: { code: "CostSpike", message: "Unusual cost detected", type: "billing" },
    __dataset: "gcp.billing",
  } as EcsDocument;
  docs.push(billingDoc);

  return docs;
}

export { generateGcpCostSpikeChain };
