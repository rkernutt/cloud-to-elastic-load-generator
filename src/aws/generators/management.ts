import {
  rand,
  randInt,
  randFloat,
  randId,
  randHexId,
  randUUID,
  randAccount,
  REGIONS,
  randIamUser,
  randEmailDomain,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateCloudFormationLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const scenario = rand([
    "stack_resource_update",
    "stack_drift_detection",
    "changeset_execute",
    "nested_stack_update",
    "rollback_complete",
  ] as const);
  const stack = rand([
    "prod-web-stack",
    "vpc-infra",
    "rds-cluster",
    "ecs-services",
    "api-gateway-stack",
  ]);
  const stackId =
    `arn:aws:cloudformation:${region}:${acct.id}:stack/${stack}/${randId(8)}`.toLowerCase();
  const awsApiOperation =
    scenario === "stack_drift_detection"
      ? rand(["DetectStackDrift", "DescribeStackDriftDetectionStatus"])
      : scenario === "changeset_execute"
        ? rand(["CreateChangeSet", "ExecuteChangeSet", "DescribeChangeSet"])
        : scenario === "nested_stack_update"
          ? "UpdateStack"
          : scenario === "rollback_complete"
            ? rand(["ContinueUpdateRollback", "CancelUpdateStack"])
            : rand(["UpdateStack", "CreateStack"]);
  const changeSetId =
    scenario === "changeset_execute"
      ? `arn:aws:cloudformation:${region}:${acct.id}:changeSet/cs-${randId(10)}`
      : null;
  const resourceType = rand([
    "AWS::EC2::VPC",
    "AWS::ECS::Service",
    "AWS::RDS::DBInstance",
    "AWS::Lambda::Function",
    "AWS::IAM::Role",
  ]);
  const logicalResourceId = rand([
    "WebServerASG",
    "DatabaseCluster",
    "ApiFunction",
    "TaskRole",
    "VPC",
  ]);
  const physicalResourceId = rand([
    `vpc-${randHexId(8)}`,
    `arn:aws:ecs:${region}:${acct.id}:service/prod/api`,
    `arn:aws:rds:${region}:${acct.id}:db:prod-001`,
    `arn:aws:lambda:${region}:${acct.id}:function:api-handler`,
    `arn:aws:iam::${acct.id}:role/TaskRole`,
  ]);
  const resourceStatus = isErr
    ? rand(["CREATE_FAILED", "UPDATE_FAILED", "DELETE_FAILED"])
    : rand([
        "CREATE_IN_PROGRESS",
        "CREATE_COMPLETE",
        "UPDATE_IN_PROGRESS",
        "UPDATE_COMPLETE",
        "DELETE_IN_PROGRESS",
        "DELETE_COMPLETE",
      ]);
  const resourceStatusReason =
    isErr || resourceStatus.endsWith("_IN_PROGRESS")
      ? rand([
          "Resource creation failed",
          "Insufficient capacity",
          "IAM policy error",
          "User Initiated",
          "Eventual consistency check initiated",
        ])
      : null;
  const useStructuredLogging = true;
  const stackEventPayload = {
    StackId: stackId,
    StackName: stack,
    ResourceType: resourceType,
    LogicalResourceId: logicalResourceId,
    PhysicalResourceId: physicalResourceId,
    ResourceStatus: resourceStatus,
    ResourceStatusReason: resourceStatusReason,
    Timestamp: new Date(ts).toISOString(),
  };
  const message = JSON.stringify(stackEventPayload);
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
        stack_id: stackId,
        scenario,
        aws_api_operation: awsApiOperation,
        change_set_id: changeSetId,
        nested_stack_logical_id: scenario === "nested_stack_update" ? "NestedVPCStack" : null,
        stack_status:
          resourceStatus.includes("COMPLETE") && !resourceStatus.includes("ROLLBACK")
            ? resourceStatus
            : rand(["CREATE_COMPLETE", "UPDATE_IN_PROGRESS", "UPDATE_COMPLETE"]),
        resource_type: resourceType,
        logical_resource_id: logicalResourceId,
        physical_resource_id: physicalResourceId,
        resource_status: resourceStatus,
        resource_status_reason: resourceStatusReason,
        drift_status:
          scenario === "stack_drift_detection"
            ? isErr
              ? "FAILED"
              : "DRIFTED"
            : rand(["NOT_CHECKED", "IN_SYNC", "DRIFTED"]),
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
            code: rand([
              "InsufficientCapabilitiesException",
              "ChangeSetNotFoundException",
              "AlreadyExistsException",
              "ValidationError",
              "TokenAlreadyExistsException",
            ]),
            message:
              scenario === "changeset_execute"
                ? "Cannot execute change set: stack is in UPDATE_IN_PROGRESS"
                : scenario === "stack_drift_detection"
                  ? "Drift detection terminated: throttled DescribeStackResources"
                  : "CloudFormation stack mutation failed",
            type: "aws",
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
  const scenario = rand([
    "run_command",
    "parameter_store_get",
    "maintenance_window_exec",
    "state_manager_association",
    "patch_baseline_execution",
  ] as const);
  const maintenanceWindowId = `mw-${randId(8).toLowerCase()}`;
  const maintenanceWindowExecId = `${maintenanceWindowId}-${randId(8)}`;
  const instance = `i-${randHexId(17)}`;
  const action =
    scenario === "run_command"
      ? rand(["RunCommand", "SendCommand"])
      : scenario === "parameter_store_get"
        ? rand(["GetParameter", "PutParameter"])
        : scenario === "maintenance_window_exec"
          ? rand(["RunCommand", "SendCommand"])
          : scenario === "state_manager_association"
            ? "AssociationCompliance"
            : "PatchBaselineExecution";
  const document = rand([
    "AWS-RunShellScript",
    "AWS-RunPowerShellScript",
    "AWS-ApplyPatchBaseline",
    "AWS-ConfigureAWSPackage",
  ]);
  const commandId = `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase();
  const stepName = rand([
    "runShellScript",
    "aws:runPowerShellScript",
    "aws:runCommand",
    "updateOSSoftware",
  ]);
  const stepOutput = isErr
    ? `failed to run commands: exit status ${rand([1, 2, 127])}`
    : rand(["stdout: OK\n", "Patching complete\n", "Package installed\n", "No updates needed\n"]);
  const patchBaselineId = `pb-${randId(8).toLowerCase()}`;
  const associationId =
    `${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`.toLowerCase();
  const complianceType = rand(["Patch", "Association", "Inventory"]);
  const complianceStatus = isErr ? "NON_COMPLIANT" : "COMPLIANT";
  const useStructuredLogging = true;
  const structuredPayload: Record<string, unknown> = {
    commandId,
    documentName: document,
    documentVersion: `$DEFAULT`,
    instanceId: instance,
    action,
    scenario,
    status: isErr ? "Failed" : "Success",
    timestamp: new Date(ts).toISOString(),
  };
  if (action === "RunCommand" || action === "SendCommand") {
    structuredPayload.pluginOutput = {
      stepName,
      output: stepOutput,
      exitCode: isErr ? rand([1, 2, 127]) : 0,
    };
  }
  if (action === "AssociationCompliance") {
    structuredPayload.complianceSummary = {
      complianceType,
      complianceStatus,
      associationId,
      detailedStatus: isErr ? rand(["ExecutionTimedOut", "Failed"]) : "Success",
    };
  }
  if (action === "PatchBaselineExecution") {
    structuredPayload.patchBaseline = {
      baselineId: patchBaselineId,
      operation: rand(["Scan", "Install"]),
      instancePatchState: isErr ? "Failed" : "InstalledPendingReboot",
      missingCount: isErr ? randInt(1, 20) : randInt(0, 3),
    };
  }
  if (action === "GetParameter" || action === "PutParameter") {
    structuredPayload.parameterStore = {
      name: rand(["/prod/db/password", "/prod/api/key", "/app/feature/flags"]),
      type: rand(["String", "SecureString", "StringList"]),
      operation: action === "GetParameter" ? "GetParameter" : "PutParameter",
      dataVersion: randInt(1, 10),
    };
  }
  if (scenario === "maintenance_window_exec") {
    structuredPayload.maintenanceWindow = {
      windowId: maintenanceWindowId,
      executionId: maintenanceWindowExecId,
      taskInvocationId: `ti-${randId(8)}`,
    };
  }
  const message = JSON.stringify(structuredPayload);
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
        patch_compliance:
          action.includes("Patch") || action === "PatchBaselineExecution"
            ? rand(["Compliant", "NonCompliant", "NotApplicable"])
            : null,
        patch_baseline_id: action === "PatchBaselineExecution" ? patchBaselineId : null,
        association_id: action === "AssociationCompliance" ? associationId : null,
        compliance_status: action === "AssociationCompliance" ? complianceStatus : null,
        step_name: action === "RunCommand" || action === "SendCommand" ? stepName : null,
        step_output_preview:
          action === "RunCommand" || action === "SendCommand" ? stepOutput.slice(0, 200) : null,
        structured_logging: useStructuredLogging,
        scenario,
        maintenance_window_id: scenario === "maintenance_window_exec" ? maintenanceWindowId : null,
        maintenance_execution_id:
          scenario === "maintenance_window_exec" ? maintenanceWindowExecId : null,
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
      ? {
          error: {
            code: rand([
              "InvalidInstanceId",
              "InvalidParameters",
              "ParameterNotFound",
              "HierarchyLevelLimitExceededException",
              "AccessDeniedException",
              "ThrottlingException",
            ]),
            message:
              scenario === "parameter_store_get"
                ? "Systems Manager Parameter Store denied GetParameter decryption"
                : scenario === "maintenance_window_exec"
                  ? "Maintenance window task aborted: target became unreachable"
                  : "Automation document execution failed",
            type: "aws",
          },
        }
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
    message: JSON.stringify({
      AlarmName: alarmName,
      AlarmArn: `arn:aws:cloudwatch:${region}:${acct.id}:alarm:${alarmName}`,
      NewStateValue: alarmState,
      OldStateValue: rand(["OK", "ALARM", "INSUFFICIENT_DATA"]),
      NewStateReason: `Threshold Crossed: 1 datapoint [${val.toFixed(2)}] was ${alarmState === "ALARM" ? "greater" : "not greater"} than the threshold (${threshold}).`,
      StateChangeTime: new Date(ts).toISOString(),
      Trigger: {
        MetricName: metric,
        Namespace: ns,
        Statistic: rand(["Average", "Maximum", "Sum", "p99"]),
        Period: rand([60, 300, 3600]),
        EvaluationPeriods: rand([1, 2, 3]),
        ComparisonOperator: "GreaterThanThreshold",
        Threshold: threshold,
        TreatMissingData: rand(["missing", "notBreaching", "breaching"]),
      },
    }),
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
    message: JSON.stringify({
      eventArn: `arn:aws:health:${region}::event/${svc}/${randId(8)}/${randId(36)}`.toLowerCase(),
      service: svc,
      eventTypeCode: `AWS_${svc.toUpperCase()}_${rand(["OPERATIONAL_ISSUE", "MAINTENANCE_SCHEDULED", "API_ISSUE"])}`,
      eventTypeCategory: rand(["issue", "scheduledChange", "accountNotification"]),
      eventScopeCode: rand(["ACCOUNT", "PUBLIC"]),
      statusCode: rand(statuses),
      region: rand([region, "global"]),
      startTime: new Date(new Date(ts).getTime() - randInt(3600, 86400) * 1000).toISOString(),
      lastUpdatedTime: new Date(ts).toISOString(),
      affectedEntitiesCount: randInt(1, 50),
      description: `${svc} ${rand(["Increased error rates", "Degraded performance", "Scheduled maintenance", "Connectivity issues"])} in ${region}`,
    }),
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
    message: JSON.stringify({
      eventType: action,
      operationId: randId(36).toLowerCase(),
      accountId: acct.id,
      organizationalUnit: rand(["Sandbox", "Production", "Workloads", "Infrastructure"]),
      guardrailIdentifier: action.includes("Guardrail") ? guardrail : null,
      guardrailComplianceStatus: isErr ? "NONCOMPLIANT" : rand(["COMPLIANT", "NOT_APPLICABLE"]),
      landingZoneVersion: rand(["3.1", "3.2", "3.3"]),
      status,
      errorMessage: isErr
        ? rand(["Enrollment failed", "SCP error", "Compliance check failed"])
        : null,
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      eventType: action,
      accountId: acct.id,
      accountName: rand(["prod-workloads", "security-audit", "shared-services", "sandbox-dev"]),
      organizationalUnit: rand(ous),
      policyId: action.includes("Policy") ? `p-${randId(8).toLowerCase()}` : null,
      policyType: action.includes("Policy") ? policyType : null,
      policyName: action.includes("Policy")
        ? rand(["DenyRootUserActions", "RequireS3Encryption", "TagCompliance"])
        : null,
      status: isErr ? "FAILED" : "SUCCESS",
      errorCode: isErr
        ? rand([
            "DuplicateAccountException",
            "ConstraintViolationException",
            "AccessDeniedException",
          ])
        : null,
      timestamp: new Date(ts).toISOString(),
    }),
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
  const user = randIamUser();
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
        launch_role: rand([null, `arn:aws:iam::${acct.id}:role/ServiceCatalogLaunchRole`]),
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
    message: JSON.stringify({
      eventType: action,
      productName: product,
      productId: `prod-${randId(13)}`,
      portfolioId: `port-${randId(13)}`,
      provisionedProductName: `${product.toLowerCase().replace(/ /g, "-")}-${randId(6).toLowerCase()}`,
      recordId: `rec-${randId(13)}`,
      status,
      requesterArn: `arn:aws:iam::${acct.id}:user/${user}`,
      launchRoleArn: rand([null, `arn:aws:iam::${acct.id}:role/ServiceCatalogLaunchRole`]),
      errorMessage: isErr
        ? rand(["Launch role not authorized", "Resource limit exceeded", "Invalid parameters"])
        : null,
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      serviceCode: svc,
      quotaCode: `L-${randId(8)}`,
      quotaName,
      quotaValue: limit,
      currentUtilization: current,
      utilizationPercent: Math.round((current / limit) * 100),
      adjustable: rand([true, false]),
      requestId: isErr ? `${randId(8)}-${randId(4)}`.toLowerCase() : null,
      requestStatus: isErr ? rand(["PENDING", "CASE_OPENED"]) : "APPROVED",
      appliedLevel: rand(["ACCOUNT", "RESOURCE"]),
      status: current >= limit ? "QUOTA_EXCEEDED" : "WITHIN_QUOTA",
      timestamp: new Date(ts).toISOString(),
    }),
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
        resource_arn: `arn:aws:ec2:${region}:${acct.id}:instance/i-${randHexId(17)}`,
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
    message: JSON.stringify({
      resourceType,
      resourceArn: `arn:aws:ec2:${region}:${acct.id}:instance/i-${randHexId(17)}`,
      finding,
      currentConfiguration: {
        instanceType: currentType,
        vcpu: randInt(2, 32),
        memoryGb: randInt(4, 128),
      },
      recommendedConfiguration: {
        instanceType: recommendedType,
        vcpu: randInt(1, 16),
        memoryGb: randInt(2, 64),
      },
      estimatedMonthlySavingsUsd: saving,
      estimatedMonthlySavingsPercent: saving > 0 ? Number(randFloat(10, 60)) : 0,
      lookbackPeriodDays: rand([14, 32, 93]),
      utilizationMetrics: {
        cpuMaxPercent: Number(randFloat(5, 95)),
        memoryMaxPercent: Number(randFloat(10, 95)),
      },
      performanceRisk: rand(["VeryLow", "Low", "Medium", "High"]),
      lastRefreshTimestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      budgetName: budget,
      budgetType,
      timePeriod: rand(["MONTHLY", "QUARTERLY", "ANNUALLY"]),
      budgetLimit: { amount: parseFloat(limit.toFixed(2)), unit: "USD" },
      actualSpend: { amount: parseFloat(actual.toFixed(2)), unit: "USD" },
      forecastedSpend: {
        amount: parseFloat((actual * Number(randFloat(0.9, 1.4))).toFixed(2)),
        unit: "USD",
      },
      thresholdExceeded: isErr,
      thresholdPercentage: threshold,
      notificationType: rand(["ACTUAL", "FORECASTED"]),
      subscribers: [rand(["ops@company.com", "finance@company.com"])],
      alertType: isErr ? "ACTUAL_GREATER_THAN_THRESHOLD" : "OK",
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      anomalyId: `ANOMALY-${randId(12).toUpperCase()}`,
      monitorArn: `arn:aws:ce::${acct.id}:anomalymonitor/${randId(8)}`,
      anomalyStartDate: period.toISOString().slice(0, 10),
      anomalyEndDate: new Date(ts).toISOString().slice(0, 10),
      dimensionValue: service,
      maxImpact: { amount, unit: currency },
      totalImpact: { amount: amount * Number(randFloat(1, 3)), unit: currency },
      impactPercentage: isErr ? Number(randFloat(25, 400)) : Number(randFloat(5, 24)),
      rootCauses: isErr ? [{ service, usageType, linkedAccount: acct.id }] : [],
      status: isErr ? "ACTIVE" : "RESOLVED",
      timestamp: new Date(ts).toISOString(),
    }),
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
      message: JSON.stringify({
        replicationConfigArn: `arn:aws:dms:${r}:${a.id}:replication-config:${repl}`,
        replicationType: phase,
        provisionedCapacity: dcu,
        status: e ? "FAILED" : "RUNNING",
        tablesLoaded: randInt(0, 500),
        tablesLoading: randInt(0, 20),
        tablesErrored: e ? randInt(1, 10) : 0,
        cdcLatencySeconds: phase === "cdc" ? randFloat(0.1, e ? 300 : 5) : 0,
        rowsApplied: randInt(0, 1e6),
        errorMessage: e ? rand(errMsgs) : null,
        timestamp: new Date(ts).toISOString(),
      }),
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
    message: JSON.stringify({
      replicationTaskArn: `arn:aws:dms:${region}:${acct.id}:task:${taskName}`,
      replicationTaskIdentifier: taskName,
      migrationType,
      sourceEngine: srcEngine,
      targetEngine: dstEngine,
      replicationInstanceIdentifier: replicationInstanceId,
      status: isErr ? "failed" : "running",
      fullLoadProgressPercent: isErr ? randInt(10, 90) : 100,
      fullLoadRowsTransferred: rows,
      cdcIncomingChanges: migrationType.includes("cdc") ? randInt(0, 100000) : 0,
      cdcLatencySeconds: migrationType.includes("cdc") ? randInt(1, isErr ? 60 : 5) : 0,
      tablesLoaded: randInt(1, 500),
      tablesErrored: isErr ? randInt(1, 20) : 0,
      errorMessage: isErr
        ? rand(["Table does not exist", "Column mapping failure", "Connection timeout"])
        : null,
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      eventType: action,
      experimentId: expId,
      experimentTemplateId: expTemplateId,
      experimentName: expName,
      state: { status: expState },
      targetResourceType: target,
      actionId: `action-${randId(8).toLowerCase()}`,
      actionType: action_type,
      stopCondition: rand(["none", "aws:cloudwatch:alarm"]),
      roleArn: `arn:aws:iam::${acct.id}:role/FISRole-${expName}`,
      status: isErr ? "FAILED" : "SUCCESS",
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      eventType: action,
      workspaceId,
      workspaceName,
      workspaceStatus: isErr ? "FAILED" : rand(["ACTIVE", "CREATING", "UPDATING"]),
      grafanaVersion: rand(["9.4", "10.2", "10.4"]),
      alertState: isErr ? "alerting" : alertState,
      dashboardTitle,
      dataSourceType: rand(["prometheus", "cloudwatch", "elasticsearch", "influxdb", "athena"]),
      authenticationProviders: [rand(["AWS_SSO", "SAML"])],
      status: isErr ? "FAILED" : "SUCCESS",
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      eventType: action,
      instanceArn: instanceId,
      instanceName,
      namespace,
      dataIntegrationEventType: eventType,
      jobStatus,
      recordCount: randInt(100, 1000000),
      forecastHorizonDays: randInt(7, 180),
      dataLakeDataset: rand([
        "demand_forecast",
        "inventory_levels",
        "supplier_lead_times",
        "purchase_orders",
        "shipments",
      ]),
      ingestionSource: rand(["ERP", "WMS", "TMS", "EDI"]),
      status: isErr ? "FAILED" : "SUCCESS",
      errorMessage: isErr
        ? rand(["Data validation error", "Integration timeout", "Dataset not found"])
        : null,
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      eventType: action,
      zonalShiftId: shiftId,
      resourceIdentifier: resourceArn,
      awayFrom: az,
      status: shiftStatus,
      availabilityZoneStatus: azStatus,
      comment,
      expiryTime: new Date(new Date(ts).getTime() + randInt(3600, 86400) * 1000).toISOString(),
      routingControlArn: `arn:aws:route53-recovery-control::${acct.id}:controlpanel/${randId(32).toLowerCase()}/routingcontrol/${randId(32).toLowerCase()}`,
      routingControlState: isErr ? "Off" : rand(["On", "Off"]),
      statusCode: isErr ? "FAILED" : "SUCCESS",
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      eventType: action,
      applicationName: app,
      environmentName: env,
      configurationProfileName: profile,
      deploymentNumber: deploymentNum,
      deploymentStrategy,
      growthFactor,
      percentageComplete,
      state,
      startedAt: new Date(new Date(ts).getTime() - randInt(60, 3600) * 1000).toISOString(),
      completedAt: state === "COMPLETE" ? new Date(ts).toISOString() : null,
      status: isErr ? "FAILED" : "SUCCESS",
      timestamp: new Date(ts).toISOString(),
    }),
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
        recovery_instance_id: rand([null, null, `i-${randHexId(17)}`]),
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
    message: JSON.stringify({
      eventType: action,
      sourceServerId,
      sourceServerArn: `arn:aws:drs:${region}:${acct.id}:source-server/${sourceServerId}`,
      sourceHostname,
      replicationStatus,
      lagDurationSeconds: lagDuration,
      recoveryPointObjectiveSeconds: rpoSeconds,
      dataReplicationState: rand(["Continuous", "InProgress", "Paused", "Disconnected"]),
      recoveryInstanceId: rand([null, null, `i-${randHexId(17)}`]),
      stagingAreaSubnet: rand(["us-east-1", "us-west-2", "eu-west-1"]),
      status: isErr ? "FAILED" : "SUCCESS",
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      eventType: action,
      licenseConfigurationName: licenseConfig,
      licenseConfigurationArn: `arn:aws:license-manager:${region}:${acct.id}:license-configuration:${randId(36)}`,
      resourceType,
      consumedLicenses,
      licenseCount: licensedCount,
      utilizationPercentage,
      ruleType: rand(["vCPU", "Sockets", "Cores", "Instances"]),
      status,
      timestamp: new Date(ts).toISOString(),
    }),
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
    message: JSON.stringify({
      eventType: action,
      channelConfigurationName: channelConfig,
      channelType,
      notificationType,
      workspaceId: `T${randId(8).toUpperCase()}`,
      channelId: `C${randId(8).toUpperCase()}`,
      deliveryStatus,
      messageId: randUUID(),
      snsTopicArn: `arn:aws:sns:${region}:${acct.id}:${notificationType.toLowerCase()}-topic`,
      status: isErr ? "FAILED" : "SUCCESS",
      timestamp: new Date(ts).toISOString(),
    }),
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
        page_url: `https://${appMonitor}.${randEmailDomain()}${rand(pages)}`,
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
    message: JSON.stringify({
      event_type: evType,
      application_id: randId(36).toLowerCase(),
      application_name: appMonitor,
      application_version: "1.0.0",
      page_id: rand(pages),
      session_id: randId(32).toLowerCase(),
      browser: rand(browsers),
      os: rand(["Windows 11", "macOS 14", "iOS 17", "Android 14"]),
      device_type: rand(["desktop", "mobile", "tablet"]),
      country: rand(["US", "GB", "DE", "JP", "IN", "BR"]),
      ...(evType.includes("navigation") ? { web_vitals: webVitals } : {}),
      ...(evType.includes("js_error")
        ? { error_message: rand(jsErrors), error_type: "js_error" }
        : {}),
      ...(evType.includes("http_event")
        ? { http_status: isErr ? rand([500, 502, 503]) : 200, http_method: rand(["GET", "POST"]) }
        : {}),
      timestamp: new Date(ts).toISOString(),
    }),
  };
}

export {
  generateCloudFormationLog,
  generateSsmLog,
  generateCloudWatchAlarmsLog,
  generateHealthLog,
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
