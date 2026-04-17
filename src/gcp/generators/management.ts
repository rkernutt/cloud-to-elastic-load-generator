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
} from "./helpers.js";

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
    ? rand(["alert_fail", "alert_firing"] as const)
    : rand(["alert_ok", "uptime", "metric_descriptor", "timeseries", "channel"] as const);
  const severity = randSeverity(isErr);
  let message = "";

  if (kind === "alert_firing" || kind === "alert_fail") {
    message =
      kind === "alert_fail"
        ? `Alerting notification delivery failed for policy="${alertPolicyName}" channel=${notificationChannelType}: ${rand(["Invalid OAuth token for Slack", "PagerDuty 429 rate limit", "Pub/Sub topic not found"])}`
        : `Alerting policy "${alertPolicyName}" triggered: condition "${conditionName}" is TRUE; metric=${metricType} value=${currentValue.toFixed(4)} threshold=${thresholdValue.toFixed(4)}`;
  } else if (kind === "alert_ok") {
    message = `Incident cleared: policy="${alertPolicyName}" condition "${conditionName}" returned to OK (metric=${metricType}, value=${currentValue.toFixed(4)})`;
  } else if (kind === "uptime") {
    const url = rand([
      `https://api.${project.id}.example.com/health`,
      `https://status.${project.id}.example.com/ready`,
    ]);
    const checkLatency = randLatencyMs(randInt(20, 800), isErr);
    message = isErr
      ? `Uptime check FAILED: checker=us-east4 url=${url} latency_ms=${checkLatency} error=${rand(["HTTP 503", "TLS handshake timeout", "DNS resolution failed"])}`
      : `Uptime check PASSED: url=${url} latency_ms=${checkLatency} response_code=200 region=${region}`;
  } else if (kind === "metric_descriptor") {
    message = `Created metric descriptor projects/${project.id}/metricDescriptors/workload.googleapis.com/${rand(["custom/request_latency", "custom/queue_depth", "custom/job_failures"])}`;
  } else if (kind === "timeseries") {
    message = `monitoring.googleapis.com: WriteTimeSeries accepted_points=${randInt(1, 500)} rejected_points=${isErr ? randInt(1, 50) : 0} metric_type=${metricType}`;
  } else {
    message = `Notification channel updated: display_name="${rand(["oncall-slack", "sec-email", "billing-pd"])}" type=${notificationChannelType} verified=${!isErr}`;
  }

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "monitoring.googleapis.com/AlertPolicy",
      policy: alertPolicyName,
    },
    cloud: gcpCloud(region, project, "monitoring.googleapis.com"),
    gcp: {
      cloud_monitoring: {
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(200, 15_000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `logging.googleapis.com: Sink "${sinkName}" write to ${destination} failed ${errorsCount} times: ${rand(["Permission bigquery.datasets.get denied", "Destination bucket not found", "Invalid sink filter expression"])}`
    : `Exported ${entriesExported} log entries via sink="${sinkName}" to ${destination} (log_filter matched ${logName})`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "logging.googleapis.com/Project", sink: sinkName },
    cloud: gcpCloud(region, project, "logging.googleapis.com"),
    gcp: {
      cloud_logging: {
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(1000, 120_000),
    },
    message,
  };
}

export function generateResourceManagerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const resourceType = rand(["project", "folder", "organization"] as const);
  const action = rand(["CREATE", "DELETE", "MOVE", "SET_IAM_POLICY"] as const);
  const resourceName =
    resourceType === "project"
      ? `projects/${project.id}`
      : `folders/${randInt(100000000000, 999999999999)}`;
  const parent = `organizations/${randInt(100000000000, 999999999999)}`;
  const actor = randPrincipal(project);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudresourcemanager.googleapis.com: projects.${action} FAILED resource=${resourceName}: ${rand(["FAILED_PRECONDITION: folder not empty", "PERMISSION_DENIED", "ALREADY_EXISTS"])} actor=${actor}`
    : `SetIamPolicy on ${resourceName} completed; action=${action} caller=${actor} parent=${parent}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "cloudresourcemanager.googleapis.com/Project", method: action },
    cloud: gcpCloud(region, project, "cloudresourcemanager.googleapis.com"),
    gcp: {
      resource_manager: {
        resource_type: resourceType,
        action,
        resource_name: resourceName,
        parent,
        actor,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(80, 25_000),
    },
    message,
  };
}

