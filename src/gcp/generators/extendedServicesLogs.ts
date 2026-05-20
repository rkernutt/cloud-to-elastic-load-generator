/**
 * GCP log generators for additional platform services (Agent Builder / Reasoning Engine,
 * Colab Enterprise, Distributed Cloud edge, Parallelstore, Dataform, BigLake, Certificate Manager,
 * Blockchain Node Engine, NetApp Volumes).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randLatencyMs,
  randSeverity,
  randZone,
  gcpCloud,
  makeGcpSetup,
  randBigQueryDataset,
  randBigQueryTable,
  randEmail,
  APP_DOMAINS,
} from "./helpers.js";
import { GCP_ELASTIC_DATASET_MAP } from "../data/elasticMaps.js";

const GRPC_ERROR_STATUSES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "FAILED_PRECONDITION",
  "UNAVAILABLE",
  "NOT_FOUND",
  "UNKNOWN",
] as const;

function logLevelFromGcpSeverity(severity: string): string {
  if (severity === "CRITICAL" || severity === "ERROR") return "error";
  if (severity === "WARNING") return "warning";
  if (severity === "NOTICE") return "notice";
  if (severity === "DEBUG") return "debug";
  return "info";
}

function structuredGcpFault(isErr: boolean): Record<string, unknown> {
  if (!isErr) return {};
  const status_code = rand(GRPC_ERROR_STATUSES);
  const messageByStatus: Partial<Record<(typeof GRPC_ERROR_STATUSES)[number], string>> = {
    INTERNAL: "Internal error while servicing the RPC; retry later",
    DEADLINE_EXCEEDED: "Deadline exceeded before the operation could complete",
    PERMISSION_DENIED: "Caller lacks permission for the requested resource",
    RESOURCE_EXHAUSTED: "Quota or concurrency limit exhausted for this resource",
    FAILED_PRECONDITION: "Request cannot be executed in the current resource state",
    UNAVAILABLE: "Backend service temporarily unavailable",
    NOT_FOUND: "Requested resource was not found",
    UNKNOWN: "Unknown error returned from the API backend",
  };
  return {
    "gcp.rpc": { status_code },
    error: {
      code: status_code,
      message: messageByStatus[status_code] ?? `RPC failed with status ${status_code}`,
      type: "gcp",
    },
  };
}

export function generateVertexAiAgentBuilderLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const reasoningEngineId = String(randInt(1_000_000_000_000, 9_007_199_254_740_991));
  const engineResource = `projects/${project.id}/locations/${region}/reasoningEngines/${reasoningEngineId}`;
  const scenario = isErr
    ? rand(["invoke_err", "memory_err", "quota"] as const)
    : rand(["invoke_ok", "memory_hit", "tool_call", "audit", "session_warm"] as const);
  const latencyMs = randLatencyMs(randInt(80, 2400), isErr);
  const severity = randSeverity(isErr);
  let message = "";
  const tokenIn = randInt(120, 12_000);
  const tokenOut = randInt(40, 8000);

  if (scenario === "invoke_err") {
    message = `ReasoningEngine.Query FAILED engine=${reasoningEngineId} code=${rand(["INVALID_ARGUMENT", "DEADLINE_EXCEEDED", "INTERNAL"])} upstream=${rand(["gemini", "vertex_endpoint", "internal_router"])}`;
  } else if (scenario === "memory_err") {
    message = `memory_bank.retrieve FAILED engine=${reasoningEngineId}: vector index unhealthy — shard=${randId(6)}`;
  } else if (scenario === "quota") {
    message = `Quota exceeded for reasoning_engine concurrent sessions project=${project.number} region=${region}`;
  } else if (scenario === "invoke_ok") {
    message = `ReasoningEngine.Query OK engine=${reasoningEngineId} latency_ms=${latencyMs} tokens_in=${tokenIn} tokens_out=${tokenOut}`;
  } else if (scenario === "memory_hit") {
    message = `memory_bank.retrieve OK engine=${reasoningEngineId} entities=${randInt(1, 24)} relevance=${rand(["HIGH", "MEDIUM"])}`;
  } else if (scenario === "tool_call") {
    message = `Agent tool invocation completed tool=${rand(["bigquery.run_query", "vertex.predict", "search.retrieve"])} outcome=${isErr ? "ERROR" : "OK"} correlation=${randId(16)}`;
  } else if (scenario === "session_warm") {
    message = `ReasoningEngine session pre-warm OK engine=${reasoningEngineId} cold_start_ms=${randInt(120, 2400)}`;
  } else {
    message = `Cloud Audit Logs: ${rand(["reasoningEngines.create", "reasoningEngines.update", "reasoningEngines.delete"])} on ${engineResource}`;
  }

  const apiMethod = "aiplatform.googleapis.com/v1/reasoningEngines.query";

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "aiplatform.googleapis.com/ReasoningEngine",
      location: region,
      reasoning_engine_id: reasoningEngineId,
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "aiplatform.googleapis.com"),
    gcp: {
      vertex_ai_agent_builder: {
        reasoning_engine_id: reasoningEngineId,
        reasoning_engine_resource: engineResource,
        api_method: apiMethod,
        scenario,
        latency_ms: latencyMs,
        tokens_input: tokenIn,
        tokens_output: tokenOut,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP["vertex-ai-agent-builder"],
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

export function generateColabEnterpriseLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instanceName = `colab-${rand(["research", "etl", "mlops"])}-${randId(5).toLowerCase()}`;
  const runtime = rand(["PYTHON311", "PYTHON312", "R"] as const);
  const scenario = isErr
    ? rand(["start_fail", "exec_fail", "quota_exceeded_api", "image_signature_fail"] as const)
    : rand([
        "schedule",
        "cell_ok",
        "idle_shutdown",
        "kernel_ready",
        "collaborative_session",
      ] as const);
  const latencyMs = randLatencyMs(randInt(400, 9000), isErr);
  const severity = randSeverity(isErr);
  const principal = rand([
    randEmail("agarcia"),
    `colab-runner@${project.id}.iam.gserviceaccount.com`,
  ]);
  const apiMethod =
    scenario === "schedule" || scenario === "cell_ok"
      ? "notebooks.googleapis.com/v1/projects/{project}/locations/{location}/executions/create"
      : "notebooks.googleapis.com/v1/projects/{project}/locations/{location}/instances/start";
  let message = "";

  if (scenario === "start_fail") {
    message = `colab enterprises runtime start FAILED instance=${instanceName} reason=${rand(["IMAGE_PULL_TIMEOUT", "QUOTA_EXCEEDED", "VPC_PEERING_NOT_READY"])}`;
  } else if (scenario === "exec_fail") {
    message = `Execution ${randId(10)} FAILED cell_idx=${randInt(0, 140)} error=${rand(["SyntaxError", "ModuleNotFoundError", "OOM"])}`;
  } else if (scenario === "quota_exceeded_api") {
    message = `Colab Enterprise API quota exceeded operation=CreateExecution principal=${principal} limit=${rand(["notebook.runs.per_day", "compute.gpu.hours"])}`;
  } else if (scenario === "image_signature_fail") {
    message = `Runtime image attestation FAILED instance=${instanceName} policy=${rand(["binary_authorization", "cosigned"])}`;
  } else if (scenario === "schedule") {
    message = `Scheduled notebook execution queued execution_id=${randId(12)} cron=${rand(["0 */6 * * *", "30 7 * * 1-5"])} principal=${principal}`;
  } else if (scenario === "cell_ok") {
    message = `Cell compute OK instance=${instanceName} runtime=${runtime} wall_ms=${latencyMs} gpu=${rand(["NONE", "T4", "L4"])}`;
  } else if (scenario === "kernel_ready") {
    message = `Jupyter kernel ready instance=${instanceName} kernel=${runtime} connect_ms=${randInt(120, 4200)}`;
  } else if (scenario === "collaborative_session") {
    message = `Shared session heartbeat instance=${instanceName} peers=${randInt(2, 18)} edits_per_min=${randInt(8, 220)}`;
  } else {
    message = `Idle shutdown triggered instance=${instanceName} idle_sec=${randInt(600, 7200)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "notebooks.googleapis.com/Instance",
      instance: instanceName,
      product: "colab-enterprise",
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "notebooks.googleapis.com"),
    gcp: {
      colab_enterprise: {
        instance_name: instanceName,
        runtime_image_family: runtime,
        api_method: apiMethod,
        scenario,
        principal_email: principal,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP["colab-enterprise"],
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

export function generateDistributedCloudLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const clusterName = `gdce-${rand(["prod", "factory", "retail"])}-${randId(4).toLowerCase()}`;
  const edgeZone = `${region}-zone-${rand(["a", "b"])}`;
  const machineId = `machine-${randId(6).toLowerCase()}`;
  const scenario = isErr
    ? rand(["disconnect", "upgrade_fail", "policy_bundle_reject"] as const)
    : rand([
        "sync_ok",
        "policy_rollout",
        "machine_health",
        "operator_heartbeat",
        "remote_command_ok",
      ] as const);
  const severity = randSeverity(isErr);
  const apiMethod =
    "edgecontainer.googleapis.com/v1/projects/{project}/locations/{location}/edgeClusters.reconcileConfig";
  let message = "";

  if (scenario === "disconnect") {
    message = `EdgeCluster ${clusterName} lost upstream connectivity policy=${rand(["RECONNECTING", "SURVIVABILITY"])} zone=${edgeZone}`;
  } else if (scenario === "upgrade_fail") {
    message = `GDCE upgrade blocked cluster=${clusterName} target=${rand(["1.29", "1.30"])} detail=${rand(["preflight_failed", "image_pull_backoff"])}`;
  } else if (scenario === "policy_bundle_reject") {
    message = `Fleet bundle rejected cluster=${clusterName} reason=${rand(["SIGNATURE_MISMATCH", "CRD_VERSION_CONFLICT"])} revision=${randId(8)}`;
  } else if (scenario === "sync_ok") {
    message = `Fleet config reconciled cluster=${clusterName} revision=${randId(8)} latency_ms=${randLatencyMs(randInt(200, 4000), false)}`;
  } else if (scenario === "policy_rollout") {
    message = `Config Connector bundle applied cluster=${clusterName} objects=${randInt(12, 420)}`;
  } else if (scenario === "operator_heartbeat") {
    message = `Edge operator heartbeat OK cluster=${clusterName} last_sync_ms=${randInt(120, 9000)} queue_depth=${randInt(0, 42)}`;
  } else if (scenario === "remote_command_ok") {
    message = `Remote exec completed cluster=${clusterName} machine=${machineId} exit_code=0`;
  } else if (scenario === "machine_health") {
    message = `Machine telemetry OK machine=${machineId} cluster=${clusterName} ambient_C=${randInt(18, 38)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "edgecontainer.googleapis.com/EdgeCluster",
      cluster_name: clusterName,
      edge_zone: edgeZone,
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "edgecontainer.googleapis.com"),
    gcp: {
      distributed_cloud: {
        cluster_name: clusterName,
        edge_zone: edgeZone,
        machine_id: machineId,
        api_method: apiMethod,
        scenario,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP["distributed-cloud"],
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 600_000 : 45_000),
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

export function generateParallelstoreLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const zone = randZone(region);
  const instanceId = `ps-${rand(["hpc", "sim", "cfd"])}-${randId(5).toLowerCase()}`;
  const scenario = isErr
    ? rand(["fail_state", "export_err", "mds_partition_err"] as const)
    : rand([
        "io_read",
        "io_write",
        "import_job",
        "capacity_rebalance_ok",
        "fs_ck_scheduled",
      ] as const);
  const severity = randSeverity(isErr);
  const mibPerSec = randInt(isErr ? 200 : 1200, isErr ? 2800 : 22_000);
  const apiMethod =
    scenario === "export_err" || scenario === "import_job"
      ? "parallelstore.googleapis.com/v1/projects/{project}/locations/{location}/instances/importData"
      : "parallelstore.googleapis.com/v1/projects/{project}/locations/{location}/instances.list";
  let message = "";

  if (scenario === "fail_state") {
    message = `Parallelstore instance ${instanceId} entered FAILED maintenance_window=${rand(["NONE", "AUTO"])}`;
  } else if (scenario === "export_err") {
    message = `Export job gs://${project.id}-scratch/export-${randId(6)} FAILED stage=${rand(["METADATA", "DATA_COPY"])}`;
  } else if (scenario === "mds_partition_err") {
    message = `DAOS metadata service partition HEALTH_WARN instance=${instanceId} rank=${randInt(0, 127)}`;
  } else if (scenario === "io_read") {
    message = `DAOS aggregate read throughput instance=${instanceId} zone=${zone} MiB/s=${mibPerSec} clients=${randInt(4, 128)}`;
  } else if (scenario === "io_write") {
    message = `Parallelstore write burst instance=${instanceId} sustained_MiB/s=${mibPerSec} stripe=${rand(["balanced", "throughput"])}`;
  } else if (scenario === "capacity_rebalance_ok") {
    message = `Stripe rebalance OK instance=${instanceId} migrated_objects=${randInt(800, 120_000)} eta_min=${randInt(2, 480)}`;
  } else if (scenario === "fs_ck_scheduled") {
    message = `Consistency check scheduled instance=${instanceId} window=${rand(["SAT 03:00 UTC", "SUN 06:00 local"])}`;
  } else {
    message = `Import job completed objects=${randInt(1200, 9_000_000)} bytes=${randInt(8e9, 48e11)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "parallelstore.googleapis.com/Instance",
      location: zone,
      instance_id: instanceId,
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "parallelstore.googleapis.com"),
    gcp: {
      parallelstore: {
        instance_id: instanceId,
        zone,
        throughput_mib_per_sec: mibPerSec,
        api_method: apiMethod,
        scenario,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP.parallelstore,
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: randInt(800, isErr ? 900_000 : 120_000),
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

export function generateDataformLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const repoId = `df-repo-${rand(["finance", "growth", "risk"])}-${randId(4).toLowerCase()}`;
  const invocationId = `wf-inv-${randId(12).toLowerCase()}`;
  const scenario = isErr
    ? rand(["compile_fail", "run_fail", "git_fetch_fail"] as const)
    : rand(["compile_ok", "run_ok", "git_push", "scheduled_compile", "unit_tests_ok"] as const);
  const apiMethodCompile = "dataform.googleapis.com/v1beta1/repositories.compile";
  const apiMethod =
    scenario === "compile_ok" || scenario === "compile_fail" || scenario === "scheduled_compile"
      ? apiMethodCompile
      : "dataform.googleapis.com/v1beta1/workflowInvocations.create";
  const severity = randSeverity(isErr);
  let message = "";

  if (scenario === "compile_fail") {
    message = `CompilationResult FAILED repo=${repoId}: unresolved reference ${rand(['ref("missing")', "dependency cycle"])}`;
  } else if (scenario === "run_fail") {
    message = `WorkflowInvocation terminalState=FAILED invocation=${invocationId} repo=${repoId} failing_action=${rand(["staging.orders", "reporting.metrics"])}`;
  } else if (scenario === "git_fetch_fail") {
    message = `Repository sync FAILED repo=${repoId} remote=${rand(["github.enterprise", "gitlab.internal"])} error=${rand(["AUTH_FAILED", "FAST_FORWARD_ONLY"])}`;
  } else if (scenario === "compile_ok") {
    message = `CompilationResult OK repo=${repoId} actions=${randInt(40, 420)} assertions=${randInt(0, 12)}`;
  } else if (scenario === "run_ok") {
    message = `WorkflowInvocation terminalState=SUCCEEDED invocation=${invocationId} runtime_sec=${randInt(120, 7200)}`;
  } else if (scenario === "scheduled_compile") {
    message = `Scheduled compilation triggered repo=${repoId} cron=${rand(["*/15 * * * *", "0 5 * * *"])} actor=${rand(["serviceAcct:df-ci", "user:analyst"])}`;
  } else if (scenario === "unit_tests_ok") {
    message = `Dataform unit tests passed repo=${repoId} tests=${randInt(4, 120)} duration_sec=${randInt(8, 420)}`;
  } else {
    message = `Repository commit pushed repo=${repoId} branch=${rand(["main", "staging"])} sha=${randId(40)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "dataform.googleapis.com/Repository",
      repository_id: repoId,
      location: region,
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "dataform.googleapis.com"),
    gcp: {
      dataform: {
        repository_id: repoId,
        workflow_invocation_id: invocationId,
        api_method: apiMethod,
        scenario,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP.dataform,
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: randInt(1500, isErr ? 3_600_000 : 480_000),
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

export function generateBiglakeLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const catalog = `biglake-${rand(["bronze", "silver", "lakehouse"])}-${randId(4).toLowerCase()}`;
  const bqDataset = randBigQueryDataset();
  const table = randBigQueryTable();
  const scenario = isErr
    ? rand(["metadata_err", "auth_err", "warehouse_throttle"] as const)
    : rand([
        "register_table",
        "refresh_snapshot",
        "query_route",
        "policy_grant_ok",
        "iceberg_expire_snapshots",
      ] as const);
  const severity = randSeverity(isErr);
  const apiMethod =
    "biglake.googleapis.com/v1/projects/{project}/locations/{location}/catalogs.tables.get";
  let message = "";

  if (scenario === "metadata_err") {
    message = `Iceberg metadata refresh FAILED catalog=${catalog} table=${bqDataset}.${table}: commit mismatch`;
  } else if (scenario === "auth_err") {
    message = `BigLake federation denied principal=${rand(["svc-etl", "analyst-group"])} table=${bqDataset}.${table}`;
  } else if (scenario === "warehouse_throttle") {
    message = `Storage API scan throttled catalog=${catalog} table=${bqDataset}.${table} backoff_ms=${randInt(200, 9500)}`;
  } else if (scenario === "register_table") {
    message = `Registered BigLake managed table=${bqDataset}.${table} catalog=${catalog} format=${rand(["ICEBERG", "DELTA"])}`;
  } else if (scenario === "refresh_snapshot") {
    message = `Snapshot pinned snapshot_id=${randInt(1000000, 999999999)} table=${bqDataset}.${table}`;
  } else if (scenario === "policy_grant_ok") {
    message = `Row access policy evaluated ALLOW catalog=${catalog} table=${bqDataset}.${table} principals=${randInt(1, 42)}`;
  } else if (scenario === "iceberg_expire_snapshots") {
    message = `Maintenance job removed snapshots catalog=${catalog} table=${bqDataset}.${table} retained=${randInt(2, 24)}`;
  } else {
    message = `BigQuery routed scan via Storage API bytes=${randInt(8e8, 28e11)} slots=${randInt(12, 2400)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "biglake.googleapis.com/Catalog",
      catalog_name: catalog,
      dataset_id: bqDataset,
      table_id: table,
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "biglake.googleapis.com"),
    gcp: {
      biglake: {
        catalog_name: catalog,
        dataset_id: bqDataset,
        table_id: table,
        api_method: apiMethod,
        scenario,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP.biglake,
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: randLatencyMs(randInt(120, 6000), isErr),
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

export function generateCertificateManagerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const mapId = `cert-map-${rand(["edge", "global"])}-${randId(4).toLowerCase()}`;
  const scenario = isErr
    ? rand(["provision_fail", "dns_fail", "dns_authorization_fail"] as const)
    : rand([
        "cert_active",
        "map_attach",
        "cert_renewal_ok",
        "cert_expired_warning",
        "map_primary_rotation",
      ] as const);
  const apiMethodProvision = "certificatemanager.googleapis.com/v1/certificates.create";
  let severity = randSeverity(isErr);
  if (scenario === "cert_expired_warning") severity = "WARNING";
  const apiMethod =
    scenario === "cert_renewal_ok" ||
    scenario === "cert_expired_warning" ||
    scenario === "provision_fail"
      ? apiMethodProvision
      : "certificatemanager.googleapis.com/v1/certificateMaps.entries.create";
  let message = "";

  if (scenario === "provision_fail") {
    message = `Managed certificate provisioning FAILED map=${mapId}: ACME challenge=${rand(["TIMEOUT", "NXDOMAIN"])}`;
  } else if (scenario === "dns_fail") {
    message = `Authorization update FAILED certificate_map=${mapId}: TXT record conflict`;
  } else if (scenario === "dns_authorization_fail") {
    message = `DNS authorization FAILED map=${mapId} domain=${rand(APP_DOMAINS)} reason=${rand(["CAA_CONFLICT", "DELEGATION_BREAK"])}`;
  } else if (scenario === "cert_active") {
    message = `Certificate ACTIVE map=${mapId} domains=${randInt(1, 18)} authority=${rand(["PUBLIC_CA", "PRIVATE_CA"])}`;
  } else if (scenario === "cert_renewal_ok") {
    message = `Managed certificate renewed map=${mapId} serial=${randId(16)} not_after_days=${randInt(30, 82)}`;
  } else if (scenario === "cert_expired_warning") {
    message = `WARNING certificate within renewal window map=${mapId} days_to_expiry=${randInt(1, 14)}`;
  } else if (scenario === "map_primary_rotation") {
    message = `Certificate map PRIMARY rotation completed map=${mapId} hosts=${randInt(2, 120)}`;
  } else if (scenario === "map_attach") {
    message = `Certificate map entry PRIMARY flip hostname=${rand(APP_DOMAINS)} serial=${randId(16)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "certificatemanager.googleapis.com/CertificateMap",
      certificate_map_id: mapId,
      location: region,
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "certificatemanager.googleapis.com"),
    gcp: {
      certificate_manager: {
        certificate_map_id: mapId,
        api_method: apiMethod,
        scenario,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP["certificate-manager"],
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: randInt(600, isErr ? 2_400_000 : 180_000),
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

export function generateBlockchainNodeEngineLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const nodeId = `bne-${rand(["eth", "polygon"])}-${randId(6).toLowerCase()}`;
  const scenario = isErr
    ? rand(["rpc_spike", "peer_drop", "beacon_head_lag", "mempool_pressure"] as const)
    : rand(["sync_ok", "block_import", "peer_discovery", "chain_reorg", "rpc_batch_ok"] as const);
  let severity = randSeverity(isErr);
  if (scenario === "chain_reorg") severity = rand(["NOTICE", "WARNING"] as const);
  const height = randInt(isErr ? 1_800_000 : 9_000_000, isErr ? 2_400_000 : 21_000_000);
  const apiMethod =
    scenario === "rpc_batch_ok" || scenario === "rpc_spike"
      ? "blockchainnodeengine.googleapis.com/v1/projects/{project}/locations/{location}/nodes:batchEthereumJsonRpc"
      : "blockchainnodeengine.googleapis.com/v1/projects/{project}/locations/{location}/nodes.get";
  let message = "";

  if (scenario === "rpc_spike") {
    message = `JSON-RPC latency spike endpoint=${rand(["eth_call", "eth_getLogs"])} p99_ms=${randInt(800, 9000)}`;
  } else if (scenario === "peer_drop") {
    message = `Peer count dropped node=${nodeId} healthy_peers_before=${randInt(40, 120)} after=${randInt(4, 25)}`;
  } else if (scenario === "beacon_head_lag") {
    message = `Beacon head lag node=${nodeId} slots_behind=${randInt(3, 128)} execution_syncing=${rand(["true", "false"])}`;
  } else if (scenario === "mempool_pressure") {
    message = `Mempool pressure node=${nodeId} pending_tx=${randInt(8_000, 420_000)} dropped=${randInt(0, 1800)}`;
  } else if (scenario === "sync_ok") {
    message = `Beacon sync healthy node=${nodeId} slot=${randInt(500_000, 12_000_000)} finalized_epoch=${randInt(12000, 380000)}`;
  } else if (scenario === "peer_discovery") {
    message = `Discovered execution peers node=${nodeId} new_peers=${randInt(2, 28)} healthy=${randInt(48, 128)}`;
  } else if (scenario === "chain_reorg") {
    message = `Canonical chain reorg depth=${randInt(1, 6)} node=${nodeId} new_head=${height}`;
  } else if (scenario === "rpc_batch_ok") {
    message = `JSON-RPC batch OK node=${nodeId} requests=${randInt(4, 120)} wall_ms=${randInt(12, 420)}`;
  } else {
    message = `Execution client imported blocks=${randInt(1, 28)} height=${height} total_difficulty_trunc=${randId(12)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "blockchainnodeengine.googleapis.com/BlockchainNode",
      blockchain_node_id: nodeId,
      location: region,
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "blockchainnodeengine.googleapis.com"),
    gcp: {
      blockchain_node_engine: {
        blockchain_node_id: nodeId,
        block_height: height,
        api_method: apiMethod,
        scenario,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP["blockchain-node-engine"],
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: randInt(400, isErr ? 120_000 : 18_000),
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

export function generateNetappVolumesLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const volumeName = `vol-${rand(["oracle", "sap", "shared"])}-${randId(4).toLowerCase()}`;
  const poolName = `pool-${rand(["perf", "flex"])}-${randId(3).toLowerCase()}`;
  const scenario = isErr
    ? rand(["snapshot_fail", "capacity_pressure", "snapmirror_backlog"] as const)
    : rand([
        "mount_ok",
        "backup_job",
        "snapshot_create",
        "replication_ok",
        "quota_warning",
      ] as const);
  let severity = randSeverity(isErr);
  if (scenario === "quota_warning") severity = "WARNING";
  const apiMethod =
    scenario === "snapshot_create" || scenario === "snapshot_fail"
      ? "netapp.googleapis.com/v1/projects/{project}/locations/{location}/volumes.snapshots.create"
      : "netapp.googleapis.com/v1/projects/{project}/locations/{location}/volumes.replicate";
  let message = "";

  if (scenario === "snapshot_fail") {
    message = `Snapshot policy FAILED volume=${volumeName}: transfer backlog`;
  } else if (scenario === "capacity_pressure") {
    message = `Inode utilization warning volume=${volumeName} inode_used_ratio=${randFloatPercent(isErr)}`;
  } else if (scenario === "snapmirror_backlog") {
    message = `SnapMirror backlog volume=${volumeName} lag_sec=${randInt(120, 86_400)} relationship=${rand(["DR", "HA"])}`;
  } else if (scenario === "mount_ok") {
    message = `NFS mount OK volume=${volumeName} pool=${poolName} smb_vs_nfs=nfs exports=${randInt(1, 64)}`;
  } else if (scenario === "snapshot_create") {
    message = `Snapshot created volume=${volumeName} name=snap-${randId(8)} bytes=${randInt(2e9, 48e11)}`;
  } else if (scenario === "replication_ok") {
    message = `Replication healthy volume=${volumeName} RPO_sec=${randInt(30, 900)} last_transfer_OK=true`;
  } else if (scenario === "quota_warning") {
    message = `Quota warning volume=${volumeName} used_pct=${randInt(82, 97)} soft_limit=${rand(["enforced", "alert_only"])}`;
  } else {
    message = `Backup transfer progressing volume=${volumeName} transferred_GiB=${randInt(120, 8800)}`;
  }

  return {
    "@timestamp": ts,
    severity,
    log: { level: logLevelFromGcpSeverity(severity) },
    labels: {
      "resource.type": "netapp.googleapis.com/Volume",
      volume_name: volumeName,
      storage_pool_name: poolName,
      location: region,
      api_method: apiMethod,
    },
    cloud: gcpCloud(region, project, "netapp.googleapis.com"),
    gcp: {
      netapp_volumes: {
        volume_name: volumeName,
        storage_pool_name: poolName,
        api_method: apiMethod,
        scenario,
      },
    },
    event: {
      kind: "event",
      category: ["process"],
      type: isErr ? ["error"] : ["info"],
      action: "extended-service",
      dataset: GCP_ELASTIC_DATASET_MAP["netapp-volumes"],
      module: "gcp",
      outcome: isErr ? "failure" : "success",
      duration: randInt(700, isErr ? 3_600_000 : 240_000),
    },
    message,
    ...structuredGcpFault(isErr),
  };
}

function randFloatPercent(isErr: boolean): number {
  const base = isErr ? 0.92 : 0.62;
  return Math.round((base + Math.random() * 0.06) * 1000) / 1000;
}
