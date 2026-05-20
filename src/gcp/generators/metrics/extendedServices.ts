/**
 * GCP Cloud Monitoring metric generators for extended platform services.
 */

import { GCP_METRICS_DATASET_MAP } from "../../data/elasticMaps.js";
import {
  randInt,
  jitter,
  dp,
  gcpMetricDoc,
  pickGcpCloudContext,
  toInt64String,
  distributionFromMs,
} from "./helpers.js";
import { rand, randBigQueryDataset, randId, EMAIL_DOMAINS } from "../helpers.js";
import type { EcsDocument } from "../../../aws/generators/types.js";
import type { GcpProject } from "../helpers.js";

/** gRPC-ish API result codes surfaced on serviceruntime + agent metrics. */
const API_RESPONSE_ERRORS = [
  "INVALID_ARGUMENT",
  "DEADLINE_EXCEEDED",
  "NOT_FOUND",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "INTERNAL",
  "UNAVAILABLE",
  "CANCELLED",
] as const;

/** Drive latency / backlog / saturation from the global stress knob instead of a single Bernoulli trial. */
function stressAmplifier(er: number): number {
  return Math.min(2.85, Math.max(0, er * (1.25 + Math.random() * 0.85)));
}

function pickApiResponseCode(er: number): (typeof API_RESPONSE_ERRORS)[number] | "OK" {
  const errWeight = Math.min(0.94, 0.05 + er * 0.9);
  if (Math.random() < errWeight) return rand([...API_RESPONSE_ERRORS]);
  return rand(["OK", "OK", "OK", "OK", "OK", "CANCELLED"]);
}

function responseCodeClass(code: string): string {
  if (code === "OK") return "success";
  if (code === "CANCELLED") return "cancelled";
  return "error";
}

function consumedApiRequests(
  ts: string,
  svcKey: string,
  dataset: string,
  region: string,
  project: GcpProject,
  apiService: string,
  method: string,
  er: number
): EcsDocument {
  const code = pickApiResponseCode(er);
  const amp = stressAmplifier(er);
  const throughputScale = 1 / (1 + amp * 0.72);
  return gcpMetricDoc(ts, svcKey, dataset, region, project, {
    metricType: "serviceruntime.googleapis.com/api/request_count",
    resourceType: "consumed_api",
    resourceLabels: {
      project_id: project.id,
      service: apiService,
      method,
    },
    metricLabels: { response_code: code },
    metricKind: "DELTA",
    valueType: "INT64",
    point: {
      int64Value: toInt64String(
        randInt(
          Math.max(8, Math.floor(140 * throughputScale)),
          Math.max(180, Math.floor(220_000 * throughputScale))
        )
      ),
    },
  });
}

export function generateVertexAiAgentBuilderMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["vertex-ai-agent-builder"]!;
  const reasoning_engine_id = String(randInt(1_000_000_000_000, 9_007_199_254_740_991));
  const res = {
    resource_container: project.id,
    location: region,
    reasoning_engine_id,
  };
  const amp = stressAmplifier(er);
  const code = pickApiResponseCode(er);
  const errFrac = Math.min(
    1,
    API_RESPONSE_ERRORS.includes(code as (typeof API_RESPONSE_ERRORS)[number])
      ? 0.85 + amp * 0.1
      : er * 0.35
  );
  const reqs = randInt(
    Math.max(30, Math.floor(280 * (1 - amp * 0.62))),
    Math.max(420, Math.floor(155_000 * (1 - amp * 0.58)))
  );
  const latMs = jitter(
    210 + amp * 1200 + er * 800,
    140 + amp * 380,
    12,
    2400 + amp * 9600 + er * 4200
  );
  const distN = randInt(
    Math.max(40, Math.floor(90 * (1 + amp))),
    Math.floor(2600 * (1 + amp * 0.5))
  );
  const tok = randInt(
    Math.max(400, Math.floor(4200 * (1 - amp * 0.4))),
    Math.floor(910_000 * (1 / (1 + amp * 0.35)))
  );
  const highTail = amp > 0.35 || er > 0.25;

  return [
    gcpMetricDoc(ts, "vertex-ai-agent-builder", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/reasoning_engine/request_count",
      resourceType: "aiplatform.googleapis.com/ReasoningEngine",
      resourceLabels: res,
      metricLabels: {
        type: "Predict",
        response_code: code,
        response_code_class: responseCodeClass(code),
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(reqs) },
    }),
    gcpMetricDoc(ts, "vertex-ai-agent-builder", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/reasoning_engine/request_latencies",
      resourceType: "aiplatform.googleapis.com/ReasoningEngine",
      resourceLabels: res,
      metricLabels: {
        type: "Predict",
        response_code: code,
        response_code_class: responseCodeClass(code),
      },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(latMs, distN, highTail),
    }),
    gcpMetricDoc(ts, "vertex-ai-agent-builder", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/reasoning_engine/active_session_count",
      resourceType: "aiplatform.googleapis.com/ReasoningEngine",
      resourceLabels: res,
      metricLabels: {
        throttle_reason: amp > 0.55 ? "QUOTA_BURST" : "NONE",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(
            Math.max(1, Math.floor(28 * (1 - amp * 0.82))),
            Math.floor(920 * (1 + amp * 0.08))
          )
        ),
      },
    }),
    gcpMetricDoc(ts, "vertex-ai-agent-builder", dataset, region, project, {
      metricType: "aiplatform.googleapis.com/reasoning_engine/memory_bank/memory_retrieval_count",
      resourceType: "aiplatform.googleapis.com/ReasoningEngine",
      resourceLabels: res,
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(
            Math.max(2, Math.floor(92 * (1 - amp * 0.68))),
            Math.floor(52_000 * (1 / (1 + amp * 0.45)))
          )
        ),
      },
    }),
    gcpMetricDoc(ts, "vertex-ai-agent-builder", dataset, region, project, {
      metricType:
        "aiplatform.googleapis.com/reasoning_engine/memory_bank/generate_memories_token_count",
      resourceType: "aiplatform.googleapis.com/ReasoningEngine",
      resourceLabels: res,
      metricLabels: { type: errFrac > 0.55 ? "output" : "input" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(tok) },
    }),
    gcpMetricDoc(ts, "vertex-ai-agent-builder", dataset, region, project, {
      metricType:
        "aiplatform.googleapis.com/reasoning_engine/memory_bank/approx_logical_size_bytes",
      resourceType: "aiplatform.googleapis.com/ReasoningEngine",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.floor(80e6 * (1 + amp * 0.2)), Math.floor(920e6 * (1 + amp * 0.9)))
        ),
      },
    }),
  ];
}

export function generateColabEnterpriseMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["colab-enterprise"]!;
  const amp = stressAmplifier(er);
  const notebookSvc = "notebooks.googleapis.com";

  return [
    consumedApiRequests(
      ts,
      "colab-enterprise",
      dataset,
      region,
      project,
      notebookSvc,
      "google.cloud.notebooks.v1.NotebookService.CreateExecution",
      er
    ),
    consumedApiRequests(
      ts,
      "colab-enterprise",
      dataset,
      region,
      project,
      notebookSvc,
      "google.cloud.notebooks.v1.NotebookService.GetExecution",
      er
    ),
    consumedApiRequests(
      ts,
      "colab-enterprise",
      dataset,
      region,
      project,
      notebookSvc,
      "google.cloud.notebooks.v1.NotebookService.ListExecutions",
      er
    ),
    consumedApiRequests(
      ts,
      "colab-enterprise",
      dataset,
      region,
      project,
      notebookSvc,
      "google.cloud.notebooks.v1.NotebookService.CancelExecution",
      er
    ),
    gcpMetricDoc(ts, "colab-enterprise", dataset, region, project, {
      metricType: "notebooks.googleapis.com/instance/cpu/utilization",
      resourceType: "notebooks.googleapis.com/Instance",
      resourceLabels: {
        resource_container: project.id,
        location: region,
        instance_id: `colab-inst-${randId(6)}`,
      },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: {
        doubleValue: dp(jitter(0.38 + amp * 0.44, 0.2 + amp * 0.12, 0.03, 0.985), 4),
      },
    }),
    gcpMetricDoc(ts, "colab-enterprise", dataset, region, project, {
      metricType: "monitoring.googleapis.com/uptime/check/pass_count",
      resourceType: "uptime_url",
      resourceLabels: {
        project_id: project.id,
        host: `notebook-${randId(4)}.prod.${rand(EMAIL_DOMAINS)}`,
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.max(0, Math.floor(6 - amp * 5)), Math.floor(18 - amp * 4))
        ),
      },
    }),
  ];
}

