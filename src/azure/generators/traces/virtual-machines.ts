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

export function generateVirtualMachinesTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, resourceGroup, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const svc = azureServiceBase("legacy-monolith", env, "java", {
    framework: "Spring MVC",
    runtimeName: "java",
    runtimeVersion: "17",
  });
  const dim = (e: Record<string, string>) => cd(region, resourceGroup, subscription.id, e);
  const cloud = azureCloud(region, subscription, "Microsoft.Compute/virtualMachines");

  const s1 = randSpanId();
  const s2 = randSpanId();
  const u1 = randInt(1_000, 85_000);
  const u2 = randInt(2_000, 220_000);
  const err2 = isErr;

  const spanLocal = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, randInt(1, 4)),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s1,
        type: "db",
        subtype: "mysql",
        name: "MySQL query",
        duration: { us: u1 },
        action: "query",
        db: { type: "sql", statement: "SELECT * FROM invoices WHERE customer_id = ? LIMIT 50" },
        destination: { service: { resource: "mysql", type: "db", name: "mysql" } },
      },
      service: svc,
      cloud,
      event: { outcome: "success" },
      ...dim({ dependency_type: "MySQL on VM" }),
    },
    traceId,
    "java"
  );

  const spanHttp = enrichAzureTraceDoc(
    {
      "@timestamp": offsetTs(base, Math.max(1, Math.round(u1 / 1000))),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: s2,
        type: "external",
        subtype: "http",
        name: "HTTP GET partner.tax/settlement",
        duration: { us: u2 },
        action: "call",
        destination: { service: { resource: "http", type: "external", name: "http" } },
        labels: err2 ? { "http.status_code": "504" } : { "http.status_code": "200" },
      },
      service: svc,
      cloud,
      event: { outcome: err2 ? "failure" : "success" },
      ...dim({ dependency_type: "HTTP" }),
    },
    traceId,
    "java"
  );

  const totalUs = u1 + u2 + randInt(800, 9_000);
  const txDoc = enrichAzureTraceDoc(
    {
      "@timestamp": ts,
      processor: { name: "transaction", event: "transaction" },
      trace: { id: traceId },
      transaction: {
        id: txId,
        name: "GET /billing/invoices",
        type: "request",
        duration: { us: totalUs },
        result: err2 ? "HTTP 504" : "HTTP 2xx",
        sampled: true,
        span_count: { started: 2, dropped: 0 },
      },
      service: svc,
      cloud,
      event: { outcome: err2 ? "failure" : "success" },
      ...dim({}),
    },
    traceId,
    "java"
  );

  return [txDoc, spanLocal, spanHttp];
}
