/**
 * Dimensional metric generators for AWS security and management services:
 * Shield, KMS, Cognito, GuardDuty, Macie, Inspector, Config, CloudTrail,
 * CloudWatch, StepFunctions, SSM, CloudFormation, CodeBuild, CodePipeline,
 * CodeDeploy, Amplify, AutoScaling, Route53, and more.
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
  sample,
} from "./helpers.js";

// ─── Shield ───────────────────────────────────────────────────────────────────

export function generateShieldMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "shield",
      "aws.shield",
      region,
      account,
      {
        ResourceArn: `arn:aws:elasticloadbalancing:${region}:${account.id}:loadbalancer/app/prod-alb/abc123`,
      },
      {
        DDoSAttackBitsPerSecond: stat(
          Math.random() < er ? dp(jitter(10_000_000, 8_000_000, 1_000, 1_000_000_000)) : 0
        ),
        DDoSAttackPacketsPerSecond: stat(
          Math.random() < er ? dp(jitter(50_000, 40_000, 1_000, 10_000_000)) : 0
        ),
        DDoSAttackRequestsPerSecond: stat(
          Math.random() < er ? dp(jitter(10_000, 8_000, 100, 1_000_000)) : 0
        ),
        VolumePacketsPerSecond: stat(
          Math.random() < er
            ? dp(jitter(80_000, 60_000, 1_000, 20_000_000))
            : dp(jitter(500, 200, 0, 50_000))
        ),
        DDoSDetected: stat(Math.random() < er ? 1 : 0),
      }
    ),
  ];
}

// ─── KMS ──────────────────────────────────────────────────────────────────────

const KMS_KEY_IDS = [
  "mrk-aabbccddeeff0011",
  "mrk-1122334455aabbcc",
  "key-99887766aabbccdd",
  "key-aabbccddeeff1122",
];

export function generateKmsMetrics(ts: string, _er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(KMS_KEY_IDS, randInt(1, 3)).map((keyId) => {
    const encryptN = randInt(0, 10_000);
    const decryptN = randInt(0, 50_000);
    const gdkN = randInt(0, 20_000);
    const reEncN = randInt(0, 8_000);
    const signN = randInt(0, 5_000);
    const verifyN = randInt(0, 5_000);
    const imported = Math.random() < 0.2;
    return metricDoc(
      ts,
      "kms",
      "aws.kms",
      region,
      account,
      { KeyId: keyId },
      {
        SecretsManagerSecretCount: undefined,
        Encrypt: counter(encryptN),
        Decrypt: counter(decryptN),
        GenerateDataKey: counter(gdkN),
        Sign: counter(signN),
        Verify: counter(verifyN),
        KeyRotation: counter(0),
        SecondsUntilKeyMaterialExpiration: imported ? stat(randInt(86400, 365 * 86400)) : stat(0),
        EncryptRequests: counter(encryptN),
        DecryptRequests: counter(decryptN),
        GenerateDataKeyRequests: counter(gdkN),
        ReEncryptRequests: counter(reEncN),
        SignRequests: counter(signN),
        VerifyRequests: counter(verifyN),
      }
    );
  });
}

// ─── Cognito ──────────────────────────────────────────────────────────────────

const COGNITO_POOLS = ["us-pool-prod", "eu-pool-prod", "mobile-user-pool", "b2b-pool"];

export function generateCognitoMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(COGNITO_POOLS, randInt(1, 2)).map((pool) => {
    const signIns = randInt(0, 50_000);
    const signUps = randInt(0, 5_000);
    return metricDoc(
      ts,
      "cognito",
      "aws.cognito",
      region,
      account,
      { UserPool: pool },
      {
        SignInSuccesses: counter(Math.round(signIns * jitter(0.95, 0.04, 0.7, 1))),
        SignInThrottles: counter(Math.random() < er ? randInt(1, 500) : 0),
        SignInUserErrors: counter(
          Math.round(
            signIns *
              (Math.random() < er
                ? jitter(0.08, 0.06, 0.005, 0.3)
                : jitter(0.02, 0.015, 0.001, 0.05))
          )
        ),
        SignUpSuccesses: counter(signUps),
        SignUpThrottles: counter(Math.random() < er ? randInt(0, 200) : 0),
        TokenRefreshSuccesses: counter(randInt(0, 100_000)),
        TokenRefreshUserErrors: counter(Math.random() < er ? randInt(1, 500) : 0),
        FederationSuccesses: counter(randInt(0, 10_000)),
        FederationThrottles: counter(Math.random() < er ? randInt(0, 120) : 0),
        AccountTakeoverRisk: counter(Math.random() < er * 0.25 ? randInt(0, 40) : 0),
        AccountTakeoverRiskCount: counter(Math.random() < er * 0.3 ? randInt(0, 50) : 0),
        CompromisedCredentialRisk: counter(Math.random() < er * 0.2 ? randInt(0, 35) : 0),
      }
    );
  });
}

// ─── GuardDuty ────────────────────────────────────────────────────────────────

export function generateGuarddutyMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const detectorId = `abc123def456ghi789jkl012`;
  const severities = ["HIGH", "MEDIUM", "LOW", "INFO"] as const;
  const bySev = severities.map((sev) => {
    const n =
      sev === "HIGH"
        ? Math.random() < er
          ? randInt(0, 25)
          : randInt(0, 5)
        : sev === "MEDIUM"
          ? randInt(0, 80)
          : sev === "LOW"
            ? randInt(0, 200)
            : randInt(0, 50);
    return metricDoc(
      ts,
      "guardduty",
      "aws.guardduty",
      region,
      account,
      { DetectorId: detectorId, Severity: sev },
      { FindingsCount: counter(n) }
    );
  });
  const detectorWide = metricDoc(
    ts,
    "guardduty",
    "aws.guardduty",
    region,
    account,
    { DetectorId: detectorId },
    {
      APICallsAnalyzed: counter(randInt(1_000_000, 500_000_000)),
      EventsAnalyzed: counter(randInt(5_000_000, 2_000_000_000)),
      VPCFlowLogsAnalyzed: counter(randInt(0, 50_000_000_000)),
      DNSRequestsAnalyzed: counter(randInt(0, 80_000_000_000)),
      S3LogsAnalyzed: counter(randInt(0, 20_000_000_000)),
      EKSAuditLogsAnalyzed: counter(randInt(0, 5_000_000_000)),
      HighSeverityFindingsCount: counter(Math.random() < er ? randInt(0, 20) : 0),
      MediumSeverityFindingsCount: counter(randInt(0, 100)),
      LowSeverityFindingsCount: counter(randInt(0, 300)),
      ArchivedFindingsCount: counter(randInt(0, 200)),
    }
  );
  return [...bySev, detectorWide];
}

// ─── CloudWatch ───────────────────────────────────────────────────────────────

const CW_NAMESPACES = [
  "AWS/Lambda",
  "AWS/EC2",
  "AWS/RDS",
  "AWS/DynamoDB",
  "AWS/SQS",
  "AWS/Kinesis",
  "Custom/App",
];

export function generateCloudwatchMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const nsDocs = sample(CW_NAMESPACES, randInt(2, 4)).map((ns) => {
    const okAlarms = randInt(5, 500);
    const alarmAlarms = Math.random() < er ? randInt(1, 80) : randInt(0, 25);
    const insufAlarms = randInt(0, 40);
    return metricDoc(
      ts,
      "cloudwatch",
      "aws.cloudwatch_metrics",
      region,
      account,
      { Namespace: ns, Region: region },
      {
        CallCount: counter(randInt(1_000, 5_000_000)),
        ErrorCount: counter(Math.random() < er ? randInt(1, 10_000) : 0),
        ThrottleCount: counter(Math.random() < er ? randInt(1, 5_000) : 0),
        PutMetricData: counter(randInt(0, 1_000_000)),
        GetMetricStatistics: counter(randInt(0, 500_000)),
        ListMetrics: counter(randInt(0, 100_000)),
        PutMetricAlarm: counter(randInt(0, 1_000)),
        AlarmStateChange: counter(randInt(0, 100)),
        PutMetricDataRequests: counter(randInt(0, 2_000_000)),
        GetMetricDataRequests: counter(randInt(0, 800_000)),
        MetricDataPoints: counter(randInt(10_000, 50_000_000)),
        DashboardCount: counter(randInt(0, 500)),
        EstimatedCharges: stat(dp(jitter(120, 80, 0, 50_000))),
        NumberOfAlarmsInState_OK: counter(okAlarms),
        NumberOfAlarmsInState_ALARM: counter(alarmAlarms),
        NumberOfAlarmsInState_INSUFFICIENT_DATA: counter(insufAlarms),
      }
    );
  });
  const billingDoc = metricDoc(
    ts,
    "cloudwatch",
    "aws.cloudwatch_metrics",
    region,
    account,
    { Region: region, ServiceName: "AWS/Billing" },
    {
      EstimatedCharges: stat(dp(jitter(2_400, 400, 0, 25_000))),
      NumberOfAlarmsInState_OK: counter(randInt(0, 200)),
      NumberOfAlarmsInState_ALARM: counter(Math.random() < er ? randInt(1, 50) : randInt(0, 15)),
      NumberOfAlarmsInState_INSUFFICIENT_DATA: counter(randInt(0, 30)),
      DashboardCount: counter(randInt(0, 120)),
    }
  );
  return [...nsDocs, billingDoc];
}

// ─── Step Functions ───────────────────────────────────────────────────────────

const SF_MACHINES = [
  "order-fulfillment",
  "payment-processing",
  "data-pipeline",
  "etl-workflow",
  "user-onboarding",
  "notification-orchestrator",
  "approval-workflow",
];

export function generateStepfunctionsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(SF_MACHINES, randInt(1, 3)).map((machine) => {
    const started = randInt(0, 10_000);
    const failed = Math.round(
      started *
        (Math.random() < er ? jitter(0.05, 0.04, 0.001, 0.3) : jitter(0.005, 0.004, 0, 0.02))
    );
    const aborted = Math.round(
      started * (Math.random() < er * 0.3 ? jitter(0.02, 0.015, 0, 0.1) : 0)
    );
    const timedOut = Math.round(failed * jitter(0.15, 0.1, 0, 0.5));
    const succeeded = Math.max(0, started - failed - aborted - timedOut);
    return metricDoc(
      ts,
      "states",
      "aws.states",
      region,
      account,
      { StateMachineArn: `arn:aws:states:${region}:${account.id}:stateMachine:${machine}` },
      {
        ExecutionsStarted: counter(started),
        ExecutionsSucceeded: counter(succeeded),
        ExecutionsFailed: counter(failed),
        ExecutionsAborted: counter(aborted),
        ExecutionsTimedOut: counter(timedOut),
        ExecutionTime: stat(dp(jitter(5_000, 4_000, 100, 3_600_000))),
        ActivityRunTime: stat(dp(jitter(800, 600, 50, 120_000))),
        LambdaFunctionRunTime: stat(dp(jitter(120, 100, 10, 900_000))),
        ActivityScheduleTime: stat(dp(jitter(200, 150, 0, 86_400_000))),
        LambdaFunctionScheduleTime: stat(dp(jitter(50, 40, 0, 60_000))),
        ConsumedCapacity: stat(dp(jitter(0.4, 0.2, 0, 2))),
        ExecutionThrottled: counter(Math.random() < er * 0.2 ? randInt(1, 100) : 0),
      }
    );
  });
}

// ─── SSM ──────────────────────────────────────────────────────────────────────

export function generateSsmMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const compliant = randInt(500, 8_000);
  const nonCompliant = Math.random() < er ? randInt(1, 400) : randInt(0, 80);
  return [
    metricDoc(
      ts,
      "ssm",
      "aws.ssm",
      region,
      account,
      { Region: region },
      {
        CommandsDelivered: counter(randInt(0, 10_000)),
        CommandsInvoked: counter(randInt(0, 10_000)),
        CommandsFailed: counter(Math.random() < er ? randInt(0, 200) : 0),
        PatchCompliantCount: counter(randInt(100, 5_000)),
        PatchNonCompliantCount: counter(Math.random() < er ? randInt(1, 100) : 0),
        ParameterGetCount: counter(randInt(0, 500_000)),
        ParameterPutCount: counter(randInt(0, 10_000)),
        "ComplianceSummary.Compliant": counter(compliant),
        "ComplianceSummary.NonCompliant": counter(nonCompliant),
        PatchGroupCount: counter(randInt(1, 120)),
        ManagedInstanceCount: counter(randInt(10, 5_000)),
      }
    ),
  ];
}

// ─── CloudFormation ───────────────────────────────────────────────────────────

export function generateCloudformationMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "cloudformation",
      "aws.cloudformation",
      region,
      account,
      { Region: region },
      {
        StacksCreated: counter(randInt(0, 20)),
        StacksUpdated: counter(randInt(0, 50)),
        StacksDeleted: counter(randInt(0, 10)),
        StackCreationFailures: counter(Math.random() < er ? randInt(0, 5) : 0),
        StackUpdateFailures: counter(Math.random() < er ? randInt(0, 10) : 0),
        StackDriftCount: counter(Math.random() < er ? randInt(0, 20) : 0),
      }
    ),
  ];
}

// ─── CodeBuild ────────────────────────────────────────────────────────────────

const CODEBUILD_PROJECTS = [
  "api-service-build",
  "frontend-ci",
  "mobile-build",
  "docker-image-build",
  "terraform-validate",
];

export function generateCodebuildMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(CODEBUILD_PROJECTS, randInt(1, 3)).map((project) => {
    const builds = randInt(0, 200);
    const failed = Math.round(
      builds * (Math.random() < er ? jitter(0.15, 0.12, 0.01, 0.6) : jitter(0.05, 0.04, 0, 0.15))
    );
    const succeeded = builds - failed;
    const durationMs = dp(jitter(120_000, 95_000, 8_000, 3_600_000));
    const queuedMs = dp(jitter(8_000, 6_000, 0, 600_000));
    const downloadMs = dp(jitter(25_000, 18_000, 500, durationMs * 0.35));
    const preMs = dp(jitter(35_000, 28_000, 1_000, durationMs * 0.4));
    const postMs = dp(jitter(12_000, 9_000, 0, durationMs * 0.25));
    const uploadMs = dp(jitter(10_000, 7_000, 0, durationMs * 0.2));
    const cacheHitRatio =
      Math.random() < 0.3 ? stat(dp(jitter(0.52, 0.12, 0.08, 0.98))) : undefined;
    return metricDoc(
      ts,
      "codebuild",
      "aws.codebuild",
      region,
      account,
      { ProjectName: project },
      {
        Builds: counter(builds),
        SucceededBuilds: counter(succeeded),
        FailedBuilds: counter(failed),
        BuildSucceededCount: counter(succeeded),
        BuildFailedCount: counter(failed),
        Duration: stat(durationMs),
        BuildDuration: stat(durationMs),
        PostBuildDuration: stat(postMs),
        PreBuildDuration: stat(preMs),
        DownloadSourceDuration: stat(downloadMs),
        UploadArtifactsDuration: stat(uploadMs),
        QueuedDuration: stat(queuedMs),
        QueuedBuilds: counter(randInt(0, 20)),
        ...(cacheHitRatio !== undefined ? { CacheHitRatio: cacheHitRatio } : {}),
      }
    );
  });
}

// ─── CodePipeline ─────────────────────────────────────────────────────────────

const PIPELINES = [
  "api-deploy",
  "frontend-pipeline",
  "infra-pipeline",
  "mobile-pipeline",
  "ml-deploy",
];

export function generateCodepipelineMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(PIPELINES, randInt(1, 2)).map((pipeline) => {
    const execs = randInt(0, 50);
    const failed = Math.round(
      execs * (Math.random() < er ? jitter(0.2, 0.15, 0.01, 0.7) : jitter(0.05, 0.04, 0, 0.15))
    );
    const canceled = Math.round(
      execs *
        (Math.random() < er * 0.25 ? jitter(0.05, 0.04, 0, 0.2) : jitter(0.01, 0.008, 0, 0.05))
    );
    const succeeded = Math.max(0, execs - failed - canceled);
    const actionsPerExec = randInt(4, 12);
    const totalActions = Math.max(0, execs * actionsPerExec);
    const actionFail = Math.min(totalActions, Math.round(failed * randInt(2, 6)));
    const actionOk = Math.max(0, totalActions - actionFail);
    const stage = rand(["Source", "Build", "Deploy", "Test", "Approval"]);
    return metricDoc(
      ts,
      "codepipeline",
      "aws.codepipeline",
      region,
      account,
      { PipelineName: pipeline, Stage: stage },
      {
        PipelineExecutionAttempts: counter(execs),
        PipelineExecutionStarted: counter(execs),
        PipelineExecutionSucceeded: counter(succeeded),
        PipelineExecutionFailed: counter(failed),
        PipelineExecutionCanceled: counter(canceled),
        StageExecutionTime: stat(dp(jitter(95_000, 75_000, 2_000, 1_800_000))),
        ActionExecutionSucceeded: counter(actionOk),
        ActionExecutionFailed: counter(actionFail),
      }
    );
  });
}

// ─── CodeDeploy ───────────────────────────────────────────────────────────────

export function generateCodedeployMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const appName = rand(["web-app", "api-service", "worker-service", "mobile-backend"]);
  const deploys = randInt(0, 20);
  const failed = Math.round(
    deploys * (Math.random() < er ? jitter(0.2, 0.15, 0.01, 0.6) : jitter(0.05, 0.04, 0, 0.15))
  );
  const instTotal = randInt(6, 28);
  const instFailed =
    failed > 0 ? randInt(1, Math.min(8, Math.floor(instTotal * 0.4))) : randInt(0, 2);
  const instSucceeded =
    failed > 0
      ? randInt(0, Math.max(0, instTotal - instFailed - 2))
      : randInt(Math.ceil(instTotal * 0.85), instTotal);
  const inProg = failed > 0 ? randInt(0, 4) : randInt(0, 2);
  const pending = randInt(0, failed > 0 ? 5 : 3);
  const rollbacks = Math.round(failed * (Math.random() < 0.55 ? 1 : 0));
  return [
    metricDoc(
      ts,
      "codedeploy",
      "aws.codedeploy",
      region,
      account,
      { ApplicationName: appName, DeploymentGroupName: rand(["prod", "staging", "canary"]) },
      {
        DeploymentAttempts: counter(deploys),
        DeploymentSucceeded: counter(deploys - failed),
        DeploymentFailed: counter(failed),
        DeploymentDuration: stat(dp(jitter(300_000, 240_000, 15_000, 3_600_000))),
        InstancesSucceeded: counter(instSucceeded),
        InstancesFailed: counter(instFailed),
        InstancesInProgress: counter(inProg),
        InstancesPending: counter(pending),
        DeploymentRollbacks: counter(rollbacks),
      }
    ),
  ];
}

// ─── Amplify ──────────────────────────────────────────────────────────────────

export function generateAmplifyMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const req = randInt(0, 1_000_000);
  const builds = randInt(1, 400);
  const buildFail = Math.round(
    builds * (Math.random() < er ? jitter(0.12, 0.09, 0.01, 0.45) : jitter(0.04, 0.03, 0, 0.12))
  );
  const buildOk = Math.max(0, builds - buildFail);
  const successRate = dp((buildOk / Math.max(1, builds)) * 100);
  const bytesDl = randInt(0, 80_000_000_000);
  return [
    metricDoc(
      ts,
      "amplify",
      "aws.amplify",
      region,
      account,
      { App: rand(["my-app", "frontend", "dashboard", "mobile-web"]) },
      {
        Requests: counter(req),
        BytesServed: counter(randInt(0, 100_000_000_000)),
        BytesDownloaded: counter(bytesDl),
        "4xxErrors": counter(randInt(0, Math.round(req * 0.02))),
        "5xxErrors": counter(Math.random() < er ? randInt(0, Math.round(req * 0.05)) : 0),
        Latency: stat(dp(jitter(50, 40, 5, 5_000))),
        BuildDuration: stat(dp(jitter(95_000, 75_000, 5_000, 2_400_000))),
        BuildSuccessRate: stat(successRate),
      }
    ),
  ];
}

// ─── AutoScaling ──────────────────────────────────────────────────────────────

const ASG_NAMES = ["web-asg", "api-asg", "worker-asg", "batch-asg", "ml-asg"];

export function generateAutoscalingMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(ASG_NAMES, randInt(1, 3)).map((asg) => {
    const desired = randInt(2, 30);
    const inSvc = Math.max(0, desired - (Math.random() < er ? randInt(1, 3) : 0));
    return metricDoc(
      ts,
      "autoscaling",
      "aws.autoscaling",
      region,
      account,
      { AutoScalingGroupName: asg },
      {
        GroupDesiredCapacity: stat(desired),
        GroupInServiceCapacity: stat(inSvc),
        GroupPendingCapacity: stat(Math.max(0, desired - inSvc)),
        GroupTerminatingCapacity: stat(Math.random() < 0.1 ? randInt(1, 3) : 0),
        GroupTotalCapacity: stat(inSvc),
        WarmPoolMinSize: stat(0),
        WarmPoolDesiredCapacity: stat(0),
        GroupAndWarmPoolDesiredCapacity: stat(desired),
        GroupAndWarmPoolTotalCapacity: stat(inSvc),
      }
    );
  });
}

// ─── Route 53 ─────────────────────────────────────────────────────────────────

const HOSTED_ZONES = ["example.com", "api.example.com", "internal.corp", "my-app.io"];

export function generateRoute53Metrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(HOSTED_ZONES, randInt(1, 3)).map((_zone) => {
    return metricDoc(
      ts,
      "route53",
      "aws.route53",
      region,
      account,
      { HostedZoneId: `Z${randInt(10000000, 99999999)}`, Region: "Global" },
      {
        DNSQueries: counter(randInt(100, 50_000_000)),
        ChildHealthCheckHealthyCount: stat(randInt(1, 10)),
        HealthCheckPercentageHealthy: stat(
          dp(Math.random() < er ? jitter(70, 20, 0, 95) : jitter(100, 0, 95, 100))
        ),
        HealthCheckStatus: stat(Math.random() < er ? 0 : 1),
        ConnectionTime: stat(dp(jitter(25, 15, 2, 500)), {
          max: dp(jitter(900, 300, 50, 5000)),
          min: dp(jitter(1.5, 0.8, 0.2, 80)),
        }),
        SSLHandshakeTime: stat(dp(jitter(18, 10, 1, 400)), {
          max: dp(jitter(600, 200, 30, 4000)),
          min: dp(jitter(1, 0.5, 0.1, 60)),
        }),
        TimeToFirstByte: stat(dp(jitter(40, 25, 3, 800)), {
          max: dp(jitter(1200, 400, 50, 8000)),
          min: dp(jitter(2, 1, 0.3, 120)),
        }),
      }
    );
  });
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export function generateBillingMetrics(ts: string, _er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "billing",
      "aws.billing",
      region,
      account,
      {
        ServiceName: rand([
          "Amazon EC2",
          "AWS Lambda",
          "Amazon S3",
          "Amazon RDS",
          "Amazon DynamoDB",
          "AWS CloudFront",
        ]),
        LinkedAccount: account.id,
        Currency: "USD",
      },
      {
        EstimatedCharges: stat(dp(jitter(500, 400, 1, 50_000))),
      }
    ),
  ];
}

// ─── Health ───────────────────────────────────────────────────────────────────

export function generateHealthMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "awshealth",
      "aws.awshealth",
      region,
      account,
      { Region: region, Service: rand(["EC2", "Lambda", "RDS", "S3", "DynamoDB"]) },
      {
        OpenIssueCount: counter(Math.random() < er ? randInt(1, 5) : 0),
        RecentlyClosedIssueCount: counter(randInt(0, 3)),
        ScheduledChangeCount: counter(randInt(0, 5)),
      }
    ),
  ];
}

// ─── Security-adjacent: Inspector, Macie, Config, AccessAnalyzer ──────────────

export function generateInspectorMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "inspector",
      "aws.inspector",
      region,
      account,
      { Region: region },
      {
        TotalFindings: counter(randInt(0, 5_000)),
        CriticalFindings: counter(Math.random() < er ? randInt(0, 100) : 0),
        HighFindings: counter(randInt(0, 500)),
        MediumFindings: counter(randInt(0, 2_000)),
        LowFindings: counter(randInt(0, 3_000)),
        AccountsScanned: counter(randInt(1, 200)),
        ECRImagesScanComplete: counter(randInt(0, 50_000)),
        "Lambda.FunctionsScanComplete": counter(randInt(0, 20_000)),
        AutoRemediationSucceeded: counter(randInt(0, 100)),
        AutoRemediationFailed: counter(Math.random() < er ? randInt(0, 10) : 0),
      }
    ),
  ];
}

export function generateMacieMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "macie",
      "aws.macie",
      region,
      account,
      { Region: region },
      {
        FindingsCount: counter(Math.random() < er ? randInt(0, 100) : 0),
        PolicyFindingsCount: counter(Math.random() < er ? randInt(0, 50) : 0),
        SensitiveDataFindingsCount: counter(Math.random() < er ? randInt(0, 30) : 0),
        SensitiveDataDiscoveryJobsCompleted: counter(randInt(0, 500)),
        SensitiveDataDiscoveryJobsFailed: counter(Math.random() < er ? randInt(0, 15) : 0),
        ObjectsScanned: counter(randInt(10_000, 500_000_000)),
        BytesScanned: counter(randInt(1_000_000_000, 200_000_000_000_000)),
        SensitiveDataOccurrences: counter(
          Math.random() < er ? randInt(1, 500_000) : randInt(0, 5_000)
        ),
        ObjectsClassified: counter(randInt(0, 10_000_000)),
        DataClassifiedInBytes: counter(randInt(0, 1_000_000_000_000)),
      }
    ),
  ];
}

export function generateConfigMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const compliant = randInt(50, 200);
  const nonCompliant = Math.random() < er ? randInt(0, 30) : randInt(0, 8);
  const activeRules = compliant + nonCompliant + randInt(0, 20);
  const pct = dp((compliant / Math.max(1, activeRules)) * 100);
  return [
    metricDoc(
      ts,
      "config",
      "aws.config",
      region,
      account,
      { Region: region },
      {
        CompliantRulesCount: counter(compliant),
        NonCompliantRulesCount: counter(nonCompliant),
        CompliancePercentage: stat(pct),
        NonCompliantRules: counter(nonCompliant),
        ActiveConfigRules: counter(activeRules),
        ResourcesEvaluated: counter(randInt(5_000, 500_000)),
        RemediationsExecuted: counter(randInt(0, 100)),
        RemediationsFailed: counter(Math.random() < er ? randInt(0, 10) : 0),
      }
    ),
  ];
}

export function generateAccessanalyzerMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "accessanalyzer",
      "aws.accessanalyzer",
      region,
      account,
      { AnalyzerName: rand(["account-analyzer", "org-analyzer", "unused-access-analyzer"]) },
      {
        ActiveFindingsCount: counter(Math.random() < er ? randInt(1, 200) : randInt(0, 50)),
        ArchivedFindingsCount: counter(randInt(0, 100)),
        ResolvedFindingsCount: counter(randInt(0, 500)),
      }
    ),
  ];
}

// ─── IoT Core ─────────────────────────────────────────────────────────────────

export function generateIotcoreMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "iot",
      "aws.iot",
      region,
      account,
      { Protocol: rand(["MQTT", "HTTPS", "WSS"]) },
      {
        RulesExecuted: counter(randInt(0, 500_000)),
        RuleMessageThrottled: counter(Math.random() < er ? randInt(1, 5_000) : 0),
        TopicMatch: counter(randInt(0, 2_000_000)),
        "Connect.Success": counter(randInt(0, 50_000)),
        "Connect.AuthError": counter(Math.random() < er ? randInt(1, 2_000) : randInt(0, 200)),
        "Subscribe.Success": counter(randInt(0, 100_000)),
        "Publish.Success": counter(randInt(0, 800_000)),
        "PublishIn.Success": counter(randInt(0, 1_000_000)),
        "PublishOut.Success": counter(randInt(0, 1_000_000)),
        "MessageBroker.IncomingMessages": counter(randInt(0, 5_000_000)),
        "MessageBroker.OutgoingMessages": counter(randInt(0, 5_000_000)),
        "DeviceShadow.Get.Accepted": counter(randInt(0, 200_000)),
        "DeviceShadow.Update.Accepted": counter(randInt(0, 400_000)),
        PublishIn_Throttle: counter(Math.random() < er ? randInt(1, 10_000) : 0),
        Disconnect: counter(randInt(0, 50_000)),
      }
    ),
  ];
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

export function generateWorkspacesMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "workspaces",
      "aws.workspaces",
      region,
      account,
      { DirectoryId: `d-${randInt(1000000000, 9999999999)}` },
      {
        Available: counter(randInt(0, 500)),
        Unhealthy: counter(Math.random() < er ? randInt(0, 20) : 0),
        ConnectionAttempt: counter(randInt(0, 10_000)),
        ConnectionSuccess: counter(randInt(0, 10_000)),
        ConnectionFailure: counter(Math.random() < er ? randInt(0, 500) : 0),
        SessionDisconnect: counter(randInt(0, 1_000)),
        SessionLaunchTime: stat(dp(jitter(10, 8, 2, 120))),
        InSessionLatency: stat(dp(jitter(30, 25, 5, 500))),
      }
    ),
  ];
}

// ─── Connect ──────────────────────────────────────────────────────────────────

export function generateConnectMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "connect",
      "aws.connect",
      region,
      account,
      { InstanceId: `arn:aws:connect:${region}:${account.id}:instance/abc123` },
      {
        CallsPerInterval: counter(randInt(0, 5_000)),
        MissedCallsPerInterval: counter(Math.random() < er ? randInt(0, 500) : 0),
        CallRecordingUploadError: counter(Math.random() < er ? randInt(0, 20) : 0),
        ConcurrentActiveCalls: counter(randInt(0, 200)),
        ContactsQueued: counter(randInt(0, 100)),
        LongestQueuedWaitTime: stat(dp(jitter(30, 25, 5, 600))),
        QueueSize: counter(randInt(0, 50)),
      }
    ),
  ];
}

// ─── GameLift ─────────────────────────────────────────────────────────────────

export function generateGameliftMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "gamelift",
      "aws.gamelift",
      region,
      account,
      { FleetId: `fleet-${randInt(10000000, 99999999)}`, MetricGroups: "default" },
      {
        ActiveInstances: counter(randInt(1, 100)),
        DesiredInstances: counter(randInt(1, 100)),
        IdleInstances: counter(randInt(0, 20)),
        PercentIdleInstances: stat(dp(jitter(10, 8, 0, 50))),
        InstanceInterruptions: counter(Math.random() < er ? randInt(0, 5) : 0),
        ActiveServerProcesses: counter(randInt(1, 500)),
        ActiveGameSessions: counter(randInt(0, 400)),
        CurrentPlayerSessions: counter(randInt(0, 4_000)),
        AvailableGameSessions: counter(randInt(0, 100)),
        AvailablePlayerSessions: counter(randInt(0, 2_000)),
        AverageWaitTime: stat(dp(jitter(15, 12, 0, 300))),
      }
    ),
  ];
}

// ─── SecretsManger ────────────────────────────────────────────────────────────

export function generateSecretsmanagerMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "secretsmanager",
      "aws.secretsmanager",
      region,
      account,
      { Region: region },
      {
        GetSecretValue: counter(randInt(0, 500_000)),
        PutSecretValue: counter(randInt(0, 10_000)),
        RotationSucceeded: counter(randInt(0, 100)),
        RotationFailed: counter(Math.random() < er ? randInt(0, 5) : 0),
        AccessDenied: counter(Math.random() < er * 0.5 ? randInt(0, 100) : 0),
      }
    ),
  ];
}

// ─── ACM ──────────────────────────────────────────────────────────────────────

export function generateAcmMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "acm",
      "aws.acm",
      region,
      account,
      { Region: region },
      {
        IssuedCertificates: counter(randInt(10, 500)),
        ExpiredCertificates: counter(Math.random() < er ? randInt(0, 5) : 0),
        DaysToExpiry: stat(randInt(1, 395)),
        PendingValidation: counter(randInt(0, 10)),
        Revoked: counter(Math.random() < er ? randInt(0, 3) : 0),
      }
    ),
  ];
}

// ─── CloudTrail ───────────────────────────────────────────────────────────────

export function generateCloudtrailMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const eventsLogged = randInt(50_000, 20_000_000);
  const eventsThrottled = Math.random() < er ? randInt(1, 50_000) : randInt(0, 500);
  const deliveryErrors = Math.random() < er ? randInt(0, 500) : randInt(0, 20);
  const mgmtMatched = Math.round(eventsLogged * jitter(0.72, 0.12, 0.35, 0.95));
  const dataMatched = Math.max(
    0,
    eventsLogged - mgmtMatched - randInt(0, Math.round(eventsLogged * 0.05))
  );
  return [
    metricDoc(
      ts,
      "cloudtrail",
      "aws.cloudtrail",
      region,
      account,
      { TrailName: rand(["management-events", "data-events", "global-trail"]) },
      {
        DeliveredLogFiles: counter(randInt(0, 1_000)),
        LogFileDeliveryErrors: counter(deliveryErrors),
        DeliveryErrors: counter(deliveryErrors),
        APICallCount: counter(randInt(0, 10_000_000)),
        ErrorAPICallCount: counter(Math.random() < er ? randInt(0, 100_000) : 0),
        EventsLogged: counter(eventsLogged),
        EventsThrottled: counter(eventsThrottled),
        EventSize: stat(dp(jitter(1_200, 400, 120, 65_536))),
        InsightEventsAnalyzed: counter(
          Math.random() < er * 0.4 ? randInt(100, 500_000) : randInt(0, 50_000)
        ),
        ManagementEventsMatched: counter(mgmtMatched),
        DataEventsMatched: counter(dataMatched),
      }
    ),
  ];
}

// ─── Additional management / observability ────────────────────────────────────

export function generateAppsyncMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const req = randInt(0, 500_000);
  return [
    metricDoc(
      ts,
      "appsync",
      "aws.appsync",
      region,
      account,
      { GraphQLAPIId: `aaaabbbbccccdddd${randInt(1000, 9999)}` },
      {
        Latency: stat(dp(jitter(50, 40, 5, 5_000))),
        "4XXError": counter(randInt(0, Math.round(req * 0.01))),
        "5XXError": counter(Math.random() < er ? randInt(0, Math.round(req * 0.03)) : 0),
        ConnectSuccess: counter(randInt(0, 10_000)),
        ConnectClientError: counter(Math.random() < er ? randInt(0, 500) : 0),
      }
    ),
  ];
}

export function generateTrustedadvisorMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "trustedadvisor",
      "aws.trustedadvisor",
      region,
      account,
      { AwsAccountId: account.id },
      {
        ErrorCount: counter(Math.random() < er ? randInt(0, 50) : 0),
        WarningCount: counter(randInt(0, 200)),
        OkCount: counter(randInt(50, 500)),
        NotAvailableCount: counter(randInt(0, 20)),
      }
    ),
  ];
}

export function generateImagebuilderMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "imagebuilder",
      "aws.imagebuilder",
      region,
      account,
      { PipelineName: rand(["amazon-linux-pipeline", "ubuntu-pipeline", "windows-pipeline"]) },
      {
        ImageBuildsStarted: counter(randInt(0, 10)),
        ImageBuildsSucceeded: counter(randInt(0, 10)),
        ImageBuildsFailed: counter(Math.random() < er ? randInt(0, 3) : 0),
      }
    ),
  ];
}

export function generateDevopsgouruMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "devopsguru",
      "aws.devopsguru",
      region,
      account,
      { Region: region },
      {
        ProactiveInsights: counter(randInt(0, 20)),
        ReactiveInsights: counter(Math.random() < er ? randInt(0, 10) : 0),
        MeanTimeToRecover: stat(dp(jitter(30, 25, 1, 240))),
        OpenProactiveInsights: counter(randInt(0, 10)),
        OpenReactiveInsights: counter(Math.random() < er ? randInt(0, 5) : 0),
      }
    ),
  ];
}

export function generatePinpointMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "pinpoint",
      "aws.pinpoint",
      region,
      account,
      { ApplicationId: randInt(10000000, 99999999).toString(16) },
      {
        DirectMessageSuccessful: counter(randInt(0, 100_000)),
        DirectMessagePermanentFailure: counter(Math.random() < er ? randInt(0, 1_000) : 0),
        DirectMessageTemporaryFailure: counter(Math.random() < er ? randInt(0, 500) : 0),
        CampaignSendAttempts: counter(randInt(0, 50)),
        UniqueEndpointsDeliveredTo: counter(randInt(0, 1_000_000)),
      }
    ),
  ];
}

export function generateTransferfamilyMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "transfer",
      "aws.transfer",
      region,
      account,
      { ServerId: `s-${randInt(100000000, 999999999)}`, Protocol: rand(["SFTP", "FTPS", "FTP"]) },
      {
        FilesIn: counter(randInt(0, 10_000)),
        FilesOut: counter(randInt(0, 5_000)),
        BytesIn: counter(randInt(0, 100_000_000_000)),
        BytesOut: counter(randInt(0, 50_000_000_000)),
        LoginAttempts: counter(randInt(0, 1_000)),
        LoginSuccesses: counter(randInt(0, 1_000)),
        LoginFailures: counter(Math.random() < er ? randInt(0, 100) : 0),
      }
    ),
  ];
}

export function generateLightsailMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "lightsail",
      "aws.lightsail",
      region,
      account,
      { InstanceName: rand(["web-server", "wordpress", "api-server", "dev-box"]) },
      {
        CPUUtilization: stat(
          dp(Math.random() < er ? jitter(75, 15, 50, 100) : jitter(25, 20, 1, 70))
        ),
        NetworkIn: counter(randInt(1_000, 5_000_000_000)),
        NetworkOut: counter(randInt(1_000, 2_000_000_000)),
        StatusCheckFailed: counter(Math.random() < er ? 1 : 0),
        StatusCheckFailed_Instance: counter(Math.random() < er ? 1 : 0),
      }
    ),
  ];
}

export function generateRamMetrics(ts: string, _er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "ram",
      "aws.ram",
      region,
      account,
      { Region: region },
      {
        ResourceShareCount: counter(randInt(0, 50)),
        ResourceAssociationCount: counter(randInt(0, 200)),
        InvitationCount: counter(randInt(0, 10)),
      }
    ),
  ];
}

export function generateDmsMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "dms",
      "aws.dms",
      region,
      account,
      {
        ReplicationTaskIdentifier: rand([
          "oracle-to-postgres",
          "mysql-migration",
          "sqlserver-to-aurora",
        ]),
      },
      {
        CDCIncomingChanges: counter(randInt(0, 100_000)),
        CDCChangesMemorySource: counter(randInt(0, 50_000)),
        CDCThroughputBandwidthSource: stat(dp(jitter(5_000_000, 4_000_000, 100_000, 100_000_000))),
        CDCLatencySource: stat(
          dp(Math.random() < er ? jitter(60, 50, 1, 3_600) : jitter(5, 4, 0, 30))
        ),
        CDCLatencyTarget: stat(
          dp(Math.random() < er ? jitter(120, 100, 1, 7_200) : jitter(10, 8, 0, 60))
        ),
        FullLoadThroughputBandwidthSource: stat(
          dp(jitter(10_000_000, 8_000_000, 1_000_000, 500_000_000))
        ),
        FullLoadThroughputRowsSource: stat(dp(jitter(10_000, 8_000, 100, 1_000_000))),
        MemoryUsage: stat(dp(jitter(512, 256, 64, 4_096))),
      }
    ),
  ];
}

// ─── Codecommit ───────────────────────────────────────────────────────────────

export function generateCodecommitMetrics(ts: string, _er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "codecommit",
      "aws.codecommit",
      region,
      account,
      {
        RepositoryName: rand([
          "api-service",
          "frontend",
          "infrastructure",
          "mobile-app",
          "ml-models",
        ]),
      },
      {
        RepositoryPushCount: counter(randInt(0, 100)),
        RepositoryPullCount: counter(randInt(0, 500)),
        GetBlobCount: counter(randInt(0, 10_000)),
        GetDifferencesCount: counter(randInt(0, 1_000)),
        GetCommitCount: counter(randInt(0, 50_000)),
        CreateCommitCount: counter(randInt(0, 8_000)),
        NumberOfRepositories: counter(randInt(1, 50)),
        GitRequestLatency: stat(dp(jitter(45, 35, 5, 2_400))),
        SuccessfulGitPull: counter(randInt(0, 2_000)),
        SuccessfulGitPush: counter(randInt(0, 800)),
        FailedGitPull: counter(randInt(0, 25)),
        FailedGitPush: counter(randInt(0, 15)),
        PullRequestCreatedCount: counter(randInt(0, 120)),
        PullRequestMergedCount: counter(randInt(0, 200)),
      }
    ),
  ];
}

export function generateCodeartifactMetrics(ts: string, _er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "codeartifact",
      "aws.codeartifact",
      region,
      account,
      {
        Domain: rand(["mycompany", "artifacts", "packages"]),
        Repository: rand(["npm-store", "maven-central", "pypi-store"]),
      },
      {
        PackageDownloadCount: counter(randInt(0, 100_000)),
        PackagePublishCount: counter(randInt(0, 1_000)),
        RequestCount: counter(randInt(0, 500_000)),
        UpstreamRequestCount: counter(randInt(0, 50_000)),
        AssetSize: stat(dp(jitter(2_400_000, 1_800_000, 12_000, 180_000_000))),
        PackageVersionDownloaded: counter(randInt(0, 250_000)),
        ThrottledRequestCount: counter(randInt(0, 1_200)),
      }
    ),
  ];
}

// ─── Security Hub ─────────────────────────────────────────────────────────────

const SH_STANDARDS = [
  "aws-foundational-security-best-practices",
  "cis-aws-foundations-benchmark",
  "pci-dss",
  "nist-800-53",
];

export function generateSecurityhubMetrics(ts: string, er: number) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const standard = rand(SH_STANDARDS);
  const isFailing = Math.random() < er;
  const passed = randInt(10, 150);
  const failed = isFailing ? randInt(5, 50) : randInt(0, 5);
  return [
    metricDoc(
      ts,
      "securityhub",
      "aws.securityhub",
      region,
      account,
      { ComplianceStandard: standard },
      {
        Findings: counter(randInt(isFailing ? 20 : 1, isFailing ? 500 : 50)),
        FindingsBySeverityCritical: counter(isFailing ? randInt(1, 30) : 0),
        FindingsBySeverityHigh: counter(randInt(0, isFailing ? 80 : 10)),
        FindingsBySeverityMedium: counter(randInt(0, isFailing ? 200 : 40)),
        FindingsBySeverityLow: counter(randInt(0, 100)),
        StandardsSubscriptionCount: counter(randInt(1, 12)),
        SecurityControlsPassedCount: counter(passed),
        SecurityControlsFailedCount: counter(failed),
        SecurityScore: stat(dp(jitter(isFailing ? 55 : 82, 15, 0, 100))),
        FindingsImported: counter(randInt(0, isFailing ? 2_000 : 200)),
        FindingsUpdated: counter(randInt(0, 5_000)),
        ControlsFailed: counter(failed),
        ControlsPassed: counter(passed),
      }
    ),
  ];
}