export function generateDistributedCloudMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["distributed-cloud"]!;
  const machine_id = `machine-${randId(6).toLowerCase()}`;
  const cluster_id = `edge-${rand(["prod", "retail"])}-${randId(4)}`;
  const machineRes = {
    resource_container: project.id,
    location: region,
    machine_id,
  };
  const clusterRes = {
    resource_container: project.id,
    location: region,
    cluster_id,
  };
  const amp = stressAmplifier(er);
  const reconLatencyMs = jitter(820 + amp * 5200, 240 + amp * 1800, 60, 120_000 + amp * 540_000);
  const reconcileBacklog = randInt(Math.floor(amp * 2), Math.floor(48 + amp * 220));

  return [
    gcpMetricDoc(ts, "distributed-cloud", dataset, region, project, {
      metricType: "edgecontainer.googleapis.com/machine/cpu/utilization",
      resourceType: "edgecontainer.googleapis.com/Machine",
      resourceLabels: machineRes,
      metricLabels: { type: amp > 0.42 ? "workload" : "system" },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: {
        doubleValue: dp(jitter(0.42 + amp * 0.43, 0.22 + amp * 0.12, 0.05, 0.995), 4),
      },
    }),
    gcpMetricDoc(ts, "distributed-cloud", dataset, region, project, {
      metricType: "edgecontainer.googleapis.com/machine/memory/used_bytes",
      resourceType: "edgecontainer.googleapis.com/Machine",
      resourceLabels: machineRes,
      metricLabels: { type: "workload" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(
            Math.floor((48 + amp * 52) * 1024 ** 3),
            Math.floor((440 + amp * 540) * 1024 ** 3)
          )
        ),
      },
    }),
    gcpMetricDoc(ts, "distributed-cloud", dataset, region, project, {
      metricType: "edgecontainer.googleapis.com/machine/disk/utilization",
      resourceType: "edgecontainer.googleapis.com/Machine",
      resourceLabels: machineRes,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: {
        doubleValue: dp(jitter(0.38 + amp * 0.44, 0.18 + amp * 0.18, 0.05, 0.997), 4),
      },
    }),
    gcpMetricDoc(ts, "distributed-cloud", dataset, region, project, {
      metricType: "edgecontainer.googleapis.com/cluster/reconcile/backlog_items",
      resourceType: "edgecontainer.googleapis.com/EdgeCluster",
      resourceLabels: clusterRes,
      metricLabels: {
        backlog_severity: amp > 0.55 ? "SATURATED" : "NORMAL",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(reconcileBacklog) },
    }),
    gcpMetricDoc(ts, "distributed-cloud", dataset, region, project, {
      metricType:
        "edgecontainer.googleapis.com/cluster/network/upstream_unreachable_transitions_count",
      resourceType: "edgecontainer.googleapis.com/EdgeCluster",
      resourceLabels: clusterRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(Math.floor(amp * 1.8), Math.floor(2 + amp * 28))),
      },
    }),
    gcpMetricDoc(ts, "distributed-cloud", dataset, region, project, {
      metricType: "edgecontainer.googleapis.com/cluster/reconcile_latency",
      resourceType: "edgecontainer.googleapis.com/EdgeCluster",
      resourceLabels: clusterRes,
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(
        reconLatencyMs,
        randInt(20, Math.floor(400 + amp * 1600)),
        amp > 0.25
      ),
    }),
  ];
}

