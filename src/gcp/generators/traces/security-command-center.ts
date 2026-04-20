import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

export function generateSecurityCommandCenterTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const source = rand(["CONTAINER_VULNERABILITY", "WEB_SECURITY_SCANNER", "OS_VULNERABILITY"]);
  const resource = rand(["gke-cluster-prod", "artifact-repo-ml", "compute-image-family"]);
  const otel = gcpOtelMeta("python");
  const svc = gcpServiceBase("scc-scanner-coordinator", env, "python", {
    runtimeName: "python",
    runtimeVersion: "3.12",
  });
  const cloud = gcpCloud(region, project, "securitycenter.googleapis.com");

  const u1 = randInt(5_000, 400_000) * (isErr ? randInt(2, 3) : 1);
  const u2 = randInt(2_000, 180_000);
  const u3 = randInt(1_000, 95_000);
  const u4 = randInt(800, 55_000);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanScan: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "securitycenter",
      name: "SecurityCenter.runScan",
      duration: { us: u1 },
      action: "execute",
      destination: {
        service: { resource: "securitycenter", type: "external", name: "securitycenter" },
      },
      labels: {
        "gcp.scc.source": source,
        "gcp.scc.resource": resource,
        ...(failIdx === 0 ? { "gcp.rpc.status_code": "UNAVAILABLE" } : {}),
      },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 0 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s1),
  };
  offsetMs += Math.max(1, Math.round(u1 / 1000));

  const s2 = randSpanId();
  const spanDetect: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "app",
      subtype: "securitycenter",
      name: "SecurityCenter.vulnerabilityDetection",
      duration: { us: u2 },
      action: "process",
      destination: { service: { resource: "vuln_detector", type: "app", name: "vuln_detector" } },
      labels:
        failIdx === 1
          ? { "gcp.scc.finding_severity": "none" }
          : { "gcp.scc.finding_severity": "high" },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 1 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s2),
  };
  offsetMs += Math.max(1, Math.round(u2 / 1000));

  const s3 = randSpanId();
  const spanFinding: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "db",
      subtype: "securitycenter",
      name: "SecurityCenter.createFinding",
      duration: { us: u3 },
      action: "write",
      destination: { service: { resource: "findings", type: "db", name: "findings" } },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "ALREADY_EXISTS" } : {},
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: failIdx === 2 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s3),
  };
  offsetMs += Math.max(1, Math.round(u3 / 1000));

  const s4 = randSpanId();
  const spanNotify: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "messaging",
      subtype: "pubsub",
      name: "SecurityCenter.publishNotification",
      duration: { us: u4 },
      action: "send",
      destination: {
        service: { resource: "scc_notification", type: "messaging", name: "scc_notification" },
      },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "DEADLINE_EXCEEDED" } : {},
    },
    service: svc,
    cloud: gcpCloud(region, project, "pubsub.googleapis.com"),
    data_stream: APM_DS,
    event: { outcome: failIdx === 3 ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, s4),
  };

  const totalUs = u1 + u2 + u3 + u4 + randInt(300, 3500) * 1000;
  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: `SCC finding pipeline (${source})`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.scc.source": source },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanScan, spanDetect, spanFinding, spanNotify];
}
