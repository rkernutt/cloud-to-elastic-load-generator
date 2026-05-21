/**
 * GCP management, governance, and platform log generators.
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randFloat,
  randIp,
  gcpCloud,
  makeGcpSetup,
  randPrincipal,
  randProject,
  randLatencyMs,
  randSeverity,
  EMAIL_DOMAINS,
} from "./helpers.js";

const GRPC_RPC_STATUSES = [
  "INTERNAL",
  "DEADLINE_EXCEEDED",
  "PERMISSION_DENIED",
  "RESOURCE_EXHAUSTED",
  "NOT_FOUND",
  "ALREADY_EXISTS",
  "UNAVAILABLE",
] as const;

type GrpcRpcStatus = (typeof GRPC_RPC_STATUSES)[number];

const GRPC_MESSAGES: Partial<Record<GrpcRpcStatus, string>> = {
  INTERNAL: "Management API internal error",
  DEADLINE_EXCEEDED: "Resource Manager or long-running operation deadline exceeded",
  PERMISSION_DENIED: "Missing resourcemanager.projects.update or iam policy privilege",
  RESOURCE_EXHAUSTED: "Change quota or concurrency limit exhausted",
  NOT_FOUND: "Project, folder, deployment, or feed resource not found",
  ALREADY_EXISTS: "Resource already exists in parent collection",
  UNAVAILABLE: "Control plane temporarily unavailable",
};

function grpcStructuredFault(isErr: boolean): {
  spread: Record<string, unknown>;
  rpcLabel: Record<string, string>;
} {
  if (!isErr) return { spread: {}, rpcLabel: {} };
  const status_code = rand(GRPC_RPC_STATUSES);
  return {
    spread: {
      "gcp.rpc": { status_code },
      error: {
        code: status_code,
        message: GRPC_MESSAGES[status_code] ?? `RPC ${status_code}`,
        type: "gcp",
      },
    },
    rpcLabel: { "gcp.rpc.status_code": status_code },
  };
}

export function generateCloudMonitoringLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const metricType = rand([
    "compute.googleapis.com/instance/cpu/utilization",
    "loadbalancing.googleapis.com/https/request_count",
    "cloudsql.googleapis.com/database/cpu/utilization",
    "kubernetes.io/container/cpu/core_usage_time",
  ] as const);
  const thresholdValue = randFloat(0.6, 0.95);
  const currentValue = isErr
    ? randFloat(thresholdValue, thresholdValue + 0.25)
    : randFloat(0.1, thresholdValue - 0.05);
  const state = isErr ? rand(["FIRING", "NO_DATA"]) : rand(["OK", "FIRING"]);
  const notificationChannelType = rand(["email", "pagerduty", "slack", "pubsub"] as const);
  const policyKind = rand(["high-cpu", "error-rate", "disk", "latency"] as const);
  const alertPolicyName = `policy-${policyKind}-${randId(4)}`;
  const conditionName = `condition-${randId(6)}`;
  const kind = isErr
    ? rand(["alert_fail", "alert_firing", "snapshots_query", "alert_policies_patch"] as const)
    : rand([
        "alert_ok",
        "uptime",
        "metric_descriptor",
        "timeseries",
        "channel",
        "snapshots_query",
        "metrics_scopes_list",
      ] as const);
  const severity = randSeverity(isErr);
  let message = "";
  let apiMethod = "";

  if (kind === "alert_firing" || kind === "alert_fail") {
    apiMethod = `monitoring.googleapis.com/v3/projects/${project.id}/alertPolicies/${alertPolicyName}/conditions:list`;
    message =
      kind === "alert_fail"
        ? `Alerting notification delivery failed for policy="${alertPolicyName}" channel=${notificationChannelType}: ${rand(["Invalid OAuth token for Slack", "PagerDuty 429 rate limit", "Pub/Sub topic not found"])}`
        : `Alerting policy "${alertPolicyName}" triggered: condition "${conditionName}" is TRUE; metric=${metricType} value=${currentValue.toFixed(4)} threshold=${thresholdValue.toFixed(4)}`;
  } else if (kind === "alert_ok") {
    apiMethod = `monitoring.googleapis.com/v3/projects/${project.id}/notificationChannels/${notificationChannelType}:simulate`;
    message = `Incident cleared: policy="${alertPolicyName}" condition "${conditionName}" returned to OK (metric=${metricType}, value=${currentValue.toFixed(4)})`;
  } else if (kind === "uptime") {
    apiMethod = `monitoring.googleapis.com/v3/projects/${project.id}/uptimeCheckConfigs`;
    const url = rand([
      `https://api.${rand(EMAIL_DOMAINS)}/health`,
      `https://status.${rand(EMAIL_DOMAINS)}/ready`,
    ]);
    const checkLatency = randLatencyMs(randInt(20, 800), isErr);
    message = isErr
      ? `Uptime check FAILED: checker=us-east4 url=${url} latency_ms=${checkLatency} error=${rand(["HTTP 503", "TLS handshake timeout", "DNS resolution failed"])}`
      : `Uptime check PASSED: url=${url} latency_ms=${checkLatency} response_code=200 region=${region}`;
  } else if (kind === "metric_descriptor") {
    apiMethod = `monitoring.googleapis.com/v3/projects/${project.id}/metricDescriptors`;
    message = `CreateMetricDescriptor projects/${project.id}/metricDescriptors/workload.googleapis.com/${rand(["custom/request_latency", "custom/queue_depth", "custom/job_failures"])}`;
  } else if (kind === "timeseries") {
    apiMethod = `monitoring.googleapis.com/v3/projects/${project.id}/timeSeries:create`;
    message = `monitoring.googleapis.com: WriteTimeSeries accepted_points=${randInt(1, 500)} rejected_points=${isErr ? randInt(1, 50) : 0} metric_type=${metricType}`;
  } else if (kind === "snapshots_query") {
    apiMethod = `monitoring.googleapis.com/v3/projects/${project.id}/timeSeries:query`;
    message = isErr
      ? `Monitoring QueryService.Query FAILED PROMQL parse error (${rand(["invalid label matcher", "rate() window"])})`
      : `QueryService.Query returned ${randInt(1, 500)} series window=${rand(["5m", "1h", "24h"])}`;
  } else if (kind === "alert_policies_patch") {
    apiMethod = `monitoring.googleapis.com/v3/projects/${project.id}/alertPolicies/${alertPolicyName}`;
    message = isErr
      ? `PatchAlertPolicy FAILED etag mismatch — conditional update conflict`
      : `PatchAlertPolicy updated conditions=${randInt(1, 6)}`;
  } else if (kind === "metrics_scopes_list") {
    apiMethod = `monitoring.googleapis.com/v1/locations/global/metricsScopes/${project.id}/projects:list`;
    message = isErr
      ? `metricsScopes.projects.list FAILED PERMISSION_DENIED`
      : `metricsScopes projects attached=${randInt(1, 40)}`;
  } else {
    apiMethod = `monitoring.googleapis.com/v3/projects/${project.id}/notificationChannels`;
    message = `Notification channel updated: display_name="${rand(["oncall-slack", "sec-email", "billing-pd"])}" type=${notificationChannelType} verified=${!isErr}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "monitoring.googleapis.com/AlertPolicy",
      policy: alertPolicyName,
      api_method: apiMethod,
      monitoring_kind: kind,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "monitoring.googleapis.com"),
    gcp: {
      cloud_monitoring: {
        kind,
        api_method: apiMethod,
        alert_policy_name: alertPolicyName,
        condition_name: conditionName,
        metric_type: metricType,
        threshold_value: Math.round(thresholdValue * 1000) / 1000,
        current_value: Math.round(currentValue * 1000) / 1000,
        state,
        notification_channel_type: notificationChannelType,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(200, 15_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateCloudLoggingLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const logSuffix = rand(["application", "audit", "vpc_flow", "loadbalancer"] as const);
  const logName = `projects/${project.id}/logs/${logSuffix}`;
  const sinkSuffix = rand(["to-bq", "to-gcs", "security", "archive"] as const);
  const sinkName = `sink-${sinkSuffix}`;
  const destination = rand(["bigquery", "cloud-storage", "pubsub"] as const);
  const filterExpression = 'resource.type="gce_instance" AND severity>=ERROR';
  const entriesExported = isErr ? randInt(0, 500) : randInt(2000, 500_000);
  const errorsCount = isErr ? randInt(3, 500) : randInt(0, 5);
  const exclusionName = Math.random() < 0.35 ? `exclusion-${randId(4)}` : "";

  const SCENARIOS = [
    "sinks_create",
    "sinks_get",
    "sinks_patch",
    "sinks_delete",
    "metrics_create",
    "entries_write",
  ] as const;
  const scenario = rand(SCENARIOS);

  let apiMethod = "";
  let message = "";
  const severity = randSeverity(isErr);

  if (scenario === "sinks_create") {
    apiMethod = `logging.googleapis.com/v2/projects/${project.id}/sinks`;
    message = isErr
      ? `logging.googleapis.com: CreateSink FAILED "${sinkName}" dest=${destination} errors=${errorsCount}: ${GRPC_MESSAGES.PERMISSION_DENIED}`
      : `CreateSink LRO completed sink="${sinkName}" writers_identity=serviceAccount:logging@...`;
  } else if (scenario === "sinks_get") {
    apiMethod = `logging.googleapis.com/v2/projects/${project.id}/sinks/${sinkName}`;
    message = isErr
      ? `GetSink FAILED NOT_FOUND sink=${sinkName}`
      : `GetSink ${sinkName} filter_bytes=${randInt(40, 4000)}`;
  } else if (scenario === "sinks_patch") {
    apiMethod = `logging.googleapis.com/v2/projects/${project.id}/sinks/${sinkName}`;
    message = isErr
      ? `UpdateSink FAILED filter validation INVALID_ARGUMENT (${errorsCount} errors)`
      : `UpdateSink ${sinkName} destination=${destination} updated exclusions=${exclusionName ? 1 : 0}`;
  } else if (scenario === "sinks_delete") {
    apiMethod = `logging.googleapis.com/v2/projects/${project.id}/sinks/${sinkName}`;
    message = isErr
      ? `DeleteSink FAILED FAILED_PRECONDITION (sink has pending exports)`
      : `DeleteSink OK ${sinkName}`;
  } else if (scenario === "metrics_create") {
    apiMethod = `logging.googleapis.com/v2/projects/${project.id}/metrics`;
    message = isErr
      ? `CreateLogMetric FAILED name=custom-errors metric_filter parse error INTERNAL`
      : `CreateLogMetric OK name=severity_error_count sinks=${sinkName}`;
  } else {
    apiMethod = `logging.googleapis.com/v2/entries:write`;
    message = isErr
      ? `logging.googleapis.com: Sink "${sinkName}" write to ${destination} failed ${errorsCount} times: ${rand(["Permission bigquery.datasets.get denied", "Destination bucket not found", "Invalid sink filter expression"])}`
      : `entries.write accepted=${entriesExported} log_name matched ${logName}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "logging.googleapis.com/Project",
      sink: sinkName,
      api_method: apiMethod,
      logging_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "logging.googleapis.com"),
    gcp: {
      cloud_logging: {
        scenario,
        api_method: apiMethod,
        log_name: logName,
        sink_name: sinkName,
        destination,
        filter_expression: filterExpression,
        entries_exported: entriesExported,
        errors_count: errorsCount,
        exclusion_name: exclusionName || null,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(1000, 120_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateResourceManagerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const parentOrg = `organizations/${randInt(100000000000, 999999999999)}`;
  const folderId = `${randInt(100000000000, 999999999999)}`;
  const actor = randPrincipal(project);

  const SCENARIOS = [
    "projects_create",
    "projects_getIamPolicy",
    "projects_setIamPolicy",
    "folders_create",
    "folders_move",
    "services_disable",
  ] as const;
  const scenario = rand(SCENARIOS);

  let service = "cloudresourcemanager.googleapis.com";
  let resourceType = rand(["project", "folder", "organization"] as const);
  let action = "CREATE";
  let apiMethod = "";
  let resourceName = `projects/${project.id}`;
  let message = "";

  if (scenario === "projects_create") {
    action = "CREATE";
    resourceType = "project";
    apiMethod = `cloudresourcemanager.googleapis.com/v3/projects`;
    resourceName = `projects/${project.id}`;
    message = isErr
      ? `CreateProject FAILED parent=${parentOrg}: ALREADY_EXISTS project_id=${project.id}`
      : `CreateProject LRO completed project=${project.id} parent=${parentOrg}`;
  } else if (scenario === "projects_getIamPolicy") {
    action = "GET_IAM_POLICY";
    resourceType = "project";
    apiMethod = `cloudresourcemanager.googleapis.com/v3/projects/${project.id}:getIamPolicy`;
    resourceName = `projects/${project.id}`;
    message = isErr
      ? `getIamPolicy FAILED ${resourceName}: PERMISSION_DENIED actor=${actor}`
      : `getIamPolicy bindings=${randInt(2, 80)} version=${randInt(1, 3)}`;
  } else if (scenario === "projects_setIamPolicy") {
    action = "SET_IAM_POLICY";
    resourceType = "project";
    apiMethod = `cloudresourcemanager.googleapis.com/v3/projects/${project.id}:setIamPolicy`;
    resourceName = `projects/${project.id}`;
    message = isErr
      ? `setIamPolicy FAILED FAILED_PRECONDITION (policy etag mismatch)`
      : `setIamPolicy updated role=${rand(["roles/editor", "roles/viewer", "roles/owner"])}`;
  } else if (scenario === "folders_create") {
    action = "CREATE";
    resourceType = "folder";
    apiMethod = `cloudresourcemanager.googleapis.com/v3/folders`;
    resourceName = `folders/${folderId}`;
    message = isErr
      ? `CreateFolder FAILED parent=${parentOrg}: INVALID_DISPLAY_NAME`
      : `CreateFolder ${resourceName} under ${parentOrg}`;
  } else if (scenario === "folders_move") {
    action = "MOVE";
    resourceType = "folder";
    apiMethod = `cloudresourcemanager.googleapis.com/v3/folders/${folderId}:move`;
    resourceName = `folders/${folderId}`;
    message = isErr
      ? `MoveFolder FAILED destination has cycle — FAILED_PRECONDITION`
      : `MoveFolder ${resourceName} -> parent=${parentOrg}`;
  } else {
    service = "servicemanagement.googleapis.com";
    action = "DISABLE_SERVICE";
    resourceType = "project";
    apiMethod = `servicemanagement.googleapis.com/v1/services/${rand(["compute.googleapis.com", "container.googleapis.com"])}/projectSettings/${project.id}:disable`;
    resourceName = `projects/${project.id}`;
    message = isErr
      ? `DisableService FAILED service=compute.googleapis.com: CONSUMER_INVALID`
      : `DisableService LRO started consumer=${project.id}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudresourcemanager.googleapis.com/Project",
      method: action,
      api_method: apiMethod,
      rm_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, service),
    gcp: {
      resource_manager: {
        scenario,
        service,
        api_method: apiMethod,
        resource_type: resourceType,
        action,
        resource_name: resourceName,
        parent: parentOrg,
        actor,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(80, 25_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateDeploymentManagerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const deployKind = rand(["network", "data", "app"] as const);
  const deploymentName = `deploy-${deployKind}-${randId(4)}`;
  const gcpResourceType = rand([
    "compute.v1.instance",
    "container.v1.cluster",
    "sqladmin.v1beta4.instance",
    "storage.v1.bucket",
  ] as const);
  const resourcePrefix = rand(["vm", "cluster", "db", "bucket"] as const);
  const resourceShortName = `${resourcePrefix}-${randId(6)}`;
  const manifestConfig = `https://www.googleapis.com/deploymentmanager/v2/projects/${project.id}/global/deployments/${deploymentName}`;
  const status = isErr ? rand(["FAILED", "CANCELLED"]) : rand(["DONE", "RUNNING"]);

  const SCENARIOS = [
    "deployments_insert",
    "deployments_get",
    "deployments_delete",
    "manifests_get",
    "resources_list",
    "types_list",
  ] as const;
  const scenario = rand(SCENARIOS);

  let apiMethod = "";
  let operation = "CREATE";
  let message = "";

  if (scenario === "deployments_insert") {
    operation = "CREATE";
    apiMethod = `deploymentmanager.googleapis.com/v2/projects/${project.id}/global/deployments`;
    message = isErr
      ? `insert deployment FAILED ${deploymentName} ${gcpResourceType}: ${rand(["Reference not found", "API compute.googleapis.com not enabled", "Quota 'INSTANCES' exceeded"])}`
      : `Deployment insert ${deploymentName} status=${status} resources=${randInt(2, 120)}`;
  } else if (scenario === "deployments_get") {
    operation = "GET";
    apiMethod = `deploymentmanager.googleapis.com/v2/projects/${project.id}/global/deployments/${deploymentName}`;
    message = isErr
      ? `Get deployment FAILED NOT_FOUND`
      : `Get deployment fingerprint=${randId(16)}`;
  } else if (scenario === "deployments_delete") {
    operation = "DELETE";
    apiMethod = `deploymentmanager.googleapis.com/v2/projects/${project.id}/global/deployments/${deploymentName}`;
    message = isErr
      ? `Delete deployment FAILED FAILED_PRECONDITION resources still updating`
      : `Delete deployment LRO started ${deploymentName}`;
  } else if (scenario === "manifests_get") {
    operation = "GET";
    apiMethod = `deploymentmanager.googleapis.com/v2/projects/${project.id}/global/deployments/${deploymentName}/manifest`;
    message = isErr
      ? `Get manifest FAILED INTERNAL`
      : `Manifest config size_bytes=${randInt(4_000, 800_000)}`;
  } else if (scenario === "resources_list") {
    operation = "LIST";
    apiMethod = `deploymentmanager.googleapis.com/v2/projects/${project.id}/global/deployments/${deploymentName}/resources`;
    message = isErr
      ? `List deployment resources PERMISSION_DENIED`
      : `Resources count=${randInt(1, 80)}`;
  } else {
    operation = "LIST";
    apiMethod = `deploymentmanager.googleapis.com/v2/projects/${project.id}/global/types`;
    message = isErr ? `List types FAILED UNAVAILABLE` : `Provider types listed provider=ga`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "deploymentmanager.googleapis.com/Deployment",
      deployment: deploymentName,
      api_method: apiMethod,
      dm_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "deploymentmanager.googleapis.com"),
    gcp: {
      deployment_manager: {
        scenario,
        api_method: apiMethod,
        deployment_name: deploymentName,
        resource_type: gcpResourceType,
        resource_name: resourceShortName,
        operation,
        manifest_config: manifestConfig,
        status,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(2000, isErr ? 1_800_000 : 600_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateCloudAssetInventoryLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const assetType = rand([
    "compute.googleapis.com/Instance",
    "storage.googleapis.com/Bucket",
    "iam.googleapis.com/ServiceAccount",
    "container.googleapis.com/Cluster",
  ] as const);
  const assetName = `//compute.googleapis.com/projects/${project.id}/zones/${region}-a/instances/${randId(6)}`;
  const changeType = rand(["CREATE", "UPDATE", "DELETE"] as const);
  const temporalAssetWindow = isErr ? "invalid" : `${ts}/${ts}`;
  const feedScope = rand(["org", "project", "folder"] as const);
  const feedName = `feed-${feedScope}-${randId(4)}`;
  const policyAnalyzed = Math.random() < 0.5;

  const SCENARIOS = [
    "batch_get_assets_history",
    "export_assets",
    "search_all_resources_v2",
    "list_assets",
    "feeds_patch",
    "assets_query_aggregate",
  ] as const;
  const scenario = rand(SCENARIOS);

  let apiMethod = "";
  let message = "";
  if (scenario === "batch_get_assets_history") {
    apiMethod = `cloudasset.googleapis.com/v1/projects/${project.id}/assets:batchGetHistory`;
    message = isErr
      ? `batchGetAssetsHistory FAILED read_mask invalid: RESOURCE_EXHAUSTED`
      : `batchGetAssetsHistory returned ${randInt(0, 220)} snapshots window=${rand(["1h", "24h", "7d"])}`;
  } else if (scenario === "export_assets") {
    apiMethod = `cloudasset.googleapis.com/v1/projects/${project.id}:exportAssets`;
    message = isErr
      ? `exportAssets LRO FAILED gs://… destination DENIED (${feedName})`
      : `exportAssets LRO started content_type=resource output_path=gs://${project.id}-cai/export`;
  } else if (scenario === "search_all_resources_v2") {
    apiMethod = `cloudasset.googleapis.com/v1/projects/${project.id}/resources:searchAll`;
    message = isErr
      ? `SearchAllResources FAILED DEADLINE_EXCEEDED query_chars=${randInt(5000, 20000)}`
      : `SearchAllResources page_size=${randInt(10, 500)}`;
  } else if (scenario === "list_assets") {
    apiMethod = `cloudasset.googleapis.com/v1/projects/${project.id}/assets`;
    message = isErr
      ? `ListAssets FAILED NOT_FOUND snapshot_time`
      : `ListAssets asset_type_prefix=${assetType}`;
  } else if (scenario === "feeds_patch") {
    apiMethod = `cloudasset.googleapis.com/v1/projects/${project.id}/feeds/${feedName}`;
    message = isErr
      ? `PatchFeed FAILED pubsub_subscription invalid PERMISSION_DENIED`
      : `PatchFeed OK feed=${feedName} asset_names=${randInt(0, 12)}`;
  } else {
    apiMethod = `cloudasset.googleapis.com/v1/projects/${project.id}:queryAssetsAggregation`;
    message = isErr
      ? `Feed "${feedName}" export error for ${assetType}: ${rand(["Destination Pub/Sub permission denied", "Invalid feed filter expression", "BigQuery streaming insert failed"])}`
      : `Asset aggregation query groups=${randInt(1, 40)} iam_policy_analyzed=${policyAnalyzed}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudasset.googleapis.com/Feed",
      feed: feedName,
      api_method: apiMethod,
      asset_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloudasset.googleapis.com"),
    gcp: {
      cloud_asset_inventory: {
        scenario,
        api_method: apiMethod,
        asset_type: assetType,
        asset_name: assetName,
        change_type: changeType,
        temporal_asset_window: temporalAssetWindow,
        feed_name: feedName,
        policy_analyzed: policyAnalyzed,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(100, 90_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateOrgPolicyLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const constraintName = rand([
    "constraints/compute.disableSerialPortAccess",
    "constraints/iam.allowedPolicyMemberDomains",
    "constraints/compute.requireOsLogin",
    "constraints/storage.uniformBucketLevelAccess",
  ] as const);
  const policyType = rand(["boolean", "list"] as const);
  const enforcement = isErr ? rand(["DRY_RUN", "OFF"]) : rand(["ON", "ENFORCED"]);
  const resource = `projects/${project.id}`;
  const inheritedFrom = rand([
    `folders/${randInt(100000000000, 999999999999)}`,
    "organization policy root",
    "",
  ]);

  const SCENARIOS = [
    "get_effective_policy",
    "get_policy",
    "create_policy",
    "update_policy",
    "delete_policy",
    "list_constraints",
  ] as const;
  const scenario = rand(SCENARIOS);

  let apiMethod = "";
  let message = "";
  if (scenario === "get_effective_policy") {
    apiMethod = `orgpolicy.googleapis.com/v2/${resource}/policies/${encodeURIComponent(constraintName)}:getEffectivePolicy`;
    message = isErr
      ? `getEffectivePolicy FAILED ${constraintName}: NOT_FOUND`
      : `getEffectivePolicy etag=${randId(16)} enforcement=${enforcement}`;
  } else if (scenario === "get_policy") {
    apiMethod = `orgpolicy.googleapis.com/v2/${resource}/policies/${encodeURIComponent(constraintName)}`;
    message = isErr ? `GetPolicy FAILED PERMISSION_DENIED` : `GetPolicy spec=${policyType}`;
  } else if (scenario === "create_policy") {
    apiMethod = `orgpolicy.googleapis.com/v2/${resource}/policies`;
    message = isErr
      ? `CreatePolicy FAILED INVALID_ARGUMENT constraint spec`
      : `CreatePolicy ${constraintName} dry_run=${rand([true, false])}`;
  } else if (scenario === "update_policy") {
    apiMethod = `orgpolicy.googleapis.com/v2/${resource}/policies/${encodeURIComponent(constraintName)}`;
    message = isErr
      ? `UpdatePolicy FAILED etag mismatch — ${rand(["Invalid constraint value", "PERMISSION_DENIED", "Policy etag mismatch"])}`
      : `Org policy updated: constraint=${constraintName} type=${policyType} enforcement=${enforcement} resource=${resource}${inheritedFrom ? ` inherited_from=${inheritedFrom}` : ""}`;
  } else if (scenario === "delete_policy") {
    apiMethod = `orgpolicy.googleapis.com/v2/${resource}/policies/${encodeURIComponent(constraintName)}`;
    message = isErr
      ? `DeletePolicy FAILED FAILED_PRECONDITION inherited`
      : `DeletePolicy ${constraintName} OK`;
  } else {
    apiMethod = `orgpolicy.googleapis.com/v2/organizations/${randInt(100000000000, 999999999999)}/constraints`;
    message = isErr
      ? `ListConstraints FAILED UNAVAILABLE`
      : `ListConstraints matched=${randInt(40, 120)}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudresourcemanager.googleapis.com/Project",
      constraint: constraintName,
      api_method: apiMethod,
      orgpolicy_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "orgpolicy.googleapis.com"),
    gcp: {
      org_policy: {
        scenario,
        api_method: apiMethod,
        constraint_name: constraintName,
        policy_type: policyType,
        enforcement,
        resource,
        inherited_from: inheritedFrom || null,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, 8000),
    },
    message,
    ...faultSpread,
  };
}

export function generateRecommenderLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const recommenderType = rand([
    "google.compute.instance.MachineTypeRecommender",
    "google.cloudsql.instance.IdleInstanceRecommender",
    "google.iam.policy.SecurityRecommender",
  ] as const);
  const recommendationId = `rec-${randId(12).toLowerCase()}`;
  const state = isErr ? rand(["FAILED", "CLAIMED"]) : rand(["ACTIVE", "SUCCEEDED", "CLAIMED"]);
  const priority = rand(["P1", "P2", "P3", "P4"] as const);
  const impactCostMonthlyUsd = isErr ? 0 : randFloat(12, 4500);
  const resourceName = `projects/${project.id}/zones/${region}-a/instances/${randId(6)}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `recommender.googleapis.com: MarkRecommendationFailed name=projects/${project.id}/locations/${region}/recommenders/${recommenderType}/recommendations/${recommendationId}: ${rand(["Insufficient metrics window", "Resource deleted", "Internal error"])}`
    : `New recommendation: ${recommenderType} id=${recommendationId} state=${state} priority=${priority} primary_impact=Cost (~$${impactCostMonthlyUsd.toFixed(0)}/mo) resource=${resourceName}`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "recommender.googleapis.com/Recommendation",
      recommender: recommenderType,
      api_method: `recommender.googleapis.com/v1/projects/${project.id}/locations/global/recommendations/${recommendationId}:getRecommendation`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "recommender.googleapis.com"),
    gcp: {
      recommender: {
        recommender_type: recommenderType,
        recommendation_id: recommendationId,
        state,
        priority,
        impact_cost_monthly_usd: Math.round(impactCostMonthlyUsd * 100) / 100,
        resource_name: resourceName,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(200, 60_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateBillingLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const billingAccountId = `01${randId(6)}-${randId(4)}-${randId(4)}`;
  const serviceDescription = rand([
    "Compute Engine",
    "Cloud Storage",
    "BigQuery",
    "Cloud SQL",
    "Kubernetes Engine",
  ]);
  const skuDescription = rand([
    "N1 Preemptible Instance Core",
    "Standard Storage US Multi-region",
    "Analysis TB",
    "vCPU Time",
  ]);
  const costAmount = isErr ? 0 : randFloat(0.02, 12_500);
  const currency = "USD";
  const usageAmount = randFloat(0.5, 500_000);
  const usageUnit = rand(["hour", "gibibyte month", "terabyte", "request", "GiBy.mo"]);
  const creditsAmount = isErr ? 0 : randFloat(0, costAmount * 0.3);
  const proj = randProject();
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudbilling.googleapis.com: Export to BigQuery failed for billing_account=${billingAccountId}: ${rand(["InsertErrors row rejected", "Dataset not writable by billing export SA", "Malformed cost row"])}`
    : `Billing cost row: service="${serviceDescription}" sku="${skuDescription}" cost=${costAmount.toFixed(2)} ${currency} usage=${usageAmount.toFixed(2)} ${usageUnit} credits=-${creditsAmount.toFixed(2)} project=${proj.id}`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudbilling.googleapis.com/BillingAccount",
      billing_account: billingAccountId,
      api_method: `cloudbilling.googleapis.com/v1/billingAccounts/${billingAccountId}/projects:list`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloudbilling.googleapis.com"),
    gcp: {
      billing: {
        billing_account_id: billingAccountId,
        service_description: serviceDescription,
        sku_description: skuDescription,
        cost_amount: Math.round(costAmount * 100) / 100,
        currency,
        usage_amount: Math.round(usageAmount * 1000) / 1000,
        usage_unit: usageUnit,
        credits_amount: Math.round(creditsAmount * 100) / 100,
        project_id: proj.id,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, 5000),
    },
    message,
    ...faultSpread,
  };
}

export function generateServiceDirectoryLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const nsKind = rand(["prod", "mesh", "internal"] as const);
  const namespaceName = `ns-${nsKind}`;
  const serviceName = rand(["payments.grpc", "catalog.http", "auth.oauth"]);
  const endpointName = `ep-${randId(6)}`;
  const action = rand(["CREATE", "UPDATE", "DELETE", "RESOLVE"] as const);
  const address = `10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(2, 250)}`;
  const ports = [443, 8080, 50051, 8443] as const;
  const port = ports[randInt(0, ports.length - 1)]!;
  const metadataKeys = ["version", "env", "region", "shard"].slice(0, randInt(1, 4));
  const svcPath = `projects/${project.id}/locations/${region}/namespaces/${namespaceName}/services/${serviceName}/endpoints/${endpointName}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `servicedirectory.googleapis.com: ${action} FAILED ${svcPath}: ${rand(["ALREADY_EXISTS", "INVALID_ARGUMENT", "NOT_FOUND"])}`
    : `Service Directory ${action}: registered endpoint ${endpointName} -> ${address}:${port} service=${namespaceName}/${serviceName} metadata_keys=[${metadataKeys.join(",")}]`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "servicedirectory.googleapis.com/Service",
      namespace: namespaceName,
      api_method: `servicedirectory.googleapis.com/v1/${svcPath}`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "servicedirectory.googleapis.com"),
    gcp: {
      service_directory: {
        namespace_name: namespaceName,
        service_name: serviceName,
        endpoint_name: endpointName,
        action,
        address,
        port,
        metadata_keys: metadataKeys,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(5, 3000),
    },
    message,
    ...faultSpread,
  };
}

export function generateConfigConnectorLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const resourceKind = rand([
    "ComputeInstance",
    "SQLInstance",
    "StorageBucket",
    "IAMServiceAccount",
    "PubSubTopic",
  ] as const);
  const resourceName = `${resourceKind.toLowerCase()}-${randId(6).toLowerCase()}`;
  const action = rand(["CREATE", "UPDATE", "DELETE", "RECONCILE"] as const);
  const namespace = rand(["config-connector-system", "workloads", "platform"]);
  const status = isErr
    ? rand(["ERROR", "PENDING"] as const)
    : rand(["READY", "IN_PROGRESS", "SYNCED"] as const);
  const reconcileDurationMs = randLatencyMs(randInt(50, 2000), isErr);
  const cnrmUri = `${resourceKind}.${rand(["compute.cnrm", "storage.cnrm", "pubsub.cnrm"])}.cloud.google.com`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `configconnector.cnrm.cloud.google.com: ${resourceKind}/${resourceName} reconcile error in namespace ${namespace}: ${rand(["DependencyNotReady", "PreconditionFailed", "Permission denied creating GCP resource"])} status=${status}`
    : `Reconcile successful: kind=${resourceKind} name=${resourceName} namespace=${namespace} duration_ms=${reconcileDurationMs.toFixed(1)} status=${status}`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "core.cnrm.cloud.google.com/ConfigConnectorContext",
      namespace,
      api_method: `cnrm.cloud.google.com/v1alpha1/${cnrmUri}/namespaces/${namespace}/${resourceKind}/${resourceName}:reconcile`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "config-connector"),
    gcp: {
      config_connector: {
        resource_kind: resourceKind,
        resource_name: resourceName,
        action,
        namespace,
        status,
        reconcile_duration_ms: reconcileDurationMs,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: (isErr ? "failure" : "success") === "failure" ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: reconcileDurationMs,
    },
    message,
    ...faultSpread,
  };
}

export function generateCloudAuditLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const serviceName = rand([
    "compute.googleapis.com",
    "storage.googleapis.com",
    "iam.googleapis.com",
    "bigquery.googleapis.com",
  ]);
  const methodName = rand(["v1.instances.insert", "objects.get", "SetIamPolicy", "jobs.insert"]);
  const resourceName = rand([
    `projects/${project.id}/zones/${region}-a/instances/vm-${randId(4)}`,
    `projects/_/buckets/${project.id}-data`,
    `projects/${project.id}/datasets/analytics`,
  ]);
  const callerIp = randIp();
  const callerType = rand(["USER", "SERVICE_ACCOUNT", "DELEGATED"] as const);
  const authorizationDecision = isErr ? "DENIED" : rand(["ALLOWED", "DENIED"] as const);
  const requestMetadata = {
    caller_network: `projects/${project.id}/global/networks/default`,
    request_id: randId(16).toLowerCase(),
    user_agent: rand(["gcloud/460.0.0", "Terraform/1.7.5", "google-api-nodejs-client/9.0.0"]),
  };
  const durationNs = randInt(1_000_000, isErr ? 50_000_000 : 8_000_000);
  const auditErr = authorizationDecision !== "ALLOWED" || isErr;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(auditErr);
  const severity =
    authorizationDecision === "DENIED" || isErr ? randSeverity(true) : randSeverity(false);
  const message = isErr
    ? `cloudaudit.googleapis.com/activity: ${serviceName}.${methodName} permission_denied principal=${callerType} resource=${resourceName} caller_ip=${callerIp}`
    : `protoPayload.methodName="${methodName}" serviceName="${serviceName}" resourceName="${resourceName}" authenticationInfo.principalEmail=… authorizationInfo[0].granted=${authorizationDecision === "ALLOWED"}`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      log_name: `projects/${project.id}/logs/cloudaudit.googleapis.com%2Factivity`,
      method: methodName,
      api_method: `${serviceName}/${methodName}`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloudaudit.googleapis.com"),
    gcp: {
      cloud_audit: {
        service_name: serviceName,
        method_name: methodName,
        resource_name: resourceName,
        caller_ip: callerIp,
        caller_type: callerType,
        authorization_decision: authorizationDecision,
        request_metadata: requestMetadata,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type:
        (authorizationDecision === "ALLOWED" && !isErr ? "success" : "failure") === "failure"
          ? ["change"]
          : ["info"],
      action: String("management-operation"),
      outcome: authorizationDecision === "ALLOWED" && !isErr ? "success" : "failure",
      duration: durationNs,
    },
    message,
    ...faultSpread,
  };
}

export function generateActiveAssistLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const recommender = rand([
    "google.compute.instance.MachineTypeRecommender",
    "google.cloudsql.instance.IdleInstanceRecommender",
    "google.iam.policy.SecurityRecommender",
  ] as const);
  const recommendationType = rand(["COST", "PERFORMANCE", "SECURITY", "SUSTAINABILITY"] as const);
  const resource = `projects/${project.id}/zones/${region}-a/instances/${randId(6)}`;
  const impactCategory = rand(["COST", "LATENCY", "CARBON", "RELIABILITY"] as const);
  const estimatedSavingsMonthlyUsd = isErr ? 0 : randFloat(5, 2500);
  const state = isErr
    ? rand(["ACTIVE", "CLAIMED"] as const)
    : rand(["ACTIVE", "CLAIMED", "SUCCEEDED"] as const);
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `recommender.googleapis.com (Active Assist): insight generation failed for ${resource} recommender=${recommender}`
    : `Active Assist insight: category=${recommendationType} impact=${impactCategory} resource=${resource} estimated_monthly_savings_usd=${estimatedSavingsMonthlyUsd.toFixed(0)} state=${state}`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "recommender.googleapis.com/Insight",
      recommender,
      api_method: `recommender.googleapis.com/v1/${resource}:getInsight`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "active-assist"),
    gcp: {
      active_assist: {
        recommender,
        recommendation_type: recommendationType,
        resource,
        impact_category: impactCategory,
        estimated_savings_monthly_usd: Math.round(estimatedSavingsMonthlyUsd * 100) / 100,
        state,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(200, 45_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateEssentialContactsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const contactEmail = rand([
    `security@${rand(EMAIL_DOMAINS)}`,
    `billing-admin@${rand(EMAIL_DOMAINS)}`,
  ]);
  const notificationCategory = rand([
    "TECHNICAL",
    "SECURITY",
    "BILLING",
    "LEGAL",
    "PRODUCT_UPDATES",
  ] as const);
  const resource = `projects/${project.id}`;
  const action = isErr
    ? rand(["BOUNCE", "SEND"] as const)
    : rand(["SEND", "BOUNCE", "SUBSCRIBE", "UNSUBSCRIBE"] as const);
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `essentialcontacts.googleapis.com: Notification ${action} FAILED category=${notificationCategory} to=${contactEmail}: ${rand(["SMTP 550 mailbox unavailable", "DMARC policy reject"])}`
    : `Essential Contacts: ${action} category=${notificationCategory} recipient=${contactEmail} resource=${resource}`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "essentialcontacts.googleapis.com/Contact",
      category: notificationCategory,
      api_method: `essentialcontacts.googleapis.com/v1/projects/${project.id}/contacts:list`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "essential-contacts"),
    gcp: {
      essential_contacts: {
        contact_email: contactEmail,
        notification_category: notificationCategory,
        resource,
        action,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(100, 8000),
    },
    message,
    ...faultSpread,
  };
}

export function generateTagsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const tagKey = rand(["environment", "cost-center", "team", "compliance"]);
  const tagValue = rand(["prod", "staging", "eng", "pci", "eu-only"]);
  const resourceName = `projects/${project.id}/zones/${region}-a/instances/vm-${randId(4)}`;
  const action = rand(["BIND", "UNBIND", "CREATE", "DELETE"] as const);
  const inheritedFrom = Math.random() > 0.5 ? `folders/${randInt(100000000000, 999999999999)}` : "";
  const policyAffected = rand(["org-policy-tags", "conditional-binding", "none"]);
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudresourcemanager.googleapis.com: ${action} tag binding FAILED on ${resourceName}: ${rand(["Tag value not in allowed list", "PERMISSION_DENIED on tagKeys.get"])}`
    : `Tag binding ${action}: ${tagKey}=${tagValue} attached_to=${resourceName}${inheritedFrom ? ` inherited_from=${inheritedFrom}` : ""} policy=${policyAffected}`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudresourcemanager.googleapis.com/TagValue",
      tag_key: tagKey,
      api_method: `cloudresourcemanager.googleapis.com/v3/${resourceName}/tagBindings:create`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "tags"),
    gcp: {
      tags: {
        tag_key: tagKey,
        tag_value: tagValue,
        resource_name: resourceName,
        action,
        inherited_from: inheritedFrom || null,
        policy_affected: policyAffected,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, 12_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateCarbonFootprintLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const projectId = project.id;
  const service = rand(["Compute Engine", "Cloud Storage", "BigQuery", "Cloud SQL"]);
  const carbonKgCo2e = isErr ? 0 : randFloat(0.01, 4500);
  const electricityKwh = isErr ? 0 : randFloat(0.5, 120_000);
  const scope = rand(["SCOPE_1", "SCOPE_2", "SCOPE_3"] as const);
  const periodMonth = `${new Date(ts).getUTCFullYear()}-${String(new Date(ts).getUTCMonth() + 1).padStart(2, "0")}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `carbonfootprint.googleapis.com: Export for ${projectId} incomplete: missing grid emission factor for region ${region}`
    : `Carbon footprint row: month=${periodMonth} service="${service}" region=${region} kgCO2e=${carbonKgCo2e.toFixed(3)} kWh=${electricityKwh.toFixed(1)} scope=${scope}`;

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "carbonfootprint.googleapis.com/Project",
      project_id: projectId,
      api_method: `carbonfootprint.googleapis.com/v1/projects/${projectId}/carbonFootprint:retrieve`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "carbon-footprint"),
    gcp: {
      carbon_footprint: {
        project_id: projectId,
        service,
        region,
        carbon_kg_co2e: Math.round(carbonKgCo2e * 1000) / 1000,
        electricity_kwh: Math.round(electricityKwh * 10) / 10,
        scope,
        period_month: periodMonth,
      },
    },
    event: {
      kind: "event",
      category: ["configuration"],
      type: isErr ? ["change"] : ["info"],
      action: String("management-operation"),
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, 20_000),
    },
    message,
    ...faultSpread,
  };
}
