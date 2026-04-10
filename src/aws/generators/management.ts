import { rand, randInt, randFloat, randId, randUUID, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateCloudFormationLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const stack = rand([
    "prod-web-stack",
    "vpc-infra",
    "rds-cluster",
    "ecs-services",
    "api-gateway-stack",
  ]);
  const action = rand(["CREATE_STACK", "UPDATE_STACK", "DELETE_STACK", "DETECT_DRIFT"]);
  const status = isErr
    ? rand(["CREATE_FAILED", "UPDATE_ROLLBACK_COMPLETE", "DELETE_FAILED"])
    : rand(["CREATE_COMPLETE", "UPDATE_COMPLETE", "DELETE_COMPLETE", "CREATE_IN_PROGRESS"]);
  const resource = rand([
    "AWS::EC2::VPC",
    "AWS::ECS::Service",
    "AWS::RDS::DBInstance",
    "AWS::Lambda::Function",
    "AWS::IAM::Role",
  ]);
  const plainMessage = isErr
    ? `CloudFormation ${stack} ${status}: ${resource} failed - ${rand(["Capacity", "IAM denied", "Limit exceeded"])}`
    : `CloudFormation ${stack}: ${action} -> ${status}`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        stackName: stack,
        action,
        stackStatus: status,
        resourceType: resource,
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudformation" },
    },
    aws: {
      cloudformation: {
        stack_name: stack,
        stack_id:
          `arn:aws:cloudformation:${region}:${acct.id}:stack/${stack}/${randId(8)}`.toLowerCase(),
        action,
        stack_status: status,
        resource_type: resource,
        logical_resource_id: rand([
          "WebServerASG",
          "DatabaseCluster",
          "ApiFunction",
          "TaskRole",
          "VPC",
        ]),
        resource_status_reason: isErr
          ? rand(["Resource creation failed", "Insufficient capacity", "IAM policy error"])
          : null,
        drift_status: rand(["NOT_CHECKED", "IN_SYNC", "DRIFTED"]),
        structured_logging: useStructuredLogging,
        metrics: {
          TotalStack: { avg: randInt(1, 500) },
          ErroredStack: { avg: isErr ? randInt(1, 10) : 0 },
          RollbackStack: { avg: isErr ? randInt(1, 5) : 0 },
          DeletedStack: { avg: randInt(0, 50) },
          StackInstancesDeployed: { avg: randInt(0, 10000) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "process"],
      dataset: "aws.cloudformation",
      provider: "cloudformation.amazonaws.com",
      duration: randInt(30, isErr ? 3600 : 600) * 1e9,
    },
    message: message,
    ...(isErr
      ? {
          error: {
            code: "StackError",
            message: "CloudFormation stack operation failed",
            type: "configuration",
          },
        }
      : {}),
    log: { level: isErr ? "error" : "info" },
  };
}

function generateSsmLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const instance = `i-${randId(17).toLowerCase()}`;
  const action = rand([
    "RunCommand",
    "StartSession",
    "SendCommand",
    "PatchInstance",
    "GetParameter",
    "PutParameter",
  ]);
  const document = rand([
    "AWS-RunShellScript",
    "AWS-RunPowerShellScript",
    "AWS-ApplyPatchBaseline",
    "AWS-ConfigureAWSPackage",
  ]);
  const commandId = `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase();
  const plainMessage = isErr
    ? `SSM ${action} FAILED on ${instance}: exit code ${rand([1, 2, 127])}`
    : `SSM ${action} on ${instance}: ${document}`;
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        commandId,
        documentName: document,
        instanceId: instance,
        action,
        status: isErr ? "Failed" : "Success",
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "systemsmanager" },
    },
    aws: {
      ssm: {
        command_id: commandId,
        document_name: document,
        instance_id: instance,
        action,
        execution_status: isErr ? "Failed" : "Success",
        response_code: isErr ? rand([1, 2, 127]) : 0,
        session_id: action === "StartSession" ? randId(36).toLowerCase() : null,
        parameter_name: action.includes("Parameter")
          ? rand(["/prod/db/password", "/prod/api/key"])
          : null,
        patch_compliance: action.includes("Patch")
          ? rand(["Compliant", "NonCompliant", "NotApplicable"])
          : null,
        structured_logging: useStructuredLogging,
        metrics: {
          CommandsSucceeded: { sum: isErr ? 0 : 1 },
          CommandsFailed: { sum: isErr ? 1 : 0 },
          CommandsTimedOut: { sum: isErr && Math.random() > 0.7 ? 1 : 0 },
          CommandsDeliveryTimedOut: { sum: 0 },
          SessionsStarted: { sum: 1 },
          SessionDuration: { avg: randInt(1, isErr ? 3600 : 600) },
          PatchComplianceCount: { avg: randInt(50, 500) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "configuration", "host"],
      dataset: "aws.ssm",
      provider: "ssm.amazonaws.com",
      duration: randInt(1, isErr ? 300 : 30) * 1e9,
    },
    message: message,
    ...(isErr
      ? { error: { code: "SSMError", message: "SSM command failed", type: "process" } }
      : {}),
    log: { level: isErr ? "error" : "info" },
  };
}

function generateCloudWatchAlarmsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const ns = rand([
    "AWS/EC2",
    "AWS/RDS",
    "AWS/Lambda",
    "AWS/ECS",
    "Custom/Application",
    "AWS/ApplicationELB",
  ]);
  const metric = rand([
    "CPUUtilization",
    "DatabaseConnections",
    "Duration",
    "MemoryUtilization",
    "RequestCount",
    "QueueDepth",
  ]);
  const alarmName = rand([
    "high-cpu-alarm",
    "rds-connections",
    "lambda-errors",
    "ecs-memory",
    "api-latency",
  ]);
  const alarmState = isErr ? rand(["ALARM", "INSUFFICIENT_DATA"]) : rand(["OK", "OK", "ALARM"]);
  const threshold = rand([80, 85, 90, 95]);
  const val =
    alarmState === "ALARM"
      ? Number(randFloat(threshold, 100))
      : Number(randFloat(0, threshold - 1));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudwatchalarms" },
    },
    aws: {
      cloudwatch: {
        alarm_name: alarmName,
        alarm_state: alarmState,
        previous_state: rand(["OK", "ALARM", "INSUFFICIENT_DATA"]),
        namespace: ns,
        metric_name: metric,
        threshold,
        evaluation_periods: rand([1, 2, 3]),
        metric_value: val,
        statistic: rand(["Average", "Maximum", "Sum", "p99"]),
        period_seconds: rand([60, 300, 3600]),
        treat_missing_data: rand(["missing", "notBreaching", "breaching"]),
      },
    },
    event: {
      kind: "alert",
      outcome: alarmState === "OK" ? "success" : "failure",
      category: ["configuration", "process"],
      dataset: "aws.cloudwatch",
      provider: "monitoring.amazonaws.com",
      duration: rand([60, 300, 3600]) * 1e9,
    },
    message: `CloudWatch alarm "${alarmName}": ${alarmState} (${ns}/${metric}=${val.toFixed(1)})`,
    log: { level: alarmState === "ALARM" ? "warn" : "info" },
    ...(alarmState !== "OK"
      ? {
          error: {
            code: "AlarmTriggered",
            message: `Alarm ${alarmName}: ${alarmState}`,
            type: "monitoring",
          },
        }
      : {}),
  };
}

function generateHealthLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isIssue = Math.random() < er + 0.1;
  const svc = rand([
    "EC2",
    "RDS",
    "Lambda",
    "S3",
    "ECS",
    "CloudFront",
    "Route53",
    "SQS",
    "DynamoDB",
  ]);
  const statuses = isIssue ? ["open", "upcoming"] : ["closed", "resolved"];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "health" },
    },
    aws: {
      health: {
        event_arn:
          `arn:aws:health:${region}::event/${svc}/${randId(8)}/${randId(36)}`.toLowerCase(),
        event_type_code: `AWS_${svc.toUpperCase()}_${rand(["OPERATIONAL_ISSUE", "MAINTENANCE_SCHEDULED", "API_ISSUE"])}`,
        event_type_category: rand(["issue", "scheduledChange", "accountNotification"]),
        service: svc,
        region: rand([region, "global"]),
        status_code: rand(statuses),
        event_scope: rand(["ACCOUNT", "PUBLIC"]),
        affected_entities_count: randInt(1, 50),
        description: `${svc} ${rand(["Increased error rates", "Degraded performance", "Scheduled maintenance", "Connectivity issues"])} in ${region}`,
      },
    },
    event: {
      kind: "alert",
      outcome: isIssue ? "failure" : "success",
      category: ["configuration"],
      dataset: "aws.health",
      provider: "health.amazonaws.com",
      duration: randInt(1, isIssue ? 7200 : 600) * 1e9,
    },
    message: isIssue
      ? `AWS Health: ${svc} service issue in ${region} - ${rand(["Increased errors", "Degraded performance"])}`
      : `AWS Health: ${svc} event resolved in ${region}`,
    ...(isIssue
      ? {
          error: {
            code: "HealthIssue",
            message: "AWS Health service issue",
            type: "configuration",
          },
        }
      : {}),
    log: { level: isIssue ? "warn" : "info" },
  };
}

function generateTrustedAdvisorLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isFinding = Math.random() < er + 0.2;
  const cat = rand([
    "security",
    "cost_optimizing",
    "performance",
    "fault_tolerance",
    "service_limits",
  ]);
  const checks = {
    security: [
      "Security Groups - Ports Unrestricted",
      "MFA on Root Account",
      "S3 Bucket Permissions",
      "CloudTrail Logging",
    ],
    cost_optimizing: [
      "Underutilized Amazon EC2 Instances",
      "Idle Load Balancers",
      "Underutilized Amazon RDS",
    ],
    performance: [
      "High Utilization Amazon EC2 Instances",
      "Large Number of Rules in Security Group",
    ],
    fault_tolerance: ["Amazon S3 Bucket Versioning", "Multi-AZ for RDS", "Amazon RDS Backups"],
    service_limits: ["EC2 On-Demand Instances", "RDS DB Instances", "VPCs"],
  };
  const check = rand(checks[cat as keyof typeof checks]);
  const status = isFinding ? rand(["error", "warning"]) : "ok";
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "trustedadvisor" },
    },
    aws: {
      trustedadvisor: {
        check_name: check,
        category: cat,
        status,
        affected_resource: rand([
          `i-${randId(17).toLowerCase()}`,
          `sg-${randId(8).toLowerCase()}`,
          `arn:aws:s3:::my-bucket`,
        ]),
        estimated_monthly_savings:
          cat === "cost_optimizing" && isFinding ? Number(randFloat(10, 5000)) : null,
        flagged_resources: isFinding ? randInt(1, 20) : 0,
      },
    },
    event: {
      kind: "alert",
      outcome: isFinding ? "failure" : "success",
      category: ["configuration", "vulnerability"],
      dataset: "aws.trustedadvisor",
      provider: "trustedadvisor.amazonaws.com",
      duration: randInt(5, 60) * 1e9,
    },
    message: isFinding
      ? `Trusted Advisor [${status.toUpperCase()}]: ${check} - ${randInt(1, 20)} resources affected`
      : `Trusted Advisor OK: ${check}`,
    ...(isFinding
      ? {
          error: {
            code: "TrustedAdvisorFinding",
            message: `${check}: ${status}`,
            type: "configuration",
          },
        }
      : {}),
    log: { level: status === "error" ? "error" : status === "warning" ? "warn" : "info" },
  };
}

function generateControlTowerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const action = rand([
    "CreateManagedAccount",
    "EnableGuardrail",
    "DisableGuardrail",
    "UpdateLandingZone",
    "RegisterOrganizationalUnit",
  ]);
  const guardrail = rand([
    "AWS-GR_RESTRICT_ROOT_USER",
    "AWS-GR_REQUIRE_MFA_FOR_ROOT",
    "AWS-GR_ENCRYPTED_VOLUMES",
    "AWS-GR_S3_PUBLIC_WRITE_PROHIBITED",
  ]);
  const status = isErr ? rand(["FAILED", "ERRORED"]) : rand(["SUCCEEDED", "IN_PROGRESS"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "controltower" },
    },
    aws: {
      controltower: {
        operation_id: randId(36).toLowerCase(),
        action,
        account_id: `${acct.id}`,
        organizational_unit: rand(["Sandbox", "Production", "Workloads", "Infrastructure"]),
        guardrail_id: action.includes("Guardrail") ? guardrail : null,
        guardrail_compliance: isErr ? "NONCOMPLIANT" : rand(["COMPLIANT", "NOT_APPLICABLE"]),
        landing_zone_version: rand(["3.1", "3.2", "3.3"]),
        status,
        error_message: isErr
          ? rand(["Enrollment failed", "SCP error", "Compliance check failed"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "iam"],
      dataset: "aws.controltower",
      provider: "controltower.amazonaws.com",
      duration: randInt(30, isErr ? 1800 : 600) * 1e9,
    },
    message: isErr
      ? `Control Tower ${action} FAILED: ${rand(["SCP error", "Enrollment failed", "Guardrail issue"])}`
      : `Control Tower ${action}: ${status}`,
    ...(isErr
      ? {
          error: {
            code: "ControlTowerError",
            message: "Control Tower operation failed",
            type: "configuration",
          },
        }
      : {}),
    log: { level: isErr ? "error" : "info" },
  };
}

function generateOrganizationsLog(ts: string, er: number): EcsDocument {
  const acct = randAccount();
  const isErr = Math.random() < er;
  const action = rand([
    "CreateAccount",
    "MoveAccount",
    "InviteAccountToOrganization",
    "AttachPolicy",
    "DetachPolicy",
    "CreateOrganizationalUnit",
  ]);
  const policyType = rand(["SERVICE_CONTROL_POLICY", "TAG_POLICY", "BACKUP_POLICY"]);
  const ous = ["Root", "Production", "Sandbox", "Infrastructure", "Security", "Workloads"];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region: "us-east-1",
      account: { id: acct.id, name: acct.name },
      service: { name: "organizations" },
    },
    aws: {
      organizations: {
        action,
        account_id: `${acct.id}`,
        account_name: rand(["prod-workloads", "security-audit", "shared-services", "sandbox-dev"]),
        organizational_unit: rand(ous),
        policy_id: action.includes("Policy") ? `p-${randId(8).toLowerCase()}` : null,
        policy_type: action.includes("Policy") ? policyType : null,
        policy_name: action.includes("Policy")
          ? rand(["DenyRootUserActions", "RequireS3Encryption", "TagCompliance"])
          : null,
        error_code: isErr
          ? rand([
              "DuplicateAccountException",
              "ConstraintViolationException",
              "AccessDeniedException",
            ])
          : null,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "iam"],
      dataset: "aws.organizations",
      provider: "organizations.amazonaws.com",
      duration: randInt(100, isErr ? 5000 : 2000) * 1e6,
    },
    message: isErr
      ? `Organizations ${action} FAILED: ${rand(["Duplicate account", "Constraint violation", "Access denied"])}`
      : `Organizations ${action}: ${rand(ous)}`,
    ...(isErr
      ? {
          error: {
            code: "OrganizationsError",
            message: "Organizations operation failed",
            type: "iam",
          },
        }
      : {}),
    log: { level: isErr ? "error" : "info" },
  };
}

function generateServiceCatalogLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const product = rand([
    "Standard EC2 Instance",
    "RDS PostgreSQL",
    "EKS Cluster",
    "S3 Static Site",
    "Data Pipeline",
  ]);
  const user = rand(["developer-alice", "team-lead-bob", "sre-carol", "contractor-dan"]);
  const action = rand([
    "ProvisionProduct",
    "UpdateProvisionedProduct",
    "TerminateProvisionedProduct",
    "SearchProducts",
    "AssociatePrincipal",
  ]);
  const status = isErr ? rand(["FAILED", "TAINTED", "ERROR"]) : rand(["SUCCEEDED", "AVAILABLE"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "servicecatalog" },
    },
    aws: {
      servicecatalog: {
        operation: action,
        product_name: product,
        product_id: `prod-${randId(13)}`,
        portfolio_id: `port-${randId(13)}`,
        provisioned_product_name: `${product.toLowerCase().replace(/ /g, "-")}-${randId(6).toLowerCase()}`,
        record_id: `rec-${randId(13)}`,
        status,
        requester_arn: `arn:aws:iam::${acct.id}:user/${user}`,
        launch_role: rand([null, "arn:aws:iam::123456789:role/ServiceCatalogLaunchRole"]),
        error: isErr
          ? rand(["Launch role not authorized", "Resource limit exceeded", "Invalid parameters"])
          : null,
      },
    },
    user: { name: user },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "process"],
      dataset: "aws.servicecatalog",
      provider: "servicecatalog.amazonaws.com",
      duration: randInt(30, isErr ? 3600 : 600) * 1e9,
    },
    message: isErr
      ? `ServiceCatalog ${action} FAILED [${product}]: ${rand(["Unauthorized", "Resource limit", "Invalid params"])}:`
      : `ServiceCatalog ${action}: ${user} → ${product} [${status}]`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "ProvisioningFailed",
            message: "Service Catalog operation failed",
            type: "provisioning",
          },
        }
      : {}),
  };
}

function generateServiceQuotasLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const svc = rand(["ec2", "lambda", "rds", "s3", "dynamodb", "ecs", "vpc", "iam"]);
  const quotaName = rand([
    "Running On-Demand Standard instances",
    "Concurrent executions",
    "DB instances",
    "Buckets per account",
    "Provisioned write capacity units",
    "Running tasks",
    "VPCs per region",
    "Roles per account",
  ]);
  const limit = rand([5, 10, 20, 50, 100, 500, 1000, 5000, 10000]);
  const current = isErr
    ? Math.floor(limit * Number(randFloat(0.9, 1.1)))
    : Math.floor(limit * Number(randFloat(0.5, 0.89)));
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "servicequotas" },
    },
    aws: {
      servicequotas: {
        service_code: svc,
        quota_code: `L-${randId(8)}`,
        quota_name: quotaName,
        quota_value: limit,
        current_utilization: current,
        utilization_percent: Math.round((current / limit) * 100),
        adjustable: rand([true, false]),
        request_id: isErr ? `${randId(8)}-${randId(4)}`.toLowerCase() : null,
        request_status: isErr ? rand(["PENDING", "CASE_OPENED"]) : null,
        applied_level: rand(["ACCOUNT", "RESOURCE"]),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["configuration"],
      dataset: "aws.servicequotas",
      provider: "servicequotas.amazonaws.com",
      duration: randInt(50, isErr ? 3000 : 500) * 1e6,
    },
    message:
      current >= limit
        ? `Service Quotas EXCEEDED: ${svc} ${quotaName} at ${current}/${limit} (${Math.round((current / limit) * 100)}%)`
        : `Service Quotas: ${svc} ${quotaName} at ${current}/${limit} (${Math.round((current / limit) * 100)}%)`,
    log: { level: current >= limit ? "error" : current / limit >= 0.9 ? "warn" : "info" },
    ...(current >= limit
      ? { error: { code: "QuotaExceeded", message: "Service Quota exceeded", type: "quota" } }
      : {}),
  };
}

function generateComputeOptimizerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const resourceType = rand([
    "EC2_INSTANCE",
    "EBS_VOLUME",
    "LAMBDA_FUNCTION",
    "ECS_SERVICE_FARGATE",
    "AUTO_SCALING_GROUP",
  ]);
  const finding = isErr
    ? rand(["OVERPROVISIONED", "UNDERPROVISIONED"])
    : rand(["OPTIMIZED", "OPTIMIZED", "OVERPROVISIONED"]);
  const currentType = rand(["t3.medium", "m5.xlarge", "c5.2xlarge", "r5.large", "t3.large"]);
  const recommendedType = rand(["t3.small", "m5.large", "c5.xlarge", "r5.medium", "t3.medium"]);
  const saving = finding === "OVERPROVISIONED" ? Number(randFloat(5, 500)) : 0;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "computeoptimizer" },
    },
    aws: {
      computeoptimizer: {
        resource_type: resourceType,
        resource_arn: `arn:aws:ec2:${region}:${acct.id}:instance/i-${randId(17).toLowerCase()}`,
        finding,
        current_configuration: {
          instance_type: currentType,
          vcpu: randInt(2, 32),
          memory_gb: randInt(4, 128),
        },
        recommended_configuration: {
          instance_type: recommendedType,
          vcpu: randInt(1, 16),
          memory_gb: randInt(2, 64),
        },
        estimated_monthly_savings_usd: saving,
        estimated_monthly_savings_percent: saving > 0 ? Number(randFloat(10, 60)) : 0,
        lookback_period_days: rand([14, 32, 93]),
        utilization: {
          cpu_max: Number(randFloat(5, 95)),
          memory_max: Number(randFloat(10, 95)),
        },
        performance_risk: rand(["VeryLow", "Low", "Medium", "High"]),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "process"],
      dataset: "aws.computeoptimizer",
      provider: "compute-optimizer.amazonaws.com",
      duration: randInt(5, 60) * 1e9,
    },
    message:
      finding === "OVERPROVISIONED"
        ? `Compute Optimizer: ${resourceType} OVERPROVISIONED — downsize ${currentType}→${recommendedType}, save ${saving.toFixed(0)}/mo`
        : finding === "UNDERPROVISIONED"
          ? `Compute Optimizer: ${resourceType} UNDERPROVISIONED — consider upgrading ${currentType}→${recommendedType}:`
          : `Compute Optimizer: ${resourceType} OPTIMIZED (${currentType})`,
    log: { level: finding === "UNDERPROVISIONED" ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: "OptimizerFinding",
            message: "Compute Optimizer finding",
            type: "configuration",
          },
        }
      : {}),
  };
}

function generateBudgetsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const budget = rand([
    "monthly-total",
    "ec2-prod",
    "data-transfer",
    "rds-cluster",
    "dev-sandbox",
    "quarterly-compute",
  ]);
  const budgetType = rand([
    "COST",
    "USAGE",
    "RI_UTILIZATION",
    "RI_COVERAGE",
    "SAVINGS_PLANS_UTILIZATION",
  ]);
  const limit = Number(randFloat(100, 10000));
  const actual = isErr
    ? limit * (1 + Number(randFloat(0.05, 0.5)))
    : limit * Number(randFloat(0.3, 0.95));
  const threshold = isErr ? rand([80, 90, 100]) : rand([50, 60, 70]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "budgets" },
    },
    aws: {
      budgets: {
        budget_name: budget,
        budget_type: budgetType,
        time_period: rand(["MONTHLY", "QUARTERLY", "ANNUALLY"]),
        currency: "USD",
        budget_limit: parseFloat(limit.toFixed(2)),
        actual_spend: parseFloat(actual.toFixed(2)),
        forecasted_spend: parseFloat((actual * Number(randFloat(0.9, 1.4))).toFixed(2)),
        threshold_exceeded: isErr,
        threshold_percentage: threshold,
        notification_type: rand(["ACTUAL", "FORECASTED"]),
        subscribers: rand(["ops@company.com", "finance@company.com"]),
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "process"],
      dataset: "aws.budgets",
      provider: "budgets.amazonaws.com",
      duration: randInt(1, 30) * 1e9,
    },
    message: isErr
      ? `Budget ALERT: ${budget} exceeded ${threshold}% — ${actual.toFixed(0)} of ${limit.toFixed(0)}`
      : `Budget OK: ${budget} at ${actual.toFixed(0)}/${limit.toFixed(0)} (${Math.round((actual / limit) * 100)}%)`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? { error: { code: "BudgetExceeded", message: "Budget threshold exceeded", type: "billing" } }
      : {}),
  };
}

function generateBillingLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const service = rand([
    "AmazonEC2",
    "AmazonS3",
    "AWSDataTransfer",
    "AmazonRDS",
    "AmazonCloudWatch",
    "AmazonLambda",
    "AWSSupport",
  ]);
  const usageType = rand([
    "USE2-BoxUsage",
    "Requests-Tier1",
    "DataTransfer-Out-Bytes",
    "InstanceUsage",
    "Lambda-Request",
  ]);
  const amount = Number(randFloat(0.01, isErr ? 5000 : 500));
  const currency = "USD";
  const period = new Date(ts);
  period.setUTCDate(1);
  period.setUTCHours(0, 0, 0, 0);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "billing" },
    },
    aws: {
      billing: {
        service: service,
        usage_type: usageType,
        estimated_charges: amount,
        currency,
        period_start: period.toISOString().slice(0, 10),
        linked_account_id: acct.id,
        dimensions: { Service: service, LinkedAccount: acct.id, UsageType: usageType },
        metrics: {
          EstimatedCharges: { sum: amount },
          NumberOfRequests: { sum: randInt(1, 1000000) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "process"],
      dataset: "aws.billing",
      provider: "ce.amazonaws.com",
      duration: randInt(100, 5000) * 1e6,
    },
    message: isErr
      ? `Billing anomaly: ${service} ${amount.toFixed(2)} ${currency}`
      : `Billing: ${service} ${amount.toFixed(2)} ${currency}`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? { error: { code: "BillingAnomaly", message: "Unusual cost detected", type: "billing" } }
      : {}),
  };
}

function generateDmsLog(ts: string, er: number): EcsDocument {
  // ~15% chance of generating a DMS Serverless event
  if (Math.random() < 0.15) {
    const r = rand(REGIONS);
    const a = randAccount();
    const e = Math.random() < er;
    const repl = rand([
      "oracle-to-aurora",
      "sqlserver-to-redshift",
      "mongo-to-dynamodb",
      "mysql-to-s3",
    ]);
    const phase = rand(["full-load", "cdc", "validation", "pre-migration-assessment"]);
    const errMsgs = [
      "Source connection lost",
      "Target table not found",
      "LOB column too large",
      "CDC latency exceeded threshold",
    ];
    const dcu = randInt(1, 64);
    return {
      __dataset: "aws.dmsserverless",
      "@timestamp": ts,
      cloud: {
        provider: "aws",
        region: r,
        account: { id: a.id, name: a.name },
        service: { name: "dms-serverless" },
      },
      aws: {
        dmsserverless: {
          replication_config: repl,
          replication_type: phase,
          provisioned_capacity: dcu,
          min_capacity: 1,
          max_capacity: 64,
          tables_loaded: randInt(0, 500),
          tables_loading: randInt(0, 20),
          tables_errored: e ? randInt(1, 10) : 0,
          cdc_latency_seconds: phase === "cdc" ? randFloat(0.1, e ? 300 : 5) : 0,
          rows_applied: randInt(0, 1e6),
          bytes_transferred: randInt(0, 1e9),
        },
      },
      event: { outcome: e ? "failure" : "success", duration: randInt(1e6, 6e8) },
      message: e
        ? `DMS Serverless ${repl}: ${phase} error — ${rand(errMsgs)}`
        : `DMS Serverless ${repl}: ${phase} active (${dcu} DCU, ${randInt(100, 10000)} rows/s)`,
    };
  }
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const taskName = rand([
    "prod-mysql-to-aurora",
    "oracle-to-rds",
    "on-prem-to-rds",
    "mongodb-to-documentdb",
  ]);
  const srcEngine = rand(["oracle", "mysql", "sqlserver", "postgresql", "mongodb"]);
  const dstEngine = rand(["aurora-mysql", "aurora-postgresql", "redshift", "dynamodb", "docdb"]);
  const migrationType = rand(["full-load", "cdc", "full-load-and-cdc"]);
  const rows = isErr ? 0 : randInt(1000, 10000000);
  const replicationInstanceId = `dms-${rand(["prod", "staging", "analytics"])}-${randId(8).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "dms" },
    },
    aws: {
      dimensions: { ReplicationInstanceIdentifier: replicationInstanceId },
      dms: {
        replication_task_id: taskName,
        migration_type: migrationType,
        replication_instance_identifier: replicationInstanceId,
        source_engine: srcEngine,
        target_engine: dstEngine,
        replication_instance_class: rand(["dms.t3.medium", "dms.r5.large", "dms.r5.xlarge"]),
        task_status: isErr ? "Failed" : "Load complete",
        full_load_rows_transferred: rows,
        cdc_incoming_changes: migrationType.includes("cdc") ? randInt(0, 100000) : 0,
        latency_ms: migrationType.includes("cdc") ? randInt(100, isErr ? 60000 : 2000) : 0,
        tables_loaded: randInt(1, 500),
        tables_errored: isErr ? randInt(1, 20) : 0,
        error_message: isErr
          ? rand(["Table does not exist", "Column mapping failure", "Connection timeout"])
          : null,
        metrics: {
          FullLoadThroughputRowsSource: { avg: randInt(100, 100000) },
          FullLoadThroughputRowsTarget: { avg: randInt(100, 100000) },
          ...(migrationType.includes("cdc")
            ? {
                CDCIncomingChanges: { avg: randInt(0, 10000) },
                CDCChangesMemorySource: { avg: randInt(0, 1000) },
                CDCChangesMemoryTarget: { avg: randInt(0, 1000) },
                CDCChangesDiskSource: { avg: randInt(0, 100) },
                CDCChangesDiskTarget: { avg: randInt(0, 100) },
                CDCLatencySource: { avg: randInt(0, isErr ? 60 : 5) },
                CDCLatencyTarget: { avg: randInt(0, isErr ? 120 : 10) },
              }
            : {}),
          CPUUtilization: { avg: randFloat(5, isErr ? 90 : 50) },
          FreeableMemory: { avg: randInt(1e8, 8e9) },
          FreeStorageSpace: { avg: randInt(1e9, 100e9) },
          NetworkReceiveThroughput: { avg: randInt(1000, 1e8) },
          NetworkTransmitThroughput: { avg: randInt(1000, 1e8) },
          ReadIOPS: { avg: randInt(0, 3000) },
          WriteIOPS: { avg: randInt(0, 3000) },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["database", "process"],
      dataset: "aws.dms",
      provider: "dms.amazonaws.com",
      duration: randInt(60, isErr ? 86400 : 28800) * 1e9,
    },
    message: isErr
      ? `DMS ${taskName} FAILED (${srcEngine}->${dstEngine}): ${rand(["Table mapping error", "Connection lost"])}`
      : `DMS ${taskName}: ${rows.toLocaleString()} rows (${srcEngine}->${dstEngine} ${migrationType})`,
    ...(isErr
      ? { error: { code: "DMSError", message: "DMS task failed", type: "migration" } }
      : {}),
    log: { level: isErr ? "error" : "info" },
  };
}

function generateFisLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const expTemplateId = `EXT${randId(8).toUpperCase()}`;
  const expId = `EXP${randId(8).toUpperCase()}`;
  const expName = rand([
    "cpu-stress-test",
    "network-latency-inject",
    "az-failure-simulation",
    "spot-interrupt-test",
    "database-failover",
  ]);
  const expState = isErr ? rand(["failed", "stopped"]) : rand(["running", "completed", "pending"]);
  const action = rand([
    "StartExperiment",
    "StopExperiment",
    "GetExperiment",
    "CreateExperimentTemplate",
    "TagResource",
  ]);
  const target = rand([
    "EC2 instances",
    "ECS tasks",
    "RDS clusters",
    "EKS nodes",
    "Lambda functions",
  ]);
  const action_type = rand([
    "aws:ec2:stop-instances",
    "aws:ec2:terminate-instances",
    "aws:ecs:drain-container-instances",
    "aws:eks:terminate-nodegroup-instances",
    "aws:rds:failover-db-cluster",
    "aws:ssm:send-command",
    "aws:network-acl:replace-entries",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "fis" },
    },
    aws: {
      dimensions: { ExperimentTemplateId: expTemplateId },
      fis: {
        experiment_id: expId,
        experiment_template_id: expTemplateId,
        experiment_name: expName,
        experiment_state: expState,
        target_resource_type: target,
        action_type,
        stop_condition: rand(["none", "aws:cloudwatch:alarm"]),
        role_arn: `arn:aws:iam::${acct.id}:role/FISRole-${expName}`,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.fis",
      provider: "fis.amazonaws.com",
    },
    message: isErr
      ? `FIS ${action} FAILED [${expId}]: ${rand(["Experiment failed", "Target not found", "Permission denied", "Stop condition triggered"])}`
      : `FIS ${action}: exp=${expId} (${expName}) state=${expState}, target=${target}`,
    log: { level: isErr ? "error" : expState === "stopped" ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "ServiceQuotaExceededException",
            ]),
            message: "FIS experiment failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateManagedGrafanaLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const workspaceId = `g-${randId(10).toLowerCase()}`;
  const workspaceName = rand([
    "prod-observability",
    "ops-dashboards",
    "security-monitoring",
    "business-metrics",
    "devops-metrics",
  ]);
  const action = rand([
    "CreateWorkspace",
    "UpdateWorkspace",
    "CreateApiKey",
    "DeleteApiKey",
    "AssociateLicense",
    "DisassociateLicense",
    "UpdatePermissions",
  ]);
  const alertState = rand(["ok", "alerting", "pending", "no_data"]);
  const dashboardTitle = rand([
    "EC2 Overview",
    "Lambda Performance",
    "RDS Metrics",
    "EKS Cluster Health",
    "Cost Analysis",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "managedgrafana" },
    },
    aws: {
      dimensions: { WorkspaceId: workspaceId },
      managedgrafana: {
        workspace_id: workspaceId,
        workspace_name: workspaceName,
        workspace_status: isErr ? "FAILED" : rand(["ACTIVE", "CREATING", "UPDATING"]),
        grafana_version: rand(["9.4", "10.2", "10.4"]),
        alert_state: isErr ? "alerting" : alertState,
        dashboard_title: dashboardTitle,
        datasource_type: rand(["prometheus", "cloudwatch", "elasticsearch", "influxdb", "athena"]),
        authentication_providers: rand(["AWS_SSO", "SAML"]),
        notification_destinations: rand(["SNS", "SLACK", "PAGERDUTY"]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.managedgrafana",
      provider: "grafana.amazonaws.com",
    },
    message: isErr
      ? `Managed Grafana ${action} FAILED [${workspaceName}]: ${rand(["Workspace not active", "License required", "Access denied"])}`
      : `Managed Grafana ${action}: workspace=${workspaceName} alert=${alertState} dashboard="${dashboardTitle}"`,
    log: { level: isErr ? "error" : alertState === "alerting" ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "AccessDeniedException",
            ]),
            message: "Managed Grafana operation failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateSupplyChainLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const instanceId = `arn:aws:scn:${region}:${acct.id}:instance/${randId(12).toLowerCase()}`;
  const instanceName = rand([
    "global-supply-chain",
    "apac-logistics",
    "emea-distribution",
    "north-america-ops",
  ]);
  const namespace = rand([
    "aws.supply_chain.plan",
    "aws.supply_chain.insight",
    "aws.supply_chain.collaboration",
  ]);
  const action = rand([
    "CreateInstance",
    "UpdateInstance",
    "CreateDataLakeDataset",
    "SendDataIntegrationEvent",
    "CreateBillOfMaterialsImportJob",
  ]);
  const eventType = rand([
    "scn.data.forecast",
    "scn.data.inventory",
    "scn.data.purchase_order",
    "scn.data.shipment",
    "scn.data.supply_plan",
  ]);
  const jobStatus = isErr ? "FAILED" : rand(["SUCCESS", "IN_PROGRESS", "QUEUED"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "supplychain" },
    },
    aws: {
      dimensions: { InstanceId: instanceId },
      supplychain: {
        instance_id: instanceId,
        instance_name: instanceName,
        namespace,
        event_type: eventType,
        job_status: jobStatus,
        record_count: randInt(100, 1000000),
        forecast_horizon_days: randInt(7, 180),
        data_lake_dataset: rand([
          "demand_forecast",
          "inventory_levels",
          "supplier_lead_times",
          "purchase_orders",
          "shipments",
        ]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.supplychain",
      provider: "scn.amazonaws.com",
    },
    message: isErr
      ? `Supply Chain ${action} FAILED [${instanceName}]: ${rand(["Data validation error", "Integration timeout", "Dataset not found"])}`
      : `Supply Chain ${action}: instance=${instanceName} event=${eventType} status=${jobStatus}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "InternalServerException",
            ]),
            message: "Supply Chain operation failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateArcLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const resourceArn = `arn:aws:elasticloadbalancing:${region}:${acct.id}:loadbalancer/app/prod-alb/${randId(16).toLowerCase()}`;
  const shiftId = `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const az = `${region}${rand(["a", "b", "c"])}`;
  const azStatus = isErr ? "IMPAIRED" : rand(["AVAILABLE", "UNAVAILABLE", "PARTIAL"]);
  const shiftStatus = isErr
    ? "FAILED"
    : rand(["ACTIVE", "EXPIRED", "COMPLETED", "CANCELLED", "ENABLED"]);
  const action = rand([
    "StartZonalShift",
    "UpdateZonalShift",
    "CancelZonalShift",
    "GetManagedResource",
    "UpdateRoutingControlState",
  ]);
  const comment = rand([
    "Planned maintenance",
    "AZ degradation detected",
    "Failover test",
    "Proactive shift",
    "Incident response",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "arc" },
      availability_zone: az,
    },
    aws: {
      dimensions: { ResourceArn: resourceArn, AwsAccountId: acct.id },
      arc: {
        shift_id: shiftId,
        resource_arn: resourceArn,
        away_from: az,
        zonal_shift_status: shiftStatus,
        az_status: azStatus,
        comment,
        expiry_time: new Date(new Date(ts).getTime() + randInt(3600, 86400) * 1000).toISOString(),
        routing_control_arn: `arn:aws:route53-recovery-control::${acct.id}:controlpanel/${randId(32).toLowerCase()}/routingcontrol/${randId(32).toLowerCase()}`,
        routing_control_state: isErr ? "Off" : rand(["On", "Off"]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["network", "process"],
      dataset: "aws.arc",
      provider: "arc-zonal-shift.amazonaws.com",
    },
    message: isErr
      ? `ARC ${action} FAILED [${shiftId}]: ${rand(["Resource not found", "Invalid state", "Access denied"])}`
      : `ARC ${action}: shift=${shiftId}, az=${az} status=${shiftStatus}, ${comment}`,
    log: {
      level:
        azStatus === "IMPAIRED" || isErr ? "error" : shiftStatus === "ACTIVE" ? "warn" : "info",
    },
    ...(isErr
      ? {
          error: {
            code: rand(["ResourceNotFoundException", "ConflictException", "ValidationException"]),
            message: "ARC zonal shift operation failed",
            type: "network",
          },
        }
      : {}),
  };
}

function generateAppConfigLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand(["WebApp", "MobileAPI", "DataPipeline", "AdminPortal"]);
  const env = rand(["prod", "staging", "dev", "qa"]);
  const profile = rand(["FeatureFlags", "LaunchDarkly", "AppSettings", "RateLimits"]);
  const deploymentNum = randInt(1, 500);
  const deploymentStrategy = rand([
    "Linear50PercentEvery30Seconds",
    "AllAtOnce",
    "Canary10Percent20Minutes",
  ]);
  const growthFactor = rand([10, 20, 33, 50, 100]);
  const percentageComplete = isErr ? randInt(10, 90) : 100;
  const state = isErr
    ? rand(["BAKING", "ROLLED_BACK", "ROLLING_BACK"])
    : rand(["COMPLETE", "VALIDATING", "DEPLOYING"]);
  const action = rand([
    "StartDeployment",
    "StopDeployment",
    "RollbackDeployment",
    "ValidateConfiguration",
    "RetrieveConfiguration",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "appconfig" },
    },
    aws: {
      dimensions: { Application: app, Environment: env },
      appconfig: {
        application_name: app,
        environment_name: env,
        configuration_profile: profile,
        deployment_number: deploymentNum,
        deployment_strategy: deploymentStrategy,
        growth_factor: growthFactor,
        percentage_complete: percentageComplete,
        state,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["configuration"],
      dataset: "aws.appconfig",
      provider: "appconfig.amazonaws.com",
    },
    message: isErr
      ? `AppConfig ${app}/${env}: deployment #${deploymentNum} ROLLED_BACK at ${percentageComplete}%`
      : `AppConfig ${app}/${env}: ${profile} deployment #${deploymentNum} ${state}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["BadRequestException", "ConflictException", "InternalServerException"]),
            message: "AppConfig deployment failed",
            type: "configuration",
          },
        }
      : {}),
  };
}

function generateDrsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const sourceServerId = `s-` + randId(17).toLowerCase();
  const sourceHostname = rand(["web-server-01", "db-primary", "api-gateway-02", "app-server-03"]);
  const replicationStatus = isErr
    ? rand(["Disconnected", "Error", "Paused"])
    : rand(["Continuous", "InProgress", "Continuous", "Continuous"]);
  const lagDuration = isErr ? randInt(60, 3600) : randInt(0, 30);
  const rpoSeconds = randInt(lagDuration, lagDuration + 60);
  const action = rand([
    "ReplicationStateChange",
    "RecoveryInstanceLaunch",
    "FailbackComplete",
    "DrillLaunch",
    "TerminateRecoveryInstance",
    "SourceServerDisconnected",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "drs" },
    },
    aws: {
      dimensions: { SourceServerId: sourceServerId },
      drs: {
        source_server_id: sourceServerId,
        source_hostname: sourceHostname,
        replication_status: replicationStatus,
        lag_duration_seconds: lagDuration,
        recovery_instance_id: rand([null, null, `i-` + randId(17).toLowerCase()]),
        data_replication_state: rand(["Continuous", "InProgress", "Paused", "Disconnected"]),
        ebs_volume_count: randInt(1, 8),
        staging_area: rand(["us-east-1", "us-west-2", "eu-west-1"]),
        recovery_point_objective_seconds: rpoSeconds,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["host"],
      dataset: "aws.drs",
      provider: "drs.amazonaws.com",
    },
    message: isErr
      ? `DRS ${sourceHostname} (${sourceServerId}): replication ${replicationStatus}, lag ${lagDuration}s`
      : `DRS ${sourceHostname}: replication ${replicationStatus}, RPO ${rpoSeconds}s`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "UninitializedAccountException",
              "ValidationException",
            ]),
            message: "DRS replication failure",
            type: "host",
          },
        }
      : {}),
  };
}

function generateLicenseManagerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const licenseConfig = rand([
    "Windows-Server-2022",
    "SQL-Server-Enterprise",
    "RHEL-8-Sockets",
    "Oracle-SE2-vCPU",
  ]);
  const resourceType = rand(["EC2_INSTANCE", "RDS", "ROLE"]);
  const consumedLicenses = randInt(1, 500);
  const licensedCount = randInt(consumedLicenses, 1000);
  const utilizationPercentage = Math.round((consumedLicenses / licensedCount) * 100);
  const status = isErr ? rand(["LimitExceeded", "Disabled"]) : "Active";
  const action = rand([
    "CheckOutLicense",
    "CheckInLicense",
    "ExtendLicense",
    "CreateLicenseConfiguration",
    "UpdateLicenseConfiguration",
    "AssociateResource",
    "DisassociateResource",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "licensemanager" },
    },
    aws: {
      dimensions: { LicenseConfigurationName: licenseConfig },
      licensemanager: {
        license_configuration_name: licenseConfig,
        license_configuration_arn: `arn:aws:license-manager:${region}:${acct.id}:license-configuration:${randId(36)}`,
        resource_type: resourceType,
        consumed_licenses: consumedLicenses,
        licensed_count: licensedCount,
        utilization_percentage: utilizationPercentage,
        rule_type: rand(["vCPU", "Sockets", "Cores", "Instances"]),
        status,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["configuration"],
      dataset: "aws.licensemanager",
      provider: "license-manager.amazonaws.com",
    },
    message: isErr
      ? `License Manager ${licenseConfig}: limit exceeded (${consumedLicenses}/${licensedCount})`
      : `License Manager ${licenseConfig}: ${consumedLicenses}/${licensedCount} (${utilizationPercentage}%) ${resourceType}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "LicenseUsageException",
              "ResourceLimitExceededException",
              "ValidationException",
            ]),
            message: "License Manager limit exceeded",
            type: "configuration",
          },
        }
      : {}),
  };
}

function generateChatbotLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const channelConfig = rand([
    "ops-alerts",
    "security-alerts",
    "deploy-notifications",
    "cost-alerts",
  ]);
  const channelType = rand(["Slack", "MicrosoftTeams", "Chime"]);
  const notificationType = rand([
    "CloudWatchAlarm",
    "SecurityHubFinding",
    "GuardDutyFinding",
    "AWSHealthEvent",
    "SNSNotification",
  ]);
  const deliveryStatus = isErr
    ? rand(["Failed", "Throttled", "Unauthorized"])
    : rand(["Delivered", "Delivered", "Delivered", "Suppressed"]);
  const action = rand([
    "NotificationDelivery",
    "CommandExecution",
    "AlertSuppression",
    "ChannelTest",
    "BotInvitation",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "chatbot" },
    },
    aws: {
      dimensions: { ChannelConfiguration: channelConfig, ChannelType: channelType },
      chatbot: {
        channel_configuration_name: channelConfig,
        channel_type: channelType,
        notification_type: notificationType,
        workspace_id: `T` + randId(8).toUpperCase(),
        channel_id: `C` + randId(8).toUpperCase(),
        delivery_status: deliveryStatus,
        message_id: randUUID(),
        sns_topic_arn: `arn:aws:sns:${region}:${acct.id}:${notificationType.toLowerCase()}-topic`,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["configuration"],
      dataset: "aws.chatbot",
      provider: "chatbot.amazonaws.com",
    },
    message: isErr
      ? `Chatbot ${channelConfig} (${channelType}): ${notificationType} delivery ${deliveryStatus}`
      : `Chatbot ${channelConfig}: ${notificationType} delivered to ${channelType}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "InvalidParameterException",
              "ResourceNotFoundException",
              "ConflictException",
            ]),
            message: "Chatbot notification delivery failed",
            type: "configuration",
          },
        }
      : {}),
  };
}

// ─── CloudWatch RUM ───────────────────────────────────────────────────────
function generateCloudWatchRumLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const appMonitors = ["web-app-prod", "mobile-web", "checkout-flow", "dashboard-ui"];
  const appMonitor = rand(appMonitors);
  const eventTypes = [
    "com.amazon.rum.performance_navigation_event",
    "com.amazon.rum.js_error_event",
    "com.amazon.rum.http_event",
    "com.amazon.rum.session_start_event",
    "com.amazon.rum.page_view_event",
  ];
  const evType = isErr ? "com.amazon.rum.js_error_event" : rand(eventTypes);
  const pages = ["/", "/products", "/cart", "/checkout", "/account", "/search"];
  const browsers = ["Chrome 120", "Firefox 121", "Safari 17", "Edge 120"];
  const webVitals = {
    lcp_ms: randFloat(500, isErr ? 8000 : 2500),
    fid_ms: randFloat(10, isErr ? 500 : 100),
    cls: randFloat(0, isErr ? 0.5 : 0.1),
    fcp_ms: randFloat(200, isErr ? 5000 : 1800),
    ttfb_ms: randFloat(50, isErr ? 3000 : 800),
    inp_ms: randFloat(10, isErr ? 1000 : 200),
  };
  const jsErrors = [
    "TypeError: Cannot read property 'length' of undefined",
    "ReferenceError: config is not defined",
    "SyntaxError: Unexpected token",
    "RangeError: Maximum call stack size exceeded",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudwatch-rum" },
    },
    aws: {
      cloudwatch_rum: {
        app_monitor_name: appMonitor,
        app_monitor_id: randId(36).toLowerCase(),
        event_type: evType,
        page_url: `https://${appMonitor}.example.com${rand(pages)}`,
        browser: rand(browsers),
        os: rand(["Windows 11", "macOS 14", "iOS 17", "Android 14"]),
        device_type: rand(["desktop", "mobile", "tablet"]),
        country: rand(["US", "GB", "DE", "JP", "IN", "BR"]),
        session_id: randId(32).toLowerCase(),
        ...(evType.includes("navigation") ? { web_vitals: webVitals } : {}),
        ...(evType.includes("js_error")
          ? { error_message: rand(jsErrors), error_type: "js_error" }
          : {}),
        ...(evType.includes("http_event")
          ? { http_status: isErr ? rand([500, 502, 503]) : 200, http_method: rand(["GET", "POST"]) }
          : {}),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e3, 8e6) },
    message: isErr
      ? `RUM ${appMonitor}: ${evType.split(".").pop()} error on ${rand(pages)}`
      : `RUM ${appMonitor}: ${evType.split(".").pop()} (LCP ${webVitals.lcp_ms.toFixed(0)}ms)`,
  };
}

export {
  generateCloudFormationLog,
  generateSsmLog,
  generateCloudWatchAlarmsLog,
  generateHealthLog,
  generateTrustedAdvisorLog,
  generateControlTowerLog,
  generateOrganizationsLog,
  generateServiceCatalogLog,
  generateServiceQuotasLog,
  generateComputeOptimizerLog,
  generateBudgetsLog,
  generateBillingLog,
  generateDmsLog,
  generateFisLog,
  generateManagedGrafanaLog,
  generateSupplyChainLog,
  generateArcLog,
  generateAppConfigLog,
  generateDrsLog,
  generateLicenseManagerLog,
  generateChatbotLog,
  generateCloudWatchRumLog,
};