export function generateParallelstoreMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.parallelstore!;
  const zone = `${region}-${rand(["a", "b", "c"])}`;
  const instance_id = `ps-${rand(["hpc", "sim"])}-${randId(4).toLowerCase()}`;
  const baseRes = {
    resource_container: project.id,
    location: zone,
    instance_id,
  };
  const rankTarget = { rank: "0", target: "t0" };
  const amp = stressAmplifier(er);
  const throttleSignals = amp > 0.48 ? rand(["CLIENT_THROTTLE", "POOL_PRESSURE"]) : "NONE";

  return [
    gcpMetricDoc(ts, "parallelstore", dataset, region, project, {
      metricType: "parallelstore.googleapis.com/instance/total_capacity_bytes",
      resourceType: "parallelstore.googleapis.com/Instance",
      resourceLabels: baseRes,
      metricLabels: rankTarget,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(480 * 1024 ** 3, 7680 * 1024 ** 3)),
      },
    }),
    gcpMetricDoc(ts, "parallelstore", dataset, region, project, {
      metricType: "parallelstore.googleapis.com/instance/used_capacity_bytes",
      resourceType: "parallelstore.googleapis.com/Instance",
      resourceLabels: baseRes,
      metricLabels: rankTarget,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(
            Math.floor((120 + amp * 520) * 1024 ** 3),
            Math.floor((4100 + amp * 3200) * 1024 ** 3)
          )
        ),
      },
    }),
    gcpMetricDoc(ts, "parallelstore", dataset, region, project, {
      metricType: "parallelstore.googleapis.com/instance/read_bytes_count",
      resourceType: "parallelstore.googleapis.com/Instance",
      resourceLabels: baseRes,
      metricLabels: { ...rankTarget, throttle_hint: throttleSignals },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.floor(28e9 / (1 + amp * 0.55)), Math.floor(920e9 / (1 + amp * 0.62)))
        ),
      },
    }),
    gcpMetricDoc(ts, "parallelstore", dataset, region, project, {
      metricType: "parallelstore.googleapis.com/instance/write_bytes_count",
      resourceType: "parallelstore.googleapis.com/Instance",
      resourceLabels: baseRes,
      metricLabels: rankTarget,
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.floor(18e9 / (1 + amp * 0.58)), Math.floor(780e9 / (1 + amp * 0.6)))
        ),
      },
    }),
    gcpMetricDoc(ts, "parallelstore", dataset, region, project, {
      metricType: "parallelstore.googleapis.com/instance/metadata_latency_ms",
      resourceType: "parallelstore.googleapis.com/Instance",
      resourceLabels: baseRes,
      metricLabels: { path: rand(["mds", "layout"]) },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(
        jitter(8 + amp * 120, 4 + amp * 55, 0.5, 900 + amp * 6200),
        randInt(12, Math.floor(400 + amp * 900)),
        amp > 0.3
      ),
    }),
  ];
}

export function generateDataformMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.dataform!;
  const repository = `repos/${rand(["finance", "risk"])}-${randId(4)}`;
  const wfRes = { resource_container: project.id, location: region, repository };
  const amp = stressAmplifier(er);

  return [
    consumedApiRequests(
      ts,
      "dataform",
      dataset,
      region,
      project,
      "dataform.googleapis.com",
      "google.cloud.dataform.v1beta1.Dataform.CreateCompilationResult",
      er
    ),
    consumedApiRequests(
      ts,
      "dataform",
      dataset,
      region,
      project,
      "dataform.googleapis.com",
      "google.cloud.dataform.v1beta1.Dataform.CreateWorkflowInvocation",
      er
    ),
    consumedApiRequests(
      ts,
      "dataform",
      dataset,
      region,
      project,
      "dataform.googleapis.com",
      "google.cloud.dataform.v1beta1.Dataform.FetchRepositoryHistory",
      er
    ),
    consumedApiRequests(
      ts,
      "dataform",
      dataset,
      region,
      project,
      "dataform.googleapis.com",
      "google.cloud.dataform.v1beta1.Dataform.QueryCompilationResults",
      er
    ),
    gcpMetricDoc(ts, "dataform", dataset, region, project, {
      metricType: "dataform.googleapis.com/workflow/action_run_latency_ms",
      resourceType: "dataform.googleapis.com/WorkflowInvocation",
      resourceLabels: {
        resource_container: project.id,
        location: region,
        workflow_invocation: `wf-${randId(8)}`,
      },
      metricLabels: {
        invocation_state: amp > 0.5 ? "STUCK" : "RUNNING_OK",
      },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(
        jitter(12_000 + amp * 180_000, 4000 + amp * 80_000, 800, 3_600_000),
        randInt(6, Math.floor(60 + amp * 420)),
        amp > 0.28
      ),
    }),
    gcpMetricDoc(ts, "dataform", dataset, region, project, {
      metricType: "dataform.googleapis.com/repository/git_sync_conflict_count",
      resourceType: "dataform.googleapis.com/Repository",
      resourceLabels: wfRes,
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(Math.floor(amp * 1.8), Math.floor(4 + amp * 220))),
      },
    }),
  ];
}