export function generateDeploymentManagerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const deployKind = rand(["network", "data", "app"] as const);
  const deploymentName = `deploy-${deployKind}-${randId(4)}`;
  const resourceType = rand([
    "compute.v1.instance",
    "container.v1.cluster",
    "sqladmin.v1beta4.instance",
    "storage.v1.bucket",
  ] as const);
  const resourcePrefix = rand(["vm", "cluster", "db", "bucket"] as const);
  const resourceName = `${resourcePrefix}-${randId(6)}`;
  const operation = rand(["CREATE", "UPDATE", "DELETE"] as const);
  const manifestConfig = `https://www.googleapis.com/deploymentmanager/v2/projects/${project.id}/global/deployments/${deploymentName}`;
  const status = isErr ? rand(["FAILED", "CANCELLED"]) : rand(["DONE", "RUNNING"]);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `deploymentmanager.googleapis.com: ${operation} FAILED for ${resourceType}/${resourceName} in deployment ${deploymentName}: ${rand(["Reference not found", "API compute.googleapis.com not enabled", "Quota 'INSTANCES' exceeded"])}`
    : `Operation ${operation} on deployment ${deploymentName} status=${status} manifest=${manifestConfig} resource=${resourceType}:${resourceName}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "deploymentmanager.googleapis.com/Deployment",
      deployment: deploymentName,
    },
    cloud: gcpCloud(region, project, "deploymentmanager.googleapis.com"),
    gcp: {
      deployment_manager: {
        deployment_name: deploymentName,
        resource_type: resourceType,
        resource_name: resourceName,
        operation,
        manifest_config: manifestConfig,
        status,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(2000, isErr ? 1_800_000 : 600_000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudasset.googleapis.com: Feed "${feedName}" export error for ${assetType}: ${rand(["Destination Pub/Sub permission denied", "Invalid feed filter expression", "BigQuery streaming insert failed"])}`
    : `Asset change feed: ${changeType} ${assetName} asset_type=${assetType} feed=${feedName} iam_policy_analyzed=${policyAnalyzed}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "cloudasset.googleapis.com/Feed", feed: feedName },
    cloud: gcpCloud(region, project, "cloudasset.googleapis.com"),
    gcp: {
      cloud_asset_inventory: {
        asset_type: assetType,
        asset_name: assetName,
        change_type: changeType,
        temporal_asset_window: temporalAssetWindow,
        feed_name: feedName,
        policy_analyzed: policyAnalyzed,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(100, 90_000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `orgpolicy.googleapis.com: SetPolicy FAILED for ${constraintName} on ${resource}: ${rand(["Invalid constraint value", "PERMISSION_DENIED", "Policy etag mismatch"])}`
    : `Org policy updated: constraint=${constraintName} type=${policyType} enforcement=${enforcement} resource=${resource}${inheritedFrom ? ` inherited_from=${inheritedFrom}` : ""}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "cloudresourcemanager.googleapis.com/Project",
      constraint: constraintName,
    },
    cloud: gcpCloud(region, project, "orgpolicy.googleapis.com"),
    gcp: {
      org_policy: {
        constraint_name: constraintName,
        policy_type: policyType,
        enforcement,
        resource,
        inherited_from: inheritedFrom || null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, 8000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `recommender.googleapis.com: MarkRecommendationFailed name=projects/${project.id}/locations/${region}/recommenders/${recommenderType}/recommendations/${recommendationId}: ${rand(["Insufficient metrics window", "Resource deleted", "Internal error"])}`
    : `New recommendation: ${recommenderType} id=${recommendationId} state=${state} priority=${priority} primary_impact=Cost (~$${impactCostMonthlyUsd.toFixed(0)}/mo) resource=${resourceName}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "recommender.googleapis.com/Recommendation",
      recommender: recommenderType,
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(200, 60_000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudbilling.googleapis.com: Export to BigQuery failed for billing_account=${billingAccountId}: ${rand(["InsertErrors row rejected", "Dataset not writable by billing export SA", "Malformed cost row"])}`
    : `Billing cost row: service="${serviceDescription}" sku="${skuDescription}" cost=${costAmount.toFixed(2)} ${currency} usage=${usageAmount.toFixed(2)} ${usageUnit} credits=-${creditsAmount.toFixed(2)} project=${proj.id}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "cloudbilling.googleapis.com/BillingAccount",
      billing_account: billingAccountId,
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, 5000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `servicedirectory.googleapis.com: ${action} FAILED projects/${project.id}/locations/${region}/namespaces/${namespaceName}/services/${serviceName}/endpoints/${endpointName}: ${rand(["ALREADY_EXISTS", "INVALID_ARGUMENT", "NOT_FOUND"])}`
    : `Service Directory ${action}: registered endpoint ${endpointName} -> ${address}:${port} service=${namespaceName}/${serviceName} metadata_keys=[${metadataKeys.join(",")}]`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "servicedirectory.googleapis.com/Service",
      namespace: namespaceName,
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(5, 3000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `configconnector.cnrm.cloud.google.com: ${resourceKind}/${resourceName} reconcile error in namespace ${namespace}: ${rand(["DependencyNotReady", "PreconditionFailed", "Permission denied creating GCP resource"])} status=${status}`
    : `Reconcile successful: kind=${resourceKind} name=${resourceName} namespace=${namespace} duration_ms=${reconcileDurationMs.toFixed(1)} status=${status}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "core.cnrm.cloud.google.com/ConfigConnectorContext", namespace },
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
      outcome: isErr ? "failure" : "success",
      duration: reconcileDurationMs,
    },
    message,
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
  const severity =
    authorizationDecision === "DENIED" || isErr ? randSeverity(true) : randSeverity(false);
  const message = isErr
    ? `cloudaudit.googleapis.com/activity: ${serviceName}.${methodName} permission_denied principal=${callerType} resource=${resourceName} caller_ip=${callerIp}`
    : `protoPayload.methodName="${methodName}" serviceName="${serviceName}" resourceName="${resourceName}" authenticationInfo.principalEmail=… authorizationInfo[0].granted=${authorizationDecision === "ALLOWED"}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      log_name: `projects/${project.id}/logs/cloudaudit.googleapis.com%2Factivity`,
      method: methodName,
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
      outcome: authorizationDecision === "ALLOWED" && !isErr ? "success" : "failure",
      duration: durationNs,
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `recommender.googleapis.com (Active Assist): insight generation failed for ${resource} recommender=${recommender}`
    : `Active Assist insight: category=${recommendationType} impact=${impactCategory} resource=${resource} estimated_monthly_savings_usd=${estimatedSavingsMonthlyUsd.toFixed(0)} state=${state}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "recommender.googleapis.com/Insight", recommender },
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(200, 45_000),
    },
    message,
  };
}

