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

export function generateNotificationHubsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const hub = rand(["nh-prod-push", "nh-marketing", "nh-alerts"]);
  const platform = rand(["apns", "fcm", "wns"]);
  const svc = azureServiceBase("push-dispatcher", env, "nodejs", {
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.x",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.NotificationHubs/namespaces");
  const failIdx = isErr ? randInt(0, 2) : -1;

  const ops = [
    { name: `NotificationHub.register ${platform}`, us: randInt(1_000, 28_000) },
    { name: `NotificationHub.send ${hub}`, us: randInt(3_000, 75_000) },
    { name: `NotificationHub.deliveryReport ${hub}`, us: randInt(500, 20_000) },
  ];

  let ms = randInt(1, 4);
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
            subtype: "notification",
            name: op.name,
            duration: { us: op.us },
            action: i === 1 ? "send" : "process",
            destination: {
              service: {
                resource: "notification-hubs",
                type: "messaging",
                name: "azure-notification-hubs",
              },
            },
            labels: spanErr ? { "azure.notification.error": "delivery_failed" } : { hub, platform },
          },
          service: svc,
          cloud,
          event: { outcome: spanErr ? "failure" : "success" },
          ...dim({ dependency_type: "Azure Notification Hubs", hub }),
        },
        traceId,
        "nodejs",
        { spanFailed: spanErr }
      )
    );
    ms += Math.max(1, Math.round(op.us / 1000));
  }

  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: `Push notification (${platform})`,
        type: "request",
        duration: { us: sum + randInt(800, 6000) },
        result: failIdx >= 0 ? "failure" : "success",
        sampled: true,
        span_count: { started: spans.length, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: failIdx >= 0 ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "nodejs"
  );

  return [txDoc, ...spans];
}