export function generateBiglakeMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP.biglake!;
  const project_id = project.id;
  const amp = stressAmplifier(er);
  const concurrentStreams = randInt(
    Math.max(8, Math.floor((12 + amp * 110) / (1 + amp * 0.05))),
    Math.floor((280 + amp * 4200) / (1 + amp * 0.45))
  );
  const scanned = randInt(Math.floor(9e10 / (1 + amp * 0.4)), Math.floor(22e13 * (1 + amp * 0.9)));
  const slotContentionFlag = amp > 0.55 ? "true" : "false";

  return [
    gcpMetricDoc(ts, "biglake", dataset, region, project, {
      metricType: "bigquerystorage.googleapis.com/read/concurrent_streams",
      resourceType: "bigquery_project",
      resourceLabels: { project_id },
      metricLabels: { throttle: slotContentionFlag },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: { int64Value: toInt64String(concurrentStreams) },
    }),
    gcpMetricDoc(ts, "biglake", dataset, region, project, {
      metricType: "bigquery.googleapis.com/query/scanned_bytes",
      resourceType: "bigquery_project",
      resourceLabels: { project_id },
      metricKind: "DELTA",
      valueType: "INT64",
      point: { int64Value: toInt64String(scanned) },
    }),
    gcpMetricDoc(ts, "biglake", dataset, region, project, {
      metricType: "bigquery.googleapis.com/storage/stored_bytes",
      resourceType: "bigquery_dataset",
      resourceLabels: { project_id, dataset_id: randBigQueryDataset() },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.floor(4e11 * (1 + amp * 0.6)), Math.floor(18e13 * (1 + amp * 1.2)))
        ),
      },
    }),
    gcpMetricDoc(ts, "biglake", dataset, region, project, {
      metricType: "bigquery.googleapis.com/query/execution_count",
      resourceType: "bigquery_project",
      resourceLabels: { project_id },
      metricLabels: { job_type: rand(["QUERY", "LOAD"]) },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(
            Math.max(40, Math.floor(1200 / (1 + amp * 0.55))),
            Math.floor(48_000 / (1 + amp * 0.48))
          )
        ),
      },
    }),
    gcpMetricDoc(ts, "biglake", dataset, region, project, {
      metricType: "bigquery.googleapis.com/query/total_slot_ms",
      resourceType: "bigquery_project",
      resourceLabels: { project_id },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.floor(8e6 * (1 + amp * 1.8)), Math.floor(260e9 * (1 + amp * 2.2)))
        ),
      },
    }),
  ];
}

export function generateCertificateManagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["certificate-manager"]!;
  const resource_container = project.id;
  const certificate_map_id = `cert-map-${rand(["edge", "global"])}-${randId(4).toLowerCase()}`;
  const amp = stressAmplifier(er);

  return [
    gcpMetricDoc(ts, "certificate-manager", dataset, region, project, {
      metricType: "certificatemanager.googleapis.com/map/entries",
      resourceType: "certificatemanager.googleapis.com/CertificateMap",
      resourceLabels: { resource_container, location: region, certificate_map_id },
      metricLabels: { is_primary: amp > 0.48 ? "false" : "true" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.max(1, Math.floor(4 - amp * 2)), Math.floor(220 - amp * 120))
        ),
      },
    }),
    gcpMetricDoc(ts, "certificate-manager", dataset, region, project, {
      metricType: "certificatemanager.googleapis.com/project/certificates",
      resourceType: "certificatemanager.googleapis.com/Project",
      resourceLabels: { resource_container, location: region },
      metricLabels: {
        scope: "DEFAULT",
        type: rand(["MANAGED", "SELF_MANAGED"]),
        is_active: amp > 0.52 ? "false" : "true",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.max(8, Math.floor(40 - amp * 22)), Math.floor(620 - amp * 260))
        ),
      },
    }),
    gcpMetricDoc(ts, "certificate-manager", dataset, region, project, {
      metricType: "certificatemanager.googleapis.com/project/v2/certificate_observance_event_count",
      resourceType: "certificatemanager.googleapis.com/Project",
      resourceLabels: { resource_container, location: region },
      metricLabels: {
        authority_type: "Public",
        key_algorithm: "RSA_2048",
        key_usage_profile: "SERVER_AUTH",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(Math.floor(amp * 8), Math.floor(48 + amp * 220))),
      },
    }),
    consumedApiRequests(
      ts,
      "certificate-manager",
      dataset,
      region,
      project,
      "certificatemanager.googleapis.com",
      "google.cloud.certificatemanager.v1.CertificateManager.CreateCertificate",
      er
    ),
    gcpMetricDoc(ts, "certificate-manager", dataset, region, project, {
      metricType: "certificatemanager.googleapis.com/cert/dns_authorization_error_count",
      resourceType: "certificatemanager.googleapis.com/Project",
      resourceLabels: { resource_container, location: region },
      metricLabels: { reason_code: amp > 0.35 ? "DELEGATION" : "NONE" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(Math.floor(amp * 2), Math.floor(4 + amp * 180))),
      },
    }),
  ];
}

export function generateBlockchainNodeEngineMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["blockchain-node-engine"]!;
  const blockchain_node_id = `nodes/${rand(["eth-mainnet", "polygon-pos"])}-${randId(6)}`;
  const res = {
    resource_container: project.id,
    location: region,
    blockchain_node_id,
  };
  const amp = stressAmplifier(er);
  const rpcOutcome = pickApiResponseCode(er);

  return [
    gcpMetricDoc(ts, "blockchain-node-engine", dataset, region, project, {
      metricType: "blockchainnodeengine.googleapis.com/node/active_peers",
      resourceType: "blockchainnodeengine.googleapis.com/BlockchainNode",
      resourceLabels: res,
      metricLabels: {
        saturation: amp > 0.45 ? "DEGRADED" : "HEALTHY",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(Math.max(3, Math.floor(52 - amp * 38)), Math.floor(118 - amp * 60))
        ),
      },
    }),
    gcpMetricDoc(ts, "blockchain-node-engine", dataset, region, project, {
      metricType: "blockchainnodeengine.googleapis.com/node/block_height",
      resourceType: "blockchainnodeengine.googleapis.com/BlockchainNode",
      resourceLabels: res,
      metricLabels: {
        stalled: amp > 0.5 ? "true" : "false",
      },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          ((): number => {
            const healLo = 9_500_000;
            const healHi = 21_500_000;
            const sickLo = 1_700_000;
            const sickHi = 2_400_000;
            const t = Math.min(1, amp);
            const minH = Math.round(healLo * (1 - t * 0.88) + sickLo * t * 0.88);
            const maxH = Math.round(healHi * (1 - t * 0.9) + sickHi * t * 0.9);
            return randInt(Math.min(minH, maxH), Math.max(minH, maxH));
          })()
        ),
      },
    }),
    gcpMetricDoc(ts, "blockchain-node-engine", dataset, region, project, {
      metricType: "blockchainnodeengine.googleapis.com/node/cpu/utilization",
      resourceType: "blockchainnodeengine.googleapis.com/BlockchainNode",
      resourceLabels: res,
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: {
        doubleValue: dp(jitter(38 + amp * 44, 22 + amp * 10, 5, 92 + amp * 7), 2),
      },
    }),
    gcpMetricDoc(ts, "blockchain-node-engine", dataset, region, project, {
      metricType: "blockchainnodeengine.googleapis.com/node/total_request_count",
      resourceType: "blockchainnodeengine.googleapis.com/BlockchainNode",
      resourceLabels: res,
      metricLabels: {
        endpoint: amp > 0.4 ? "eth_getLogs" : "eth_call",
        response_code: rpcOutcome,
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(
            Math.max(220, Math.floor(4200 / (1 + amp * 0.65))),
            Math.floor(420_000 / (1 + amp * 0.55))
          )
        ),
      },
    }),
    gcpMetricDoc(ts, "blockchain-node-engine", dataset, region, project, {
      metricType: "blockchainnodeengine.googleapis.com/node/json_rpc_error_count",
      resourceType: "blockchainnodeengine.googleapis.com/BlockchainNode",
      resourceLabels: res,
      metricLabels: { error_class: amp > 0.3 ? "UPSTREAM" : "NONE" },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(Math.floor(amp * 12), Math.floor(40 + amp * 8200))),
      },
    }),
    gcpMetricDoc(ts, "blockchain-node-engine", dataset, region, project, {
      metricType: "blockchainnodeengine.googleapis.com/node/json_rpc_latency_ms",
      resourceType: "blockchainnodeengine.googleapis.com/BlockchainNode",
      resourceLabels: res,
      metricLabels: { batch: amp > 0.35 ? "true" : "false" },
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      point: distributionFromMs(
        jitter(18 + amp * 420, 9 + amp * 180, 2, 1800 + amp * 12_000),
        randInt(30, Math.floor(800 + amp * 3200)),
        amp > 0.22
      ),
    }),
  ];
}

