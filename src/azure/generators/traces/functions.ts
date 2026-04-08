import type { EcsDocument } from "../helpers.js";
import { randInt, azureCloud, makeAzureSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";

const APM_AGENT = { name: "opentelemetry/nodejs", version: "1.x" } as const;
const APM_DS = { type: "traces", dataset: "apm", namespace: "default" } as const;

export function generateFunctionsTrace(ts: string, er: number): EcsDocument[] {
  const { region, subscription, isErr } = makeAzureSetup(er);
  const traceId = randTraceId();
  const tx = randSpanId();
  const base = new Date(ts);
  let ms = 0;
  const hubUs = randInt(1500, 45_000);
  const cosmosUs = randInt(2000, 120_000);
  const s1 = randSpanId();
  const s2 = randSpanId();
  const hubErr = isErr && randInt(0, 2) === 0;

  const ev: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: tx },
    parent: { id: tx },
    span: {
      id: s1,
      type: "messaging",
      subtype: "azure-eventhub",
      name: "EventHub produce",
      duration: { us: hubUs },
      action: "send",
      destination: { service: { resource: "eventhubs", type: "messaging", name: "telemetry" } },
    },
    service: { name: "ingest-fn", language: { name: "nodejs" }, framework: { name: "Azure Functions" } },
    cloud: azureCloud(region, subscription, "Microsoft.Web/sites"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: hubErr ? "failure" : "success" },
    azure: { trace: { function_name: `func-${randInt(1, 9)}` } },
  };
  ms += Math.max(1, Math.round(hubUs / 1000));

  const cos: EcsDocument = {
    "@timestamp": offsetTs(base, ms),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: tx },
    parent: { id: tx },
    span: {
      id: s2,
      type: "db",
      subtype: "cosmosdb",
      name: "Cosmos upsert item",
      duration: { us: cosmosUs },
      action: "query",
      destination: { service: { resource: "cosmos", type: "db", name: "cosmos" } },
    },
    service: { name: "ingest-fn", language: { name: "nodejs" } },
    cloud: azureCloud(region, subscription, "Microsoft.DocumentDB/databaseAccounts"),
    agent: APM_AGENT,
    data_stream: APM_DS,
    event: { outcome: hubErr ? "failure" : isErr ? "failure" : "success" },
  };
  return [ev, cos];
}
