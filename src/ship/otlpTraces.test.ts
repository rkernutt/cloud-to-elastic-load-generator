import { describe, it, expect } from "vitest";
import { apmDocsToOtlp, apmDocToOtlpSpan, isoToUnixNano, type LooseDoc } from "./otlpTraces";

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const SPAN_ID = "b7ad6b7169203331";
const PARENT_ID = "a1b2c3d4e5f60718";

function txDoc(overrides: Partial<LooseDoc> = {}): LooseDoc {
  return {
    "@timestamp": "2026-07-08T09:00:00.000Z",
    processor: { name: "transaction", event: "transaction" },
    trace: { id: TRACE_ID },
    transaction: { id: SPAN_ID, name: "GET /cart", type: "request", duration: { us: 25000 } },
    service: {
      name: "shopping-cart",
      environment: "production",
      version: "2.14.3",
      language: { name: "nodejs" },
      runtime: { name: "node", version: "20.11.0" },
    },
    telemetry: {
      sdk: { name: "opentelemetry", language: "nodejs", version: "1.30.1" },
      distro: { name: "elastic", version: "8.18.0" },
    },
    cloud: { provider: "aws", region: "us-east-1", account: { id: "111122223333" } },
    event: { outcome: "success" },
    ...overrides,
  };
}

function spanDoc(overrides: Partial<LooseDoc> = {}): LooseDoc {
  return {
    "@timestamp": "2026-07-08T09:00:00.010Z",
    processor: { name: "transaction", event: "span" },
    trace: { id: TRACE_ID },
    transaction: { id: SPAN_ID },
    parent: { id: PARENT_ID },
    span: {
      id: "c1c2c3c4c5c6c7c8",
      name: "DynamoDB GetItem",
      type: "db",
      subtype: "dynamodb",
      action: "GetItem",
      kind: "CLIENT",
      duration: { us: 3000 },
    },
    service: { name: "shopping-cart", environment: "production", language: { name: "nodejs" } },
    labels: { "db.system": "dynamodb", "aws.region": "us-east-1" },
    event: { outcome: "success" },
    ...overrides,
  };
}

describe("isoToUnixNano", () => {
  it("converts ISO to ns decimal string", () => {
    expect(isoToUnixNano("2026-07-08T09:00:00.000Z")).toBe(
      `${Date.parse("2026-07-08T09:00:00.000Z")}000000`
    );
  });
  it("returns 0 for invalid", () => {
    expect(isoToUnixNano("nonsense")).toBe("0");
  });
});

describe("apmDocToOtlpSpan", () => {
  it("maps a transaction doc to a SERVER span using transaction.id", () => {
    const s = apmDocToOtlpSpan(txDoc());
    expect(s.traceId).toBe(TRACE_ID);
    expect(s.spanId).toBe(SPAN_ID);
    expect(s.parentSpanId).toBeUndefined();
    expect(s.kind).toBe(2); // SERVER
    expect(s.name).toBe("GET /cart");
    expect(s.status.code).toBe(1); // OK
    const startNs = BigInt(s.startTimeUnixNano);
    const endNs = BigInt(s.endTimeUnixNano);
    expect(endNs - startNs).toBe(25000n * 1000n); // 25000us in ns
  });

  it("maps a db span doc to a CLIENT span with parent + semconv attributes", () => {
    const s = apmDocToOtlpSpan(spanDoc());
    expect(s.spanId).toBe("c1c2c3c4c5c6c7c8");
    expect(s.parentSpanId).toBe(PARENT_ID);
    expect(s.kind).toBe(3); // CLIENT
    const dbSystem = s.attributes.find((a) => a.key === "db.system");
    expect(dbSystem?.value).toEqual({ stringValue: "dynamodb" });
    const dbOp = s.attributes.find((a) => a.key === "db.operation");
    expect(dbOp?.value).toEqual({ stringValue: "GetItem" });
  });

  it("sets ERROR status on failure outcome", () => {
    const s = apmDocToOtlpSpan(
      txDoc({ event: { outcome: "failure" }, error: { message: "boom" } })
    );
    expect(s.status.code).toBe(2);
    expect(s.status.message).toBe("boom");
  });

  it("messaging transaction maps to CONSUMER", () => {
    const s = apmDocToOtlpSpan(
      txDoc({
        transaction: { id: SPAN_ID, name: "process", type: "messaging", duration: { us: 10 } },
      })
    );
    expect(s.kind).toBe(5); // CONSUMER
  });
});

describe("apmDocsToOtlp", () => {
  it("groups spans by resource (service identity)", () => {
    const req = apmDocsToOtlp([txDoc(), spanDoc()]);
    expect(req.resourceSpans).toHaveLength(1);
    const rs = req.resourceSpans[0];
    expect(rs.scopeSpans[0].spans).toHaveLength(2);
    const svc = rs.resource.attributes.find((a) => a.key === "service.name");
    expect(svc?.value).toEqual({ stringValue: "shopping-cart" });
    const distro = rs.resource.attributes.find((a) => a.key === "telemetry.distro.name");
    expect(distro?.value).toEqual({ stringValue: "elastic" });
  });

  it("separates different services into distinct resourceSpans", () => {
    const other = txDoc({
      service: { name: "leaderboard", environment: "production", language: { name: "java" } },
    });
    const req = apmDocsToOtlp([txDoc(), other]);
    expect(req.resourceSpans).toHaveLength(2);
  });

  it("emits hex trace/span ids and decimal-string timestamps (OTLP/JSON encoding)", () => {
    const req = apmDocsToOtlp([spanDoc()]);
    const s = req.resourceSpans[0].scopeSpans[0].spans[0];
    expect(s.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(s.spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(s.startTimeUnixNano).toMatch(/^\d+$/);
  });
});
