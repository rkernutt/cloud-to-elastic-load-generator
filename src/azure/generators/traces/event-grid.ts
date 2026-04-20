import type { EcsDocument } from "../helpers.js";
import { rand, randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { azureServiceBase, enrichAzureTraceDoc } from "./trace-kit.js";

function cd(region: string, rg: string, sub: string, extra: Record<string, string> = {}) {
  return {
    customDimensions: {
      azure_region: region,
      azure_resource_group: rg,
      azure_subscription_id: sub,
      ...extra,
    },
  };
}

export function generateEventGridTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("events-api", env, "nodejs", {
    framework: "Express",
    runtimeName: "nodejs",
    runtimeVersion: "20",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.EventGrid/topics");
  const topic = rand(["orders-events", "audit-events", "inventory-changes"]);
  const failIdx = isErr ? randInt(0, 3) : -1;

  const ops = [
    { name: `EventGrid.Publish ${topic}`, us: randInt(3_000, 95_000) },
    { name: `EventGrid.RouteSubscriptions ${topic}`, us: randInt(2_000, 55_000) },
    { name: "EventGrid.DeliverSubscription webhook-handler", us: randInt(8_000, 180_000) },
    { name: "InvokeEventHandler processEvent", us: randInt(12_000, 400_000) },
  ];

  let ms = randInt(1, 6);
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]!;
    const sid = randSpanId();
    sum += op.us;
    const spanErr = failIdx === i;
    spans.push(
      enrichAzureTraceDoc(
        {
          "@timestamp": offsetTs(base, ms),
          processor: { name: "transaction", event: "span" },
          trace: { id: traceId },
          transaction: { id: txId },
          parent: { id: txId },
          span: {
            id: sid,
            type: "messaging",
            subtype: "azure-event-grid",
            name: op.name,
            duration: { us: op.us },
            action: i === 0 ? "send" : i < 3 ? "publish" : "consume",
            destination: {
              service: { resource: "event-grid", type: "messaging", name: "event-grid" },
            },
            labels: spanErr ? { "azure.eventgrid.error": "delivery_failed" } : {},
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Event Grid", topic }),
        },
        traceId,
        "nodejs"
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const totalUs = sum + randInt(1_000, 18_000);
  const txErr = failIdx >= 0;
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `POST /events/${topic}`,
        type: "messaging",
        duration: { us: totalUs },
        result: txErr ? "failure" : "success",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: txErr ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "nodejs"
  );

  return [txDoc, ...spans];
}
