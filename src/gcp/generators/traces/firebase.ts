import type { EcsDocument } from "../helpers.js";
import { rand, randInt, gcpCloud, makeGcpSetup, randTraceId, randSpanId } from "../helpers.js";
import { offsetTs } from "../../../aws/generators/traces/helpers.js";
import {
  APM_DS,
  gcpCloudTraceMeta,
  gcpOtelMeta,
  gcpServiceBase,
  gcpSpanFailureLabels,
} from "./trace-kit.js";

export function generateFirebaseTrace(ts: string, er: number): EcsDocument[] {
  const { region, project, isErr } = makeGcpSetup(er);
  const traceId = randTraceId();
  const txId = randSpanId();
  const base = new Date(ts);
  const env = rand(["production", "staging"]);
  const op = rand(["auth.signIn", "firestore.get", "fcm.send"]);
  const otel = gcpOtelMeta("nodejs");
  const svc = gcpServiceBase("mobile-bff", env, "nodejs", {
    framework: "Firebase Admin SDK",
    runtimeName: "node",
    runtimeVersion: "20.x",
  });
  const cloud = gcpCloud(region, project, "firebase.googleapis.com");

  const ops =
    op === "auth.signIn"
      ? [
          { name: "Firebase.verifyIdToken", resource: "firebase_auth", us: randInt(2_000, 40_000) },
          { name: "Firebase.createSession", resource: "firebase_auth", us: randInt(1_000, 25_000) },
        ]
      : op === "firestore.get"
        ? [
            { name: "Firestore.getDocument", resource: "firestore", us: randInt(3_000, 55_000) },
            { name: "Firestore.resolveRules", resource: "firestore", us: randInt(500, 18_000) },
          ]
        : [
            { name: "FCM.validatePayload", resource: "fcm", us: randInt(500, 12_000) },
            { name: "FCM.sendMulticast", resource: "fcm", us: randInt(2_000, 70_000) },
          ];

  const failIdx = isErr ? randInt(0, ops.length - 1) : -1;
  let offsetMs = 0;
  const spans: EcsDocument[] = [];
  let sum = 0;
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i]!;
    const sid = randSpanId();
    const spanErr = failIdx === i;
    sum += o.us;
    spans.push({
      "@timestamp": offsetTs(base, offsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: txId },
      span: {
        id: sid,
        type: "external",
        subtype: "firebase",
        name: o.name,
        duration: { us: o.us },
        action: "call",
        destination: { service: { resource: o.resource, type: "external", name: o.resource } },
        labels: {
          "gcp.firebase.operation": op,
          ...(spanErr ? gcpSpanFailureLabels() : {}),
        },
      },
      service: svc,
      cloud,
      data_stream: APM_DS,
      event: { outcome: spanErr ? "failure" : "success" },
      ...otel,
      ...gcpCloudTraceMeta(project.id, traceId, sid),
    });
    offsetMs += Math.max(1, Math.round(o.us / 1000));
  }

  const txDoc: EcsDocument = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: op,
      type: "request",
      duration: { us: sum + randInt(800, 5000) },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: spans.length, dropped: 0 },
    },
    service: svc,
    cloud,
    data_stream: APM_DS,
    event: { outcome: isErr ? "failure" : "success" },
    ...otel,
    ...gcpCloudTraceMeta(project.id, traceId, txId),
  };
  return [txDoc, ...spans];
}
