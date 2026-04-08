/**
 * Dimensional metric generators for AWS security and management services:
 * WAF, Shield, KMS, Cognito, GuardDuty, Macie, Inspector, Config, CloudTrail,
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

// ─── WAF / WAFv2 ──────────────────────────────────────────────────────────────

const WAF_ACLS = ["prod-waf", "api-waf", "staging-waf", "global-waf"];

export function generateWafMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const waf = rand(WAF_ACLS);
  const rule = rand([
    "RateLimitRule",
    "SQLiRule",
    "XSSRule",
    "GeoBlockRule",
    "BadBotsRule",
    "IPBlocklist",
  ]);
  const req = randInt(1_000, 5_000_000);
  const blocked = Math.round(
    req * (Math.random() < er ? jitter(0.1, 0.08, 0.01, 0.5) : jitter(0.02, 0.015, 0.001, 0.1))
  );
  return [
    metricDoc(
      ts,
      "waf",
      "aws.waf",
      region,
      account,
      { WebACL: waf, Rule: rule, Region: region },
      {
        AllowedRequests: counter(req - blocked),
        BlockedRequests: counter(blocked),
        CountedRequests: counter(randInt(0, Math.round(req * 0.05))),
        PassedRequests: counter(req - blocked),
        RequestWithNoRuleActionMatched: counter(randInt(0, 10_000)),
      }
    ),
  ];
}

export const generateWafv2Metrics = generateWafMetrics;

// ─── Shield ───────────────────────────────────────────────────────────────────

export function generateShieldMetrics(ts, er) {
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

export function generateKmsMetrics(ts, _er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(KMS_KEY_IDS, randInt(1, 3)).map((keyId) => {
    return metricDoc(
      ts,
      "kms",
      "aws.kms",
      region,
      account,
      { KeyId: keyId },
      {
        SecretsManagerSecretCount: undefined,
        Encrypt: counter(randInt(0, 10_000)),
        Decrypt: counter(randInt(0, 50_000)),
        GenerateDataKey: counter(randInt(0, 20_000)),
        Sign: counter(randInt(0, 5_000)),
        Verify: counter(randInt(0, 5_000)),
        KeyRotation: counter(0),
      }
    );
  });
}

// ─── Cognito ──────────────────────────────────────────────────────────────────

const COGNITO_POOLS = ["us-pool-prod", "eu-pool-prod", "mobile-user-pool", "b2b-pool"];

export function generateCognitoMetrics(ts, er) {
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
        TokenRefreshSuccesses: counter(randInt(0, 100_000)),
        TokenRefreshUserErrors: counter(Math.random() < er ? randInt(1, 500) : 0),
        FederationSuccesses: counter(randInt(0, 10_000)),
        AccountTakeoverRiskCount: counter(Math.random() < er * 0.3 ? randInt(0, 50) : 0),
      }
    );
  });
}

// ─── GuardDuty ────────────────────────────────────────────────────────────────

export function generateGuarddutyMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "guardduty",
      "aws.guardduty",
      region,
      account,
      { DetectorId: `abc123def456ghi789jkl012` },
      {
        FindingsCount: counter(randInt(0, 500)),
        HighSeverityFindingsCount: counter(Math.random() < er ? randInt(0, 20) : 0),
        MediumSeverityFindingsCount: counter(randInt(0, 100)),
        LowSeverityFindingsCount: counter(randInt(0, 300)),
        ArchivedFindingsCount: counter(randInt(0, 200)),
      }
    ),
  ];
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

export function generateCloudwatchMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(CW_NAMESPACES, randInt(2, 4)).map((ns) => {
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
      }
    );
  });
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

export function generateStepfunctionsMetrics(ts, er) {
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
    return metricDoc(
      ts,
      "states",
      "aws.states",
      region,
      account,
      { StateMachineArn: `arn:aws:states:${region}:${account.id}:stateMachine:${machine}` },
      {
        ExecutionsStarted: counter(started),
        ExecutionsSucceeded: counter(started - failed - aborted),
        ExecutionsFailed: counter(failed),
        ExecutionsAborted: counter(aborted),
        ExecutionsTimedOut: counter(Math.round(failed * 0.2)),
        ExecutionTime: stat(dp(jitter(5_000, 4_000, 100, 3_600_000))),
        ExecutionThrottled: counter(Math.random() < er * 0.2 ? randInt(1, 100) : 0),
      }
    );
  });
}

// ─── SSM ──────────────────────────────────────────────────────────────────────

export function generateSsmMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
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
      }
    ),
  ];
}

// ─── CloudFormation ───────────────────────────────────────────────────────────

export function generateCloudformationMetrics(ts, er) {
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

export function generateCodebuildMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(CODEBUILD_PROJECTS, randInt(1, 3)).map((project) => {
    const builds = randInt(0, 200);
    const failed = Math.round(
      builds * (Math.random() < er ? jitter(0.15, 0.12, 0.01, 0.6) : jitter(0.05, 0.04, 0, 0.15))
    );
    return metricDoc(
      ts,
      "codebuild",
      "aws.codebuild",
      region,
      account,
      { ProjectName: project },
      {
        Builds: counter(builds),
        SucceededBuilds: counter(builds - failed),
        FailedBuilds: counter(failed),
        BuildDuration: stat(dp(jitter(180, 150, 10, 3_600))),
        QueuedBuilds: counter(randInt(0, 20)),
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

export function generateCodepipelineMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return sample(PIPELINES, randInt(1, 2)).map((pipeline) => {
    const execs = randInt(0, 50);
    const failed = Math.round(
      execs * (Math.random() < er ? jitter(0.2, 0.15, 0.01, 0.7) : jitter(0.05, 0.04, 0, 0.15))
    );
    return metricDoc(
      ts,
      "codepipeline",
      "aws.codepipeline",
      region,
      account,
      { PipelineName: pipeline },
      {
        PipelineExecutionAttempts: counter(execs),
        PipelineExecutionSucceeded: counter(execs - failed),
        PipelineExecutionFailed: counter(failed),
        ActionExecutionSucceeded: counter(Math.round(execs * 5)),
        ActionExecutionFailed: counter(Math.round(failed * 2)),
      }
    );
  });
}

// ─── CodeDeploy ───────────────────────────────────────────────────────────────

export function generateCodedeployMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const appName = rand(["web-app", "api-service", "worker-service", "mobile-backend"]);
  const deploys = randInt(0, 20);
  const failed = Math.round(
    deploys * (Math.random() < er ? jitter(0.2, 0.15, 0.01, 0.6) : jitter(0.05, 0.04, 0, 0.15))
  );
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
        DeploymentDuration: stat(dp(jitter(300, 250, 30, 3_600))),
      }
    ),
  ];
}

// ─── Amplify ──────────────────────────────────────────────────────────────────

export function generateAmplifyMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const req = randInt(0, 1_000_000);
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
        "4xxErrors": counter(randInt(0, Math.round(req * 0.02))),
        "5xxErrors": counter(Math.random() < er ? randInt(0, Math.round(req * 0.05)) : 0),
        Latency: stat(dp(jitter(50, 40, 5, 5_000))),
      }
    ),
  ];
}

// ─── AutoScaling ──────────────────────────────────────────────────────────────

const ASG_NAMES = ["web-asg", "api-asg", "worker-asg", "batch-asg", "ml-asg"];

export function generateAutoscalingMetrics(ts, er) {
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

export function generateRoute53Metrics(ts, er) {
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
      }
    );
  });
}

// ─── Billing ──────────────────────────────────────────────────────────────────

export function generateBillingMetrics(ts, _er) {
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

export function generateHealthMetrics(ts, er) {
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

export function generateInspectorMetrics(ts, er) {
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
        AutoRemediationSucceeded: counter(randInt(0, 100)),
        AutoRemediationFailed: counter(Math.random() < er ? randInt(0, 10) : 0),
      }
    ),
  ];
}

export function generateMacieMetrics(ts, er) {
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
        ObjectsClassified: counter(randInt(0, 10_000_000)),
        DataClassifiedInBytes: counter(randInt(0, 1_000_000_000_000)),
      }
    ),
  ];
}

export function generateConfigMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "config",
      "aws.config",
      region,
      account,
      { Region: region },
      {
        CompliantRulesCount: counter(randInt(50, 200)),
        NonCompliantRulesCount: counter(Math.random() < er ? randInt(0, 30) : 0),
        ResourcesEvaluated: counter(randInt(0, 10_000)),
        RemediationsExecuted: counter(randInt(0, 100)),
        RemediationsFailed: counter(Math.random() < er ? randInt(0, 10) : 0),
      }
    ),
  ];
}

export function generateAccessanalyzerMetrics(ts, er) {
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

export function generateIotcoreMetrics(ts, er) {
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
        Connect_Success: counter(randInt(0, 50_000)),
        Connect_Failure: counter(Math.random() < er ? randInt(1, 1_000) : 0),
        Subscribe_Success: counter(randInt(0, 100_000)),
        Publish_In_Success: counter(randInt(0, 1_000_000)),
        Publish_Out_Success: counter(randInt(0, 1_000_000)),
        PublishIn_Throttle: counter(Math.random() < er ? randInt(1, 10_000) : 0),
        RulesExecuted: counter(randInt(0, 500_000)),
        RuleMessageThrottled: counter(Math.random() < er ? randInt(1, 5_000) : 0),
        Disconnect: counter(randInt(0, 50_000)),
      }
    ),
  ];
}

// ─── Workspaces ───────────────────────────────────────────────────────────────

export function generateWorkspacesMetrics(ts, er) {
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

export function generateConnectMetrics(ts, er) {
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

export function generateGameliftMetrics(ts, er) {
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

export function generateSecretsmanagerMetrics(ts, er) {
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

export function generateAcmMetrics(ts, er) {
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

export function generateCloudtrailMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
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
        LogFileDeliveryErrors: counter(Math.random() < er ? randInt(0, 20) : 0),
        APICallCount: counter(randInt(0, 10_000_000)),
        ErrorAPICallCount: counter(Math.random() < er ? randInt(0, 100_000) : 0),
      }
    ),
  ];
}

// ─── Additional management / observability ────────────────────────────────────

export function generateAppsyncMetrics(ts, er) {
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

export function generateTrustedadvisorMetrics(ts, er) {
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

export function generateImagebuilderMetrics(ts, er) {
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

export function generateDevopsgouruMetrics(ts, er) {
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

export function generatePinpointMetrics(ts, er) {
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

export function generateTransferfamilyMetrics(ts, er) {
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

export function generateLightsailMetrics(ts, er) {
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

export function generateRamMetrics(ts, _er) {
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

export function generateDmsMetrics(ts, er) {
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

export function generateCodecommitMetrics(ts, _er) {
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
        NumberOfRepositories: counter(randInt(1, 50)),
      }
    ),
  ];
}

export function generateCodeartifactMetrics(ts, _er) {
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

export function generateSecurityhubMetrics(ts, er) {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const standard = rand(SH_STANDARDS);
  const isFailing = Math.random() < er;
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
        SecurityScore: stat(dp(jitter(isFailing ? 55 : 82, 15, 0, 100))),
        ControlsFailed: counter(isFailing ? randInt(5, 50) : randInt(0, 5)),
        ControlsPassed: counter(randInt(10, 150)),
      }
    ),
  ];
}