export function generateEssentialContactsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const contactEmail = rand([
    `security@${project.id.split("-")[0]}.example.com`,
    `billing-admin@${project.id}.example.com`,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `essentialcontacts.googleapis.com: Notification ${action} FAILED category=${notificationCategory} to=${contactEmail}: ${rand(["SMTP 550 mailbox unavailable", "DMARC policy reject"])}`
    : `Essential Contacts: ${action} category=${notificationCategory} recipient=${contactEmail} resource=${resource}`;

  return {
    "@timestamp": ts,
    severity,
    labels: {
      "resource.type": "essentialcontacts.googleapis.com/Contact",
      category: notificationCategory,
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(100, 8000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudresourcemanager.googleapis.com: ${action} tag binding FAILED on ${resourceName}: ${rand(["Tag value not in allowed list", "PERMISSION_DENIED on tagKeys.get"])}`
    : `Tag binding ${action}: ${tagKey}=${tagValue} attached_to=${resourceName}${inheritedFrom ? ` inherited_from=${inheritedFrom}` : ""} policy=${policyAffected}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "cloudresourcemanager.googleapis.com/TagValue", tag_key: tagKey },
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(50, 12_000),
    },
    message,
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
  const severity = randSeverity(isErr);
  const message = isErr
    ? `carbonfootprint.googleapis.com: Export for ${projectId} incomplete: missing grid emission factor for region ${region}`
    : `Carbon footprint row: month=${periodMonth} service="${service}" region=${region} kgCO2e=${carbonKgCo2e.toFixed(3)} kWh=${electricityKwh.toFixed(1)} scope=${scope}`;

  return {
    "@timestamp": ts,
    severity,
    labels: { "resource.type": "carbonfootprint.googleapis.com/Project", project_id: projectId },
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
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, 20_000),
    },
    message,
  };
}
