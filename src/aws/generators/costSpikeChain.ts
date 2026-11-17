/**
 * Cost spike chain — a burst of Lambda invocations drives up a Cost Anomaly
 * Detection-shaped billing line for the same function/account/region.
 *
 * ── True-to-life note on correlation ───────────────────────────────────────
 * Real AWS billing data (Cost Explorer / CUR / Cost Anomaly Detection) carries
 * no event-level correlation ID — there is no field that joins a specific
 * invocation burst to a specific cost-anomaly document. The only honest way to
 * correlate the two is by shared *dimensions* (account, service, region) landing
 * in the same billing window, exactly how a FinOps engineer (or an ES|QL query)
 * would actually find the link. This chain does not invent a shared chain id;
 * it keeps `cloud.account.id`, the function name, and the region identical
 * across every invocation doc and the billing-anomaly doc, and times the
 * billing doc shortly after the burst to model real billing lag.
 *
 * ── What's modelled ────────────────────────────────────────────────────────
 *   1. A burst of `aws.lambda_logs` invocation documents for one function,
 *      clustered into a short (5-15 min) window — reusing the real
 *      `generateLambdaLog` shape so every invocation looks like a genuine one.
 *   2. One `aws.billing` Cost Anomaly Detection-shaped document, rooted in
 *      that same function/account/service, with its dollar impact and
 *      `impactPercentage` scaled to how far the burst ran above a normal
 *      baseline rate — not a literal AWS unit-cost recomputation (a few
 *      hundred extra invocations is financially trivial in reality; Cost
 *      Anomaly Detection itself reports a modelled dollar impact and percentage
 *      uplift, not a line-by-line recalculation, so this mirrors that same
 *      level of fidelity).
 *
 * Each document carries a `__dataset` field used by the ship pipeline for
 * per-doc index routing; strip it before indexing (already handled upstream).
 */

import { rand, randInt, randFloat, randId, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";
import { generateLambdaLog } from "./serverless.js";

/** Functions realistic for a sudden traffic/retry-storm spike (request-driven, not scheduled). */
const SPIKE_PRONE_FUNCTIONS = [
  "api-handler",
  "webhook-receiver",
  "payment-processor",
  "notification-sender",
] as const;

const BILLING_SERVICE = "AmazonLambda";
const BILLING_USAGE_TYPE = "Lambda-Request";

/** Typical "quiet" invocation count for one of these functions over the same window, for scaling. */
const BASELINE_INVOCATIONS = 40;

function generateCostSpikeChain(ts: string, _er: number): EcsDocument[] {
  const region = rand(REGIONS);
  const acct = randAccount();
  const fn = rand(SPIKE_PRONE_FUNCTIONS);
  const baseDate = new Date(ts);

  const burstMinutes = randInt(5, 15);
  const burstCount = randInt(150, 500);
  // More errors under sustained load (timeouts, throttling) than a normal baseline.
  const burstErrorRate = Math.min(0.4, 0.05 + burstCount / 2000);

  const docs: EcsDocument[] = [];
  const burstStartMs = baseDate.getTime() - burstMinutes * 60_000;
  for (let i = 0; i < burstCount; i++) {
    const invTs = new Date(burstStartMs + randInt(0, burstMinutes * 60_000)).toISOString();
    const doc = generateLambdaLog(invTs, burstErrorRate, { fn, acct, region }) as Record<
      string,
      unknown
    >;
    doc.__dataset = "aws.lambda_logs";
    docs.push(doc as EcsDocument);
  }

  // Cost Anomaly Detection typically surfaces an anomaly within an hour or so of the
  // usage that caused it, not instantly — model that lag rather than an instant alert.
  const billingTs = new Date(baseDate.getTime() + randInt(10, 45) * 60_000).toISOString();
  const spikeRatio = burstCount / BASELINE_INVOCATIONS;
  const impactPercentage = Math.min(900, Math.round((spikeRatio - 1) * 100));
  // Illustrative dollar magnitude for the demo narrative, not a literal AWS unit-cost
  // recomputation — see the module doc comment above.
  const baselineDailySpend = Number(randFloat(20, 150));
  const maxImpact = Number((baselineDailySpend * spikeRatio).toFixed(2));
  const totalImpact = Number((maxImpact * Number(randFloat(1, 2.5))).toFixed(2));
  const currency = "USD";
  const period = new Date(billingTs);
  period.setUTCMinutes(0, 0, 0);

  const billingDoc: EcsDocument = {
    "@timestamp": billingTs,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "billing" },
    },
    aws: {
      billing: {
        service: BILLING_SERVICE,
        usage_type: BILLING_USAGE_TYPE,
        estimated_charges: maxImpact,
        currency,
        period_start: period.toISOString().slice(0, 10),
        linked_account_id: acct.id,
        dimensions: {
          Service: BILLING_SERVICE,
          LinkedAccount: acct.id,
          UsageType: BILLING_USAGE_TYPE,
        },
      },
    },
    event: {
      outcome: "failure",
      category: ["configuration", "process"],
      dataset: "aws.billing",
      provider: "ce.amazonaws.com",
      duration: randInt(100, 5000) * 1e6,
    },
    message: JSON.stringify({
      anomalyId: `ANOMALY-${randId(12).toUpperCase()}`,
      monitorArn: `arn:aws:ce::${acct.id}:anomalymonitor/${randId(8)}`,
      anomalyStartDate: period.toISOString().slice(0, 10),
      anomalyEndDate: new Date(billingTs).toISOString().slice(0, 10),
      dimensionValue: BILLING_SERVICE,
      maxImpact: { amount: maxImpact, unit: currency },
      totalImpact: { amount: totalImpact, unit: currency },
      impactPercentage,
      rootCauses: [
        {
          service: BILLING_SERVICE,
          usageType: BILLING_USAGE_TYPE,
          linkedAccount: acct.id,
          region,
          functionName: fn,
        },
      ],
      status: "ACTIVE",
      timestamp: new Date(billingTs).toISOString(),
    }),
    log: { level: "warn" },
    error: { code: "BillingAnomaly", message: "Unusual cost detected", type: "billing" },
    __dataset: "aws.billing",
  } as EcsDocument;
  docs.push(billingDoc);

  return docs;
}

export { generateCostSpikeChain };