export function generateNetappVolumesMetrics(ts: string, er: number): EcsDocument[] {
  const { region, project } = pickGcpCloudContext();
  const dataset = GCP_METRICS_DATASET_MAP["netapp-volumes"]!;
  const resource_container = project.id;
  const name = `vol-${rand(["oracle", "sap"])}-${randId(4).toLowerCase()}`;
  const pool = `pool-${rand(["perf", "flex"])}-${randId(3).toLowerCase()}`;
  const volRes = { resource_container, location: region, name };
  const poolRes = { resource_container, location: region, name: pool };
  const amp = stressAmplifier(er);

  return [
    gcpMetricDoc(ts, "netapp-volumes", dataset, region, project, {
      metricType: "netapp.googleapis.com/volume/allocated_bytes",
      resourceType: "netapp.googleapis.com/Volume",
      resourceLabels: volRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(
            Math.floor((48 - amp * 28) * 1024 ** 3),
            Math.floor((880 - amp * 520) * 1024 ** 3)
          )
        ),
      },
    }),
    gcpMetricDoc(ts, "netapp-volumes", dataset, region, project, {
      metricType: "netapp.googleapis.com/volume/bytes_used",
      resourceType: "netapp.googleapis.com/Volume",
      resourceLabels: volRes,
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(
          randInt(
            Math.floor((22 + amp * 62) * 1024 ** 3),
            Math.floor((620 - amp * 220) * 1024 ** 3)
          )
        ),
      },
    }),
    gcpMetricDoc(ts, "netapp-volumes", dataset, region, project, {
      metricType: "netapp.googleapis.com/volume/average_latency",
      resourceType: "netapp.googleapis.com/Volume",
      resourceLabels: volRes,
      metricLabels: { method: rand(["read", "write", "metadata"]) },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: {
        doubleValue: dp(jitter(2.8 + amp * 24, 1.9 + amp * 12, 0.6, 18 + amp * 120), 2),
      },
    }),
    gcpMetricDoc(ts, "netapp-volumes", dataset, region, project, {
      metricType: "netapp.googleapis.com/storage_pool/total_size",
      resourceType: "netapp.googleapis.com/StoragePool",
      resourceLabels: poolRes,
      metricLabels: { custom_performance_enabled: amp > 0.38 ? "true" : "false" },
      metricKind: "GAUGE",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(3200, 28_000) * 1024 ** 3),
      },
    }),
    gcpMetricDoc(ts, "netapp-volumes", dataset, region, project, {
      metricType: "netapp.googleapis.com/volume/replication_lag_seconds",
      resourceType: "netapp.googleapis.com/Volume",
      resourceLabels: volRes,
      metricLabels: {
        volume_replication_relationship_health: amp > 0.45 ? "degraded" : "ok",
      },
      metricKind: "GAUGE",
      valueType: "DOUBLE",
      point: {
        doubleValue: dp(jitter(4 + amp * 420, 2 + amp * 140, 0.2, 3600 + amp * 28_800), 2),
      },
    }),
    gcpMetricDoc(ts, "netapp-volumes", dataset, region, project, {
      metricType: "netapp.googleapis.com/volume/throttle_operation_count",
      resourceType: "netapp.googleapis.com/Volume",
      resourceLabels: volRes,
      metricLabels: {
        throttle_reason: amp > 0.5 ? "IOPS_LIMIT" : "NONE",
      },
      metricKind: "DELTA",
      valueType: "INT64",
      point: {
        int64Value: toInt64String(randInt(Math.floor(amp * 3), Math.floor(8 + amp * 2400))),
      },
    }),
  ];
}
