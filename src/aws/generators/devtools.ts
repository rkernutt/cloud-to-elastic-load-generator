import {
  rand,
  randInt,
  randFloat,
  randId,
  randUUID,
  randAccount,
  REGIONS,
  HTTP_METHODS,
  HTTP_PATHS,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

// ─── X-Ray trace pool — links multiple segments to the same trace ─────────────
const _xrayTracePool = {};

function generateCodeBuildLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const project = rand([
    "web-app-build",
    "api-service-build",
    "infra-terraform",
    "docker-build",
    "test-runner",
    "release-build",
  ]);
  const dur = randInt(30, isErr ? 3600 : 900);
  const phase = rand([
    "DOWNLOAD_SOURCE",
    "INSTALL",
    "PRE_BUILD",
    "BUILD",
    "POST_BUILD",
    "UPLOAD_ARTIFACTS",
    "COMPLETED",
  ]);
  const buildId = `${project}:${randId(8)}-${randId(4)}`.toLowerCase();
  const phaseDur = randInt(5, 300);
  const buildMsgs = isErr
    ? [
        "Build failed",
        "Build failed",
        `CodeBuild ${project} FAILED at phase ${phase} after ${dur}s`,
      ]
    : [
        "Build started",
        "Build succeeded",
        `CodeBuild ${project} SUCCEEDED in ${dur}s`,
        `Phase ${phase} completed in ${phaseDur}s`,
        `Build started`,
        `Phase ${phase} completed in ${phaseDur}s`,
        "Build succeeded",
      ];
  const plainMessage = rand(buildMsgs);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        buildId,
        project,
        phase,
        status: isErr ? "FAILED" : "SUCCEEDED",
        durationSeconds: dur,
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "codebuild" },
    },
    aws: {
      dimensions: { ProjectName: project, BuildId: buildId },
      codebuild: {
        project_name: project,
        build_id: buildId,
        build_status: isErr ? "FAILED" : "SUCCEEDED",
        current_phase: phase,
        duration_seconds: dur,
        queued_duration_seconds: randInt(1, 60),
        build_number: randInt(1, 5000),
        initiator: rand(["codepipeline", "github-webhook", "manual"]),
        source_version: randId(40).toLowerCase(),
        structured_logging: useStructuredLogging,
        metrics: {
          Builds: { sum: 1 },
          SucceededBuilds: { sum: isErr ? 0 : 1 },
          FailedBuilds: { sum: isErr ? 1 : 0 },
          Duration: { avg: dur },
          QueuedDuration: { avg: randInt(1, 60) },
          BuildDuration: { avg: dur },
        },
      },
    },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.codebuild",
      provider: "codebuild.amazonaws.com",
    },
    message: message,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "BuildFailed",
            message: `CodeBuild failed at phase ${phase}`,
            type: "build",
          },
        }
      : {}),
  };
}

function generateCodePipelineLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const pipeline = rand([
    "web-prod-pipeline",
    "api-deploy",
    "infra-pipeline",
    "release-train",
    "hotfix-pipeline",
  ]);
  const stage = rand(["Source", "Build", "Test", "Staging", "Approval", "Production"]);
  const executionId = randUUID();
  const pipelineMsgPool = isErr
    ? ["Pipeline execution failed", `CodePipeline ${pipeline} FAILED at ${stage}`]
    : [
        "Pipeline execution started",
        "Pipeline execution succeeded",
        `CodePipeline ${pipeline} SUCCEEDED`,
      ];
  const plainMessage = rand(pipelineMsgPool);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        pipeline,
        executionId,
        stage,
        state: isErr ? "Failed" : "Succeeded",
        timestamp: new Date(ts).toISOString(),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "codepipeline" },
    },
    aws: {
      dimensions: { PipelineName: pipeline },
      codepipeline: {
        pipeline_name: pipeline,
        pipeline_arn: `arn:aws:codepipeline:${region}:${acct.id}:${pipeline}`,
        execution_id: executionId,
        stage_name: stage,
        action_name: rand(["Source", "CodeBuild", "Deploy", "Manual", "Lambda"]),
        state: isErr ? "Failed" : "Succeeded",
        revision_id: randId(40).toLowerCase(),
        structured_logging: useStructuredLogging,
        metrics: {
          PipelineExecutionAttempts: { sum: 1 },
          PipelineSuccessCount: { sum: isErr ? 0 : 1 },
          PipelineFailureCount: { sum: isErr ? 1 : 0 },
          ActionExecutionAttempts: { sum: 1 },
          ActionSuccessCount: { sum: isErr ? 0 : 1 },
          ActionFailureCount: { sum: isErr ? 1 : 0 },
        },
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process", "configuration"],
      dataset: "aws.codepipeline",
      provider: "codepipeline.amazonaws.com",
      duration: randInt(10, isErr ? 600 : 120) * 1e9,
    },
    message: message,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: "StageFailed",
            message: `Pipeline stage ${stage} failed`,
            type: "pipeline",
          },
        }
      : {}),
  };
}

function generateCodeDeployLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand(["web-app", "api-service", "worker-service", "background-jobs"]);
  const dur = randInt(30, isErr ? 1200 : 600);
  const ev = rand([
    "BeforeInstall",
    "AfterInstall",
    "ApplicationStart",
    "ValidateService",
    "BeforeAllowTraffic",
    "AfterAllowTraffic",
  ]);
  const depGroup = rand(["prod", "staging", "canary"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "codedeploy" },
    },
    aws: {
      dimensions: { DeploymentGroupName: depGroup, ApplicationName: app },
      codedeploy: {
        application_name: app,
        deployment_group: depGroup,
        deployment_id: `d-${randId(9)}`,
        deployment_type: rand(["BLUE_GREEN", "IN_PLACE"]),
        lifecycle_event: ev,
        event_status: isErr ? "Failed" : "Succeeded",
        duration_seconds: dur,
        error_code: isErr
          ? rand(["SCRIPT_FAILED", "AGENT_ISSUE", "HEALTH_CONSTRAINTS_INVALID"])
          : null,
        instances_succeeded: isErr ? randInt(0, 5) : randInt(1, 10),
        instances_failed: isErr ? randInt(1, 3) : 0,
        metrics: {
          DeploymentAttempts: { sum: 1 },
          DeploymentSuccesses: { sum: isErr ? 0 : 1 },
          DeploymentFailures: { sum: isErr ? 1 : 0 },
          RollbackAttempts: { sum: isErr && Math.random() > 0.5 ? 1 : 0 },
          DeploymentDuration: { avg: dur },
          InstanceSuccesses: { sum: isErr ? randInt(0, 5) : randInt(1, 10) },
          InstanceFailures: { sum: isErr ? randInt(1, 3) : 0 },
        },
      },
    },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process", "configuration"],
      dataset: "aws.codedeploy",
      provider: "codedeploy.amazonaws.com",
    },
    message: rand(
      isErr
        ? [
            "Deployment failed",
            `CodeDeploy ${app} FAILED at ${ev}: ${rand(["Script exited with code 1", "Health check failed", "Timeout"])}`,
          ]
        : [
            "Deployment started",
            "Deployment succeeded",
            `CodeDeploy ${app} deployment SUCCEEDED in ${dur}s`,
          ]
    ),
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["SCRIPT_FAILED", "AGENT_ISSUE", "HEALTH_CONSTRAINTS_INVALID"]),
            message: `CodeDeploy failed at ${ev}`,
            type: "deployment",
          },
        }
      : {}),
  };
}

function generateCodeCommitLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const repo = rand(["web-app", "api-service", "infrastructure", "ml-models", "shared-libs"]);
  const ev = rand([
    "ReferenceCreated",
    "ReferenceUpdated",
    "ReferenceDeleted",
    "PullRequestCreated",
    "PullRequestMerged",
    "PullRequestApproved",
  ]);
  const branch = rand([
    "main",
    "develop",
    "feature/new-auth",
    "release/v2.1",
    "hotfix/payment-bug",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "codecommit" },
    },
    aws: {
      codecommit: {
        repository_name: repo,
        repository_arn: `arn:aws:codecommit:${region}:${acct.id}:${repo}`,
        event_type: ev,
        reference_name: branch,
        commit_id: randId(40).toLowerCase(),
        author: rand(["alice", "bob", "carol", "github-actions", "codebuild"]),
        files_changed: randInt(1, 50),
        lines_added: randInt(0, 500),
        lines_deleted: randInt(0, 200),
        pull_request_id: ev.includes("PullRequest") ? `${randInt(1, 500)}` : null,
        merge_strategy:
          ev === "PullRequestMerged" ? rand(["fast-forward", "squash", "three-way"]) : null,
        error_code: isErr
          ? rand(["EncryptionKeyUnavailableException", "InvalidBranchNameException"])
          : null,
      },
    },
    user: { name: rand(["alice", "bob", "carol"]) },
    event: {
      action: ev,
      outcome: isErr ? "failure" : "success",
      category: ["configuration", "file"],
      dataset: "aws.codecommit",
      provider: "codecommit.amazonaws.com",
    },
    message: isErr
      ? `CodeCommit ${ev} FAILED on ${repo}: ${rand(["Encryption key unavailable", "Repository size limit"])}`
      : `CodeCommit ${ev}: ${repo}/${branch}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand(["EncryptionKeyUnavailableException", "InvalidBranchNameException"]),
            message: "CodeCommit operation failed",
            type: "vcs",
          },
        }
      : {}),
  };
}

function generateCodeArtifactLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const domain = rand(["corp-packages", "internal", "platform"]);
  const repo = rand(["npm-store", "pypi-store", "maven-central", "nuget-store"]);
  const format = rand(["npm", "pypi", "maven", "nuget"]);
  const pkg = rand(["my-lib", "utils", "api-client", "shared-components"]);
  const ver = `${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 10)}`;
  const action = rand([
    "PublishPackageVersion",
    "GetPackageVersionAsset",
    "DeletePackageVersions",
    "CopyPackageVersions",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "codeartifact" },
    },
    aws: {
      codeartifact: {
        domain_name: domain,
        repository_name: repo,
        package_format: format,
        package_name: pkg,
        package_version: ver,
        action,
        asset_name: format === "npm" ? `${pkg}-${ver}.tgz` : null,
        download_size_bytes: randInt(10000, 50000000),
        upstream_repository: rand([null, "npm-upstream", "pypi-upstream"]),
        error_code: isErr
          ? rand([
              "ResourceNotFoundException",
              "AccessDeniedException",
              "ResourceAlreadyExistsException",
            ])
          : null,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["package", "process"],
      dataset: "aws.codeartifact",
      provider: "codeartifact.amazonaws.com",
    },
    message: isErr
      ? `CodeArtifact ${action} FAILED: ${pkg}@${ver} in ${domain}/${repo}`
      : `CodeArtifact ${action}: ${pkg}@${ver} [${format}] in ${domain}/${repo}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "AccessDeniedException",
              "ResourceAlreadyExistsException",
            ]),
            message: "CodeArtifact operation failed",
            type: "package",
          },
        }
      : {}),
  };
}

function generateAmplifyLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand(["web-portal", "mobile-backend", "partner-dashboard", "docs-site"]);
  const branch = rand(["main", "staging", "develop", "feature-auth", "production"]);
  const buildStatus = isErr
    ? rand(["FAILED", "CANCELLED", "TIMED_OUT"])
    : rand(["SUCCEED", "SUCCEED", "RUNNING"]);
  const dur = randInt(60, isErr ? 1800 : 600);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "amplify" },
    },
    aws: {
      amplify: {
        app_id: randId(10),
        app_name: app,
        branch_name: branch,
        job_id: `${randInt(1, 1000)}`,
        job_type: rand(["RELEASE", "RETRY", "MANUAL", "WEB_HOOK"]),
        build_status: buildStatus,
        duration_seconds: dur,
        commit_id: randId(40).toLowerCase(),
        commit_message: rand(["feat: add auth", "fix: payment bug", "chore: update deps"]),
        framework: rand(["React", "Next.js", "Vue", "Gatsby", "Angular"]),
        error_message: isErr ? rand(["Build script failed", "npm install error", "Timeout"]) : null,
      },
    },
    event: {
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.amplify",
      provider: "amplify.amazonaws.com",
    },
    message: isErr
      ? `Amplify build FAILED: ${app}/${branch} - ${rand(["Build script failed", "npm error", "Timeout"])}`
      : `Amplify build ${buildStatus}: ${app}/${branch} in ${dur}s`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: "BuildFailed", message: "Amplify build failed", type: "build" } }
      : {}),
  };
}

function generateXRayLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const isThrottle = !isErr && Math.random() < 0.02;
  const isClientErr = !isErr && !isThrottle && Math.random() < 0.05;

  const SERVICE_NODES = [
    { name: "api-gateway", awsType: "AWS::ApiGateway::Stage" },
    { name: "lambda-function", awsType: "AWS::Lambda::Function" },
    { name: "dynamodb-client", awsType: "AWS::DynamoDB::Table" },
    { name: "s3-client", awsType: "AWS::S3::Bucket" },
    { name: "rds-proxy", awsType: "AWS::RDS::DBInstance" },
    { name: "sqs-consumer", awsType: "AWS::SQS::Queue" },
    { name: "user-service", awsType: "remote" },
    { name: "payment-service", awsType: "remote" },
    { name: "cache-layer", awsType: "remote" },
  ];
  const SUBSEG_OPS = [
    "DynamoDB.GetItem",
    "DynamoDB.PutItem",
    "DynamoDB.Query",
    "S3.GetObject",
    "S3.PutObject",
    "ElastiCache.get",
    "ElastiCache.set",
    "SQS.SendMessage",
    "SNS.Publish",
    "HTTP.GET",
    "HTTP.POST",
  ];

  // Bucket timestamp into ~10 s slots — documents in the same slot share a trace_id
  const tsBucket = Math.floor(new Date(ts).getTime() / 10000);
  const slotKey = `${tsBucket}-${randInt(0, 7)}`; // up to 8 concurrent traces per slot
  if (!_xrayTracePool[slotKey]) {
    _xrayTracePool[slotKey] = {
      id: `1-${Math.floor(new Date(ts).getTime() / 1000).toString(16)}-${randId(24).toLowerCase()}`,
      rootSegmentId: randId(16).toLowerCase(),
    };
    const keys = Object.keys(_xrayTracePool);
    if (keys.length > 100) delete _xrayTracePool[keys[0]];
  }
  const trace = _xrayTracePool[slotKey];
  const isRoot = Math.random() < 0.2;
  const svc = rand(SERVICE_NODES);
  const segmentId = isRoot ? trace.rootSegmentId : randId(16).toLowerCase();
  const dur = Number(randFloat(0.001, isErr ? 30 : 3));
  const status = isErr
    ? rand([500, 502, 503])
    : isThrottle
      ? 429
      : isClientErr
        ? rand([400, 403, 404])
        : rand([200, 200, 201, 204]);
  const method = rand(HTTP_METHODS);

  const subsegments = isRoot
    ? null
    : Array.from({ length: randInt(1, 3) }, () => ({
        id: randId(16).toLowerCase(),
        name: rand(SUBSEG_OPS),
        namespace: rand(["aws", "remote"]),
        duration: Number(randFloat(0.001, 0.5)),
        fault: isErr && Math.random() < 0.5,
      }));

  return {
    "@timestamp": ts,
    trace: { id: trace.id },
    span: { id: segmentId },
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "xray" },
    },
    aws: {
      dimensions: { GroupName: "Default", ServiceType: svc.awsType },
      xray: {
        trace_id: trace.id,
        segment_id: segmentId,
        parent_id: isRoot ? null : trace.rootSegmentId,
        service: { name: svc.name, type: svc.awsType },
        duration: dur,
        fault: isErr,
        error: isClientErr,
        throttle: isThrottle,
        http: {
          request: { method, url: rand(HTTP_PATHS) },
          response: { status },
        },
        annotations: { env: "prod", version: `v${randInt(1, 20)}` },
        subsegments,
        metrics: {
          ErrorRate: {
            avg: isClientErr ? Number(randFloat(1, 20)) : Number(randFloat(0, 1)),
          },
          FaultRate: { avg: isErr ? Number(randFloat(1, 15)) : Number(randFloat(0, 0.5)) },
          ThrottleRate: {
            avg: isThrottle ? Number(randFloat(1, 10)) : Number(randFloat(0, 0.5)),
          },
          TotalCount: { sum: randInt(1, 10000) },
          Latency: { avg: dur * 1000, p99: dur * 3000 },
        },
      },
    },
    http: { request: { method }, response: { status_code: status } },
    event: {
      duration: Math.round(dur * 1e9),
      outcome: isErr || isClientErr ? "failure" : "success",
      category: ["network"],
      type: isErr ? ["connection", "denied"] : ["connection"],
      dataset: "aws.xray",
      provider: "xray.amazonaws.com",
    },
    message: isErr
      ? `X-Ray FAULT: ${svc.name} ${method} → ${status} (${dur.toFixed(3)}s)`
      : isThrottle
        ? `X-Ray THROTTLE: ${svc.name} ${method} → 429 (${dur.toFixed(3)}s)`
        : `X-Ray: ${svc.name} ${method} → ${status} (${dur.toFixed(3)}s)`,
    log: { level: isErr ? "error" : isThrottle || isClientErr ? "warn" : "info" },
    ...(isErr
      ? { error: { code: "TraceFault", message: `Service fault: HTTP ${status}`, type: "trace" } }
      : {}),
  };
}

function generateCodeGuruLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const repo = rand([
    "backend-api",
    "data-pipeline",
    "auth-service",
    "ml-platform",
    "frontend-app",
  ]);
  const product = rand(["Reviewer", "Profiler"]);
  const REVIEWER_FINDINGS = [
    "Security:TaintedDataUsedInSecurityCheck",
    "CodeMaintainability:LongMethod",
    "Performance:InefficientContainerSize",
    "AWSBestPractices:S3BucketMissingServerSideEncryption",
    "Logging:SensitiveDataInLogs",
  ];
  const PROFILER_FINDINGS = [
    "HighCPUFrames:Base64Encoding",
    "Excessive GC overhead",
    "Hot method: HashMap.get",
    "Lambda cold start overhead",
    "Database N+1 queries",
  ];
  const finding = product === "Reviewer" ? rand(REVIEWER_FINDINGS) : rand(PROFILER_FINDINGS);
  const severity = rand(["Critical", "High", "Medium", "Low", "Info"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "codeguru" },
    },
    aws: {
      codeguru: {
        product,
        repository_name: repo,
        association_id: randId(36).toLowerCase(),
        finding_id: randId(36).toLowerCase(),
        category:
          product === "Reviewer"
            ? rand([
                "Security",
                "CodeMaintainability",
                "Performance",
                "AWSBestPractices",
                "Logging",
              ])
            : rand(["CPU", "Memory", "Latency", "IO"]),
        severity,
        finding_description: finding,
        code_file: rand([
          `src/main/${repo.replace("-", "")}/Handler.java`,
          "lambda_function.py",
          "app/models.py",
          "server/routes.js",
        ]),
        line_number: randInt(1, 500),
        pull_request_id: product === "Reviewer" ? randInt(1, 200) : null,
        profiling_group: product === "Profiler" ? `${repo}-profiling` : null,
        frame_percent: product === "Profiler" ? Number(randFloat(1, 50)) : null,
        error_code: isErr
          ? rand(["InternalServerException", "ThrottlingException", "ResourceNotFoundException"])
          : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["vulnerability", "process"],
      dataset: "aws.codeguru",
      provider: "codeguru.amazonaws.com",
    },
    message: isErr
      ? `CodeGuru ${product} FAILED [${repo}]: ${rand(["Internal error", "Repository not found", "Throttled"])}:`
      : `CodeGuru ${product} [${repo}] ${severity}: ${finding.split(":")[0]}`,
    log: { level: isErr ? "error" : ["Critical", "High"].includes(severity) ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "InternalServerException",
              "ThrottlingException",
              "ResourceNotFoundException",
            ]),
            message: "CodeGuru operation failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateCodeCatalystLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const spaceName = rand([
    "engineering",
    "platform-team",
    "mobile-team",
    "data-team",
    "infra-team",
  ]);
  const projectName = rand([
    "backend-service",
    "mobile-app",
    "data-pipeline",
    "infrastructure",
    "api-gateway",
  ]);
  const workflowName = rand([
    "ci-pipeline",
    "cd-pipeline",
    "pr-checks",
    "nightly-build",
    "security-scan",
  ]);
  const workflowRunId = `run-${randId(20).toLowerCase()}`;
  const runStatus = isErr
    ? rand(["FAILED", "TIMED_OUT", "STOPPED"])
    : rand(["SUCCEEDED", "IN_PROGRESS", "QUEUED"]);
  const action = rand([
    "StartWorkflowRun",
    "StopWorkflowRun",
    "CreateDevEnvironment",
    "DeleteDevEnvironment",
    "MergeSourceBranchesToTarget",
    "CreateSourceRepository",
  ]);
  const devEnvId = `dev-${randId(16).toLowerCase()}`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "codecatalyst" },
    },
    aws: {
      dimensions: { SpaceName: spaceName, ProjectName: projectName },
      codecatalyst: {
        space_name: spaceName,
        project_name: projectName,
        workflow_name: workflowName,
        workflow_run_id: workflowRunId,
        workflow_run_status: runStatus,
        dev_environment_id: devEnvId,
        dev_environment_status: isErr
          ? "FAILED"
          : rand(["RUNNING", "STARTING", "STOPPED", "DELETING"]),
        ide: rand(["VSCode", "IntelliJ IDEA", "AWS Cloud9"]),
        branch_name: rand(["main", "develop", "feature/new-api", "fix/bug-123", "release/v2.0"]),
        event_type: rand([
          "WORKFLOW_RUN",
          "DEV_ENVIRONMENT",
          "SOURCE_REPOSITORY",
          "PROJECT",
          "SPACE",
        ]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.codecatalyst",
      provider: "codecatalyst.amazonaws.com",
    },
    message: isErr
      ? `CodeCatalyst ${action} FAILED [${spaceName}/${projectName}]: ${rand(["Workflow run failed", "Dev environment error", "Branch conflict", "Quota exceeded"])}`
      : `CodeCatalyst ${action}: space=${spaceName}, project=${projectName}, workflow=${workflowName} ${runStatus}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "ResourceNotFoundException",
              "ValidationException",
              "ServiceQuotaExceededException",
            ]),
            message: "CodeCatalyst operation failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateDeviceFarmLog(ts: string, er: number): EcsDocument {
  const region = "us-west-2"; // Device Farm only available in us-west-2
  const acct = randAccount();
  const isErr = Math.random() < er;
  const projectName = rand([
    "iOS-App-Tests",
    "Android-App-Tests",
    "Web-App-Tests",
    "Mobile-Regression",
    "Performance-Suite",
  ]);
  const projectArn = `arn:aws:devicefarm:${region}:${acct.id}:project:${randId(8)}-${randId(4)}-${randId(4)}-${randId(4)}-${randId(12)}`;
  const runName = rand([
    "Sprint-42-Regression",
    "Pre-Release-Smoke",
    "Nightly-Full-Suite",
    "Performance-Baseline",
    "Accessibility-Scan",
  ]);
  const runStatus = isErr
    ? rand(["FAILED", "ERRORED", "STOPPED"])
    : rand(["PASSED", "PENDING", "RUNNING", "SCHEDULED"]);
  const devicePlatform = rand(["ANDROID", "IOS"]);
  const deviceModel = rand([
    "Samsung Galaxy S23",
    "Google Pixel 7",
    "iPhone 15 Pro",
    "iPhone 14",
    "Samsung Galaxy A54",
  ]);
  const totalTests = randInt(10, 500);
  const passedTests = isErr
    ? randInt(0, Math.floor(totalTests * 0.5))
    : randInt(Math.floor(totalTests * 0.8), totalTests);
  const failedTests = totalTests - passedTests;
  const action = rand([
    "ScheduleRun",
    "StopRun",
    "CreateProject",
    "CreateDevicePool",
    "CreateUpload",
    "GetRun",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "devicefarm" },
    },
    aws: {
      dimensions: { ProjectArn: projectArn },
      devicefarm: {
        project_name: projectName,
        project_arn: projectArn,
        run_name: runName,
        run_status: runStatus,
        device_platform: devicePlatform,
        device_model: deviceModel,
        total_tests: totalTests,
        passed_tests: passedTests,
        failed_tests: failedTests,
        test_type: rand([
          "BUILTIN_FUZZ",
          "INSTRUMENTATION",
          "XCTEST",
          "APPIUM_PYTHON",
          "APPIUM_NODE",
        ]),
        billing_method: rand(["METERED", "UNMETERED"]),
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.devicefarm",
      provider: "devicefarm.amazonaws.com",
    },
    message: isErr
      ? `Device Farm ${action} FAILED [${projectName}]: ${rand(["Run failed", "Device unavailable", "Upload invalid", "Timeout exceeded"])}`
      : `Device Farm ${action}: project=${projectName}, run=${runName} ${runStatus} (${passedTests}/${totalTests} passed)`,
    log: { level: isErr ? "error" : failedTests > 0 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: rand([
              "NotFoundException",
              "ArgumentException",
              "IdempotencyException",
              "ServiceAccountException",
            ]),
            message: "Device Farm run failed",
            type: "process",
          },
        }
      : {}),
  };
}

function generateProtonLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const environmentName = rand(["prod-env", "staging-env", "dev-env", "sandbox-env"]);
  const serviceName = rand(["api-service", "worker-service", "frontend-service", "data-pipeline"]);
  const serviceInstanceName = rand(["prod-instance", "staging-instance", "v2-instance"]);
  const templateName = rand([
    "fargate-env-template",
    "lambda-service-template",
    "ecs-service-template",
    "k8s-env-template",
  ]);
  const templateMajorVersion = rand(["1", "2", "3"]);
  const deploymentStatus = isErr
    ? rand(["FAILED", "DELETE_FAILED", "UPDATE_FAILED"])
    : rand(["SUCCEEDED", "IN_PROGRESS", "SUCCEEDED"]);
  const component = rand(["environment", "service", "service_instance", "component"]);
  const action = rand([
    "CreateEnvironment",
    "UpdateEnvironment",
    "DeleteEnvironment",
    "CreateService",
    "UpdateService",
    "DeployServiceInstance",
    "CancelServiceInstanceDeployment",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "proton" },
    },
    aws: {
      dimensions: { EnvironmentName: environmentName, ServiceName: serviceName },
      proton: {
        environment_name: environmentName,
        service_name: serviceName,
        service_instance_name: serviceInstanceName,
        template_name: templateName,
        template_major_version: templateMajorVersion,
        deployment_status: deploymentStatus,
        component,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["configuration"],
      dataset: "aws.proton",
      provider: "proton.amazonaws.com",
      duration: randInt(10, isErr ? 600 : 120) * 1e9,
    },
    message: isErr
      ? `Proton ${component} ${serviceName} deployment FAILED on ${templateName}`
      : `Proton ${component} ${serviceName} ${action} ${deploymentStatus}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: deploymentStatus,
            message: `Proton deployment failed for ${serviceName}`,
            type: "configuration",
          },
        }
      : {}),
  };
}

function generateQDeveloperLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const subscriptionId = `sub-${randId(10).toLowerCase()}`;
  const ide = rand(["VSCode", "JetBrains", "AWS Cloud9"]);
  const language = rand(["python", "typescript", "java", "go", "rust"]);
  const feature = rand(["inline_completion", "chat", "transform", "review"]);
  const suggestionsAccepted = isErr ? 0 : randInt(0, 200);
  const suggestionsRejected = randInt(0, isErr ? 200 : 50);
  const activeUsers = randInt(1, 1000);
  const errorCode = rand(["CompletionTimeout", "TransformFailed"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "q-developer" },
    },
    aws: {
      dimensions: { SubscriptionId: subscriptionId, Ide: ide },
      qdeveloper: {
        subscription_id: subscriptionId,
        ide,
        language,
        feature,
        metrics: {
          suggestions_accepted: suggestionsAccepted,
          suggestions_rejected: suggestionsRejected,
          active_users: activeUsers,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.qdeveloper",
      provider: "q.amazonaws.com",
      duration: randInt(10, isErr ? 30000 : 2000) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.qdeveloper", namespace: "default" },
    message: isErr
      ? `Q Developer ${feature} ${errorCode} for ${language} in ${ide}`
      : `Q Developer ${feature}: ${suggestionsAccepted} accepted, ${suggestionsRejected} rejected (${language}/${ide})`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Q Developer ${feature} failed for ${language}`,
            type: "process",
          },
        }
      : {}),
  };
}

// ─── CloudShell ───────────────────────────────────────────────────────────
function generateCloudShellLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const events = [
    "CreateEnvironment",
    "StartEnvironment",
    "StopEnvironment",
    "PutFileUpload",
    "GetFileDownload",
    "RunCommand",
  ];
  const ev = rand(events);
  const shells = ["bash", "zsh", "powershell"];
  const errMsgs = [
    "Environment creation quota exceeded",
    "Session expired",
    "Network timeout",
    "Storage limit reached",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudshell" },
    },
    aws: {
      cloudshell: {
        environment_id: `env-${randId(8).toLowerCase()}`,
        event_type: ev,
        shell_type: rand(shells),
        session_duration_seconds: randInt(10, 7200),
        storage_used_mb: randInt(1, 1024),
        user_arn: `arn:aws:iam::${acct.id}:user/${rand(["developer", "admin", "readonly"])}`,
        network_mode: rand(["public", "vpc"]),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e4, 5e6) },
    message: isErr ? `CloudShell: ${ev} failed — ${rand(errMsgs)}` : `CloudShell: ${ev} completed`,
  };
}

// ─── Cloud9 ───────────────────────────────────────────────────────────────
function generateCloud9Log(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const envs = ["dev-workspace", "pair-programming", "lambda-editor", "notebook-env"];
  const env = rand(envs);
  const events = [
    "CreateEnvironment",
    "UpdateEnvironment",
    "DeleteEnvironment",
    "OpenIDE",
    "ShareEnvironment",
    "CreateSSHEnvironment",
  ];
  const ev = rand(events);
  const instanceTypes = ["t3.small", "t3.medium", "m5.large", "t3.micro"];
  const errMsgs = [
    "EC2 instance failed to start",
    "EBS volume attachment timeout",
    "IAM permission denied",
    "VPC subnet exhausted",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloud9" },
    },
    aws: {
      cloud9: {
        environment_id: `env-${randId(16).toLowerCase()}`,
        environment_name: env,
        event_type: ev,
        instance_type: rand(instanceTypes),
        connection_type: rand(["CONNECT_SSM", "CONNECT_SSH"]),
        auto_stop_minutes: rand([30, 60, 120, 240]),
        members: randInt(1, 5),
        platform: rand(["amazonlinux-2", "amazonlinux-2023", "ubuntu-22.04"]),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(1e5, 3e7) },
    message: isErr
      ? `Cloud9 ${env}: ${ev} failed — ${rand(errMsgs)}`
      : `Cloud9 ${env}: ${ev} completed`,
  };
}

// ─── RoboMaker ────────────────────────────────────────────────────────────
function generateRoboMakerLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const apps = ["warehouse-nav", "delivery-robot", "inspection-drone", "pick-and-place"];
  const app = rand(apps);
  const events = [
    "CreateSimulationJob",
    "StartSimulation",
    "DescribeSimulation",
    "CreateRobotApplication",
    "BatchDescribeSimulation",
    "CreateWorldTemplate",
  ];
  const ev = rand(events);
  const statuses = isErr ? ["Failed", "Canceled"] : ["Completed", "Running"];
  const errMsgs = [
    "Simulation world generation failed",
    "Robot application build error",
    "GPU resource unavailable",
    "Gazebo process crashed",
  ];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "robomaker" },
    },
    aws: {
      robomaker: {
        simulation_job_id: `sim-${randId(12).toLowerCase()}`,
        robot_application: app,
        event_type: ev,
        status: rand(statuses),
        simulation_time_seconds: randInt(60, 36000),
        world_count: randInt(1, 10),
        compute_type: rand(["CPU", "GPU_AND_CPU"]),
        max_job_duration_seconds: 86400,
        failure_behavior: rand(["Fail", "Continue"]),
      },
    },
    event: { outcome: isErr ? "failure" : "success", duration: randInt(6e7, 3.6e10) },
    message: isErr
      ? `RoboMaker ${app}: ${ev} ${rand(statuses)} — ${rand(errMsgs)}`
      : `RoboMaker ${app}: ${ev} completed`,
  };
}

export {
  generateCodeBuildLog,
  generateCodePipelineLog,
  generateCodeDeployLog,
  generateCodeCommitLog,
  generateCodeArtifactLog,
  generateAmplifyLog,
  generateXRayLog,
  generateCodeGuruLog,
  generateCodeCatalystLog,
  generateDeviceFarmLog,
  generateProtonLog,
  generateQDeveloperLog,
  generateCloudShellLog,
  generateCloud9Log,
  generateRoboMakerLog,
};
