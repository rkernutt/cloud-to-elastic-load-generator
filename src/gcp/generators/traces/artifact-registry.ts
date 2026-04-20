import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import { APM_DS, gcpCloudTraceMeta, gcpOtelMeta, gcpServiceBase } from "./trace-kit.js";

const OPS = ["PullImage", "PushImage"] as const;

export function generateArtifactRegistryTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const op = rand(OPS);
  const repo = rand(["containers-prod", "ml-images", "base-images"]);
  const image = rand(["api-server", "batch-worker", "otel-collector"]);
  const tag = rand(["v1.4.2", "sha256:9f3a", "latest"]);
  const otel = gcpOtelMeta("go");
  const svc = gcpServiceBase("ci-registry-client", env, "go", {
    runtimeName: "go",
    runtimeVersion: "1.22",
  });
  const cloud = gcpCloud(region, project, "artifactregistry.googleapis.com");

  const u1 = randInt(1_000, 55_000);
  const u2 = randInt(800, 45_000);
  const u3 = randInt(5_000, 900_000) * (isErr ? randInt(2, 4) : 1);
  const u4 = randInt(2_000, 120_000);

  const failIdx = isErr ? randInt(0, 3) : -1;
  let offsetMs = 0;

  const s1 = randSpanId();
  const spanOp: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: txId },
    span: {
      id: s1,
      type: "external",
      subtype: "docker",
      name: `ArtifactRegistry.${op} ${image}:${tag}`,
      duration: { us: u1 },
      action: op === "PullImage" ? "receive" : "send",
      destination: {
        service: { resource: "artifact_registry", type: "external", name: "artifact_registry" },
      },
      labels: {
        "gcp.artifact.repository": repo,
        ...(failIdx === 0 ? { "gcp.rpc.status_code": "UNAUTHENTICATED" } : {}),
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
  const spanAuth: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s1 },
    span: {
      id: s2,
      type: "external",
      subtype: "auth",
      name: "ArtifactRegistry.dockerAuth",
      duration: { us: u2 },
      action: "verify",
      destination: { service: { resource: "oauth2", type: "external", name: "oauth2" } },
      labels: failIdx === 1 ? { "gcp.rpc.status_code": "PERMISSION_DENIED" } : {},
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
  const spanLayers: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s2 },
    span: {
      id: s3,
      type: "storage",
      subtype: "gcs",
      name: "ArtifactRegistry.layerTransfer",
      duration: { us: u3 },
      action: op === "PullImage" ? "receive" : "send",
      destination: {
        service: { resource: "artifact_blob", type: "storage", name: "artifact_blob" },
      },
      labels: failIdx === 2 ? { "gcp.rpc.status_code": "ABORTED" } : {},
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
  const spanManifest: EcsDocument = {
    "@timestamp": offsetTs(base, offsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: s3 },
    span: {
      id: s4,
      type: "db",
      subtype: "artifact_registry",
      name: "DockerManifest.update",
      duration: { us: u4 },
      action: "write",
      destination: {
        service: { resource: "docker_manifest", type: "db", name: "docker_manifest" },
      },
      labels: failIdx === 3 ? { "gcp.rpc.status_code": "ALREADY_EXISTS" } : {},
    },
    service: svc,
    cloud,
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
      name: `${op} ${repo}/${image}:${tag}`,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: 4, dropped: 0 },
    },
    service: svc,
    cloud,
    labels: { "gcp.artifact.repository": repo, "gcp.artifact.image": `${image}:${tag}` },
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };

  return [txDoc, spanOp, spanAuth, spanLayers, spanManifest];
}
