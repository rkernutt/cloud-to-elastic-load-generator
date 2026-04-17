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
  USER_AGENTS,
} from "../../helpers";
import type { EcsDocument } from "./types.js";

// ─── X-Ray trace pool — links multiple segments to the same trace ─────────────
const _xrayTracePool: Record<string, { id: string; rootSegmentId: string }> = {};

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
  const phases = [
    "SUBMITTED",
    "QUEUED",
    "PROVISIONING",
    "DOWNLOAD_SOURCE",
    "INSTALL",
    "PRE_BUILD",
    "BUILD",
    "POST_BUILD",
    "UPLOAD_ARTIFACTS",
    "FINALIZING",
    "COMPLETED",
  ] as const;
  const failIdx = isErr ? randInt(4, phases.length - 2) : phases.length;
  const dur = randInt(45, isErr ? 4200 : 1400);
  const phase = isErr ? phases[failIdx] : "COMPLETED";
  const buildId = `${project}:${randId(8)}-${randId(4)}`.toLowerCase();
  const queuedSec = randInt(2, 180);
  const commit = randId(40).toLowerCase();
  const img = rand([
    "aws/codebuild/standard:7.0",
    "aws/codebuild/amazonlinux2-x86_64-standard:5.0",
  ]);
  const t0 = new Date(ts).getTime();
  const lineTs = (deltaSec: number) => new Date(t0 + deltaSec * 1000).toISOString();
  let tick = 0;
  const nextTs = () => lineTs((tick += randFloat(0.4, 2.8)));
  const lines: string[] = [];
  lines.push(`[Container] ${nextTs()} Waiting for agent ping`);
  lines.push(`[Container] ${nextTs()} Agent ping confirmed`);
  lines.push(`[Container] ${nextTs()} Entering phase SUBMITTED`);
  lines.push(`[Container] ${nextTs()} Phase complete: SUBMITTED State: SUCCEEDED`);
  lines.push(`[Container] ${nextTs()} Entering phase QUEUED`);
  lines.push(`[Container] ${nextTs()} Phase complete: QUEUED State: SUCCEEDED`);
  lines.push(`[Container] ${nextTs()} Phase duration: ${queuedSec} seconds`);
  const lastPhaseIdx = isErr ? failIdx : phases.indexOf("UPLOAD_ARTIFACTS");
  for (let i = 2; i < Math.min(lastPhaseIdx + 1, phases.length); i++) {
    const p = phases[i];
    const ps = randInt(3, 120);
    lines.push(`[Container] ${nextTs()} Entering phase ${p}`);
    if (p === "PROVISIONING") {
      lines.push(`[Container] ${nextTs()} CODEBUILD_CONTAINER_TYPE: LINUX_CONTAINER`);
      lines.push(`[Container] ${nextTs()} Downloading managed image ${img}`);
      lines.push(
        `[Container] ${nextTs()} Authenticating with ECR registry 123456789012.dkr.ecr.${region}.amazonaws.com`
      );
    }
    if (p === "DOWNLOAD_SOURCE") {
      lines.push(
        `[Container] ${nextTs()} CODEBUILD_SRC_DIR=/codebuild/output/src${randInt(100, 999)}/src/github.com/acme/${project}`
      );
      lines.push(`[Container] ${nextTs()} GIT_CLONE_DEPTH=1`);
      lines.push(`[Container] ${nextTs()} Cloning into '.'...`);
      lines.push(
        `[Container] ${nextTs()} remote: Enumerating objects: ${randInt(800, 12000)}, done.`
      );
      lines.push(
        `[Container] ${nextTs()} HEAD is now at ${commit.slice(0, 7)} ${rand(["chore: bump", "feat: pipeline", "fix: tests"])}`
      );
    }
    if (p === "INSTALL") {
      lines.push(`[Container] ${nextTs()} Running command npm ci --prefer-offline --no-audit`);
      lines.push(
        `[Container] ${nextTs()} added ${randInt(800, 2400)} packages in ${randInt(18, 220)}s`
      );
    }
    if (p === "PRE_BUILD") {
      lines.push(
        `[Container] ${nextTs()} Running command chmod +x scripts/pre_build.sh && ./scripts/pre_build.sh`
      );
      lines.push(`[Container] ${nextTs()} pre_build: lint-staged OK`);
    }
    if (p === "BUILD") {
      lines.push(
        `[Container] ${nextTs()} Running command docker build -t ${project}:${commit.slice(0, 7)} .`
      );
      lines.push(`#1 [internal] load build definition from Dockerfile`);
      lines.push(
        `#2 [internal] load metadata for docker.io/library/node:${randInt(18, 22)}-alpine`
      );
      if (Math.random() < 0.55) {
        lines.push(`#4 CACHED [stage-1 2/9] WORKDIR /app`);
        lines.push(`#5 CACHED [stage-1 3/9] COPY package.json package-lock.json ./`);
        lines.push(`#6 CACHED [build 4/7] RUN npm ci`);
        lines.push(`#7 [build 5/7] RUN npm run build`);
        lines.push(
          `#7 sha256:${randId(12).toLowerCase()} ${randInt(8, 120)}MB / ${randInt(120, 400)}MB ${randFloat(0.2, 9).toFixed(1)}s`
        );
      } else {
        lines.push(`#4 pulling layer ${randId(12).toLowerCase()}`);
        lines.push(`#5 exporting layers`);
        lines.push(
          `#5 sha256:${randId(12).toLowerCase()} ${randInt(40, 220)}MB / ${randInt(220, 600)}MB ${randFloat(1.2, 18).toFixed(1)}s`
        );
      }
      lines.push(`[Container] ${nextTs()} Running command npm test -- --ci --coverage`);
      lines.push(` PASS  tests/unit/${rand(["auth", "orders", "users", "payments"])}.spec.ts`);
      lines.push(` PASS  tests/integration/${rand(["api", "checkout", "webhooks"])}.spec.ts`);
      lines.push(
        `Test Suites: ${randInt(4, 28)} passed, ${isErr ? randInt(1, 3) : 0} failed, ${randInt(0, 2)} skipped`
      );
      lines.push(
        `Tests:       ${randInt(12, 240)} passed, ${isErr ? randInt(1, 6) : 0} failed, ${randInt(0, 4)} skipped`
      );
    }
    if (p === "POST_BUILD") {
      lines.push(`[Container] ${nextTs()} Running command cfn-lint template.yaml || true`);
      lines.push(
        `[Container] ${nextTs()} Running command aws s3 sync ./reports s3://${acct.id}-reports-${region}/${project}/ --quiet`
      );
    }
    if (p === "UPLOAD_ARTIFACTS") {
      lines.push(
        `[Container] ${nextTs()} Uploading artifacts to s3://${acct.id}-codepipeline-${region}/build/${buildId}/`
      );
      lines.push(`[Container] ${nextTs()} UPLOAD_ARTIFACTS: uploaded ${randInt(2, 45)} file(s)`);
    }
    if (isErr && p === phase) {
      lines.push(
        `[Container] ${nextTs()} Command did not exit successfully on build server, exit code: 1`
      );
      lines.push(`[Container] ${nextTs()} Phase complete: ${p} State: FAILED`);
      break;
    }
    lines.push(`[Container] ${nextTs()} Phase complete: ${p} State: SUCCEEDED`);
    lines.push(`[Container] ${nextTs()} Phase duration: ${ps} seconds`);
  }
  if (!isErr) {
    lines.push(`[Container] ${nextTs()} Entering phase FINALIZING`);
    lines.push(`[Container] ${nextTs()} Phase complete: FINALIZING State: SUCCEEDED`);
    lines.push(`[Container] ${nextTs()} Entering phase COMPLETED`);
    lines.push(`[Container] ${nextTs()} Phase complete: COMPLETED State: SUCCEEDED`);
  }
  const plainMessage = lines.join("\n");
  const useStructuredLogging = Math.random() < 0.55;
  const durationMs = dur * 1000;
  const message = useStructuredLogging
    ? JSON.stringify({
        buildId,
        project,
        phase,
        status: isErr ? "FAILED" : "SUCCEEDED",
        durationSeconds: dur,
        image: img,
        queuedDurationSeconds: queuedSec,
        sourceVersion: commit,
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
        queued_duration_seconds: queuedSec,
        build_number: randInt(1, 5000),
        initiator: rand(["codepipeline", "github-webhook", "manual"]),
        source_version: commit,
        structured_logging: useStructuredLogging,
        metrics: {
          Builds: { sum: 1 },
          SucceededBuilds: { sum: isErr ? 0 : 1 },
          FailedBuilds: { sum: isErr ? 1 : 0 },
          Duration: { avg: durationMs },
          QueuedDuration: { avg: queuedSec * 1000 },
          BuildDuration: { avg: durationMs },
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
  const flow = ["Source", "Build", "Deploy", "Test"] as const;
  const stage = rand([...flow, "Staging", "Approval", "Production"]);
  const executionId = randUUID();
  const revision = randId(40).toLowerCase();
  const artifactBucket = `${acct.id}-codepipeline-${region}`;
  const sourceZip = `s3://${artifactBucket}/${pipeline}/source_out/${revision}.zip`;
  const buildOut = `s3://${artifactBucket}/${pipeline}/build_out/${executionId}/BuildOut`;
  const deployOut = `s3://${artifactBucket}/${pipeline}/deploy/${executionId}/DeploymentBundle`;
  const srcAction = rand(["Source", "CheckoutSource", "GitHubSource"]);
  const buildProvider = rand(["CodeBuild", "CodeBuild", "JenkinsProvider"]);
  const deployProvider = rand(["CodeDeploy", "CloudFormation", "ECS"]);
  const approvalName = rand(["ManualApproval", "ChangeApproval", "SecuritySignOff"]);
  const lines: string[] = [];
  lines.push(
    `[CodePipeline] executionId=${executionId} pipeline=${pipeline} state=${isErr ? "FAILED" : "SUCCEEDED"} region=${region}`
  );
  lines.push(
    `[CodePipeline] Execution started for pipeline ${pipeline} (pipelineVersion=${randInt(1, 42)})`
  );
  lines.push(
    `[Stage:Source] Transitioning: STARTED action=${srcAction} provider=${rand(["GitHub", "CodeCommit", "S3"])} revision=${revision.slice(0, 7)}`
  );
  lines.push(`[Stage:Source] Output artifact location: ${sourceZip}`);
  lines.push(`[Stage:Source] Transitioning: SUCCEEDED durationMs=${randInt(1200, 45_000)}`);
  lines.push(
    `[Stage:Build] Transitioning: STARTED action=${buildProvider} project=${rand(["api-service-build", "web-build", "infra-validate"])}`
  );
  lines.push(`[Stage:Build] Input artifact: ${sourceZip}`);
  lines.push(`[Stage:Build] Output artifact: ${buildOut}`);
  if (isErr && stage === "Build") {
    lines.push(
      `[Stage:Build] Transitioning: FAILED error=BuildActionFailed details=CustomerBuildError`
    );
  } else {
    lines.push(`[Stage:Build] Transitioning: SUCCEEDED durationMs=${randInt(45_000, 520_000)}`);
    lines.push(
      `[Stage:Deploy] Transitioning: STARTED action=${deployProvider} deploymentGroup=${rand(["prod", "staging", "canary"])}`
    );
    lines.push(`[Stage:Deploy] Output artifact: ${deployOut}`);
    if (isErr && stage === "Deploy") {
      lines.push(`[Stage:Deploy] Transitioning: FAILED error=DeploymentFailure`);
    } else {
      lines.push(`[Stage:Deploy] Transitioning: SUCCEEDED durationMs=${randInt(30_000, 900_000)}`);
      lines.push(
        `[Stage:Test] Transitioning: STARTED action=${rand(["CodeBuild", "LambdaInvoke", "StepFunctions"])}`
      );
      if (isErr && stage === "Test") {
        lines.push(`[Stage:Test] Transitioning: FAILED error=TestActionFailed`);
      } else {
        lines.push(`[Stage:Test] Transitioning: SUCCEEDED durationMs=${randInt(20_000, 400_000)}`);
        if (Math.random() < 0.35) {
          lines.push(
            `[Stage:Approval] Transitioning: STARTED action=${approvalName} token=${randId(24)}`
          );
          lines.push(
            `[Stage:Approval] Waiting for manual approval (notificationArn=arn:aws:sns:${region}:${acct.id}:pipeline-approvals)`
          );
          lines.push(
            `[Stage:Approval] Transitioning: SUCCEEDED approvedBy=${rand(["alice", "bob", "release-bot"])}`
          );
        }
      }
    }
  }
  if (isErr && !lines.some((l) => l.includes("FAILED"))) {
    lines.push(`[Stage:${stage}] Transitioning: FAILED error=StageExecutionFailed`);
  }
  if (!isErr) {
    lines.push(
      `[CodePipeline] Execution succeeded for pipeline ${pipeline} executionId=${executionId}`
    );
  }
  const plainMessage = lines.join("\n");
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        pipeline,
        executionId,
        stage,
        state: isErr ? "Failed" : "Succeeded",
        timestamp: new Date(ts).toISOString(),
        revision,
        artifacts: { source: sourceZip, build: buildOut, deploy: deployOut },
        stages: flow,
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
        revision_id: revision,
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
  const deploymentId = `d-${randId(9)}`;
  const hookOrder = [
    "BeforeInstall",
    "Install",
    "AfterInstall",
    "ApplicationStart",
    "ValidateService",
  ] as const;
  const instId = `i-${randId(8)}`;
  const hookLines = hookOrder
    .map((h) => {
      const failedHere = isErr && ev === h;
      const script = `${rand(["scripts/", "appspec/"])}${h.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()}.sh`;
      return `[Lifecycle:${h}] instanceId=${instId} script=${script} status=${failedHere ? "FAILED" : "SUCCEEDED"} durationSec=${randInt(2, 180)}`;
    })
    .slice(0, randInt(3, hookOrder.length));
  const summaryLine =
    isErr && Math.random() < 0.55
      ? `[CodeDeploy] ROLLBACK_STARTED deploymentId=${deploymentId} reason=${rand(["Health checks failed", "Script failed", "Alarm breached"])} previousRevision=${randId(7)}`
      : `[CodeDeploy] deploymentId=${deploymentId} status=${isErr ? "FAILED" : "SUCCEEDED"} overallDurationSec=${dur}`;
  const narrative = [
    `[CodeDeploy] deploymentId=${deploymentId} application=${app} deploymentGroup=${depGroup} deploymentStyle=${rand(["IN_PLACE", "BLUE_GREEN"])}`,
    `[CodeDeploy] Targeting instances: count=${randInt(2, 24)} tagSet=Environment:${depGroup}`,
    ...hookLines,
    summaryLine,
  ].join("\n");
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
        deployment_id: deploymentId,
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
    message: narrative,
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

  // Service map nodes matching real AWS X-Ray service graph
  const SERVICE_NODES = [
    {
      name: "api-gateway",
      awsType: "AWS::ApiGateway::Stage",
      origin: "AWS::ApiGateway::Stage",
      namespace: "aws",
    },
    {
      name: "user-auth-function",
      awsType: "AWS::Lambda::Function",
      origin: "AWS::Lambda::Function",
      namespace: "aws",
    },
    {
      name: "order-processor",
      awsType: "AWS::Lambda::Function",
      origin: "AWS::Lambda::Function",
      namespace: "aws",
    },
    {
      name: "Users",
      awsType: "AWS::DynamoDB::Table",
      origin: "AWS::DynamoDB::Table",
      namespace: "aws",
    },
    {
      name: "Orders",
      awsType: "AWS::DynamoDB::Table",
      origin: "AWS::DynamoDB::Table",
      namespace: "aws",
    },
    {
      name: "data-bucket",
      awsType: "AWS::S3::Bucket",
      origin: "AWS::S3::Bucket",
      namespace: "aws",
    },
    {
      name: "prod-db-primary",
      awsType: "AWS::RDS::DBInstance",
      origin: "AWS::RDS::DBInstance",
      namespace: "aws",
    },
    {
      name: "order-queue",
      awsType: "AWS::SQS::Queue",
      origin: "AWS::SQS::Queue",
      namespace: "aws",
    },
    { name: "user-service", awsType: "client", origin: "AWS::ECS::Container", namespace: "remote" },
    {
      name: "payment-service",
      awsType: "client",
      origin: "AWS::ECS::Container",
      namespace: "remote",
    },
    {
      name: "notification-service",
      awsType: "client",
      origin: "AWS::ECS::Container",
      namespace: "remote",
    },
    {
      name: "cache-layer",
      awsType: "client",
      origin: "AWS::ElastiCache::CacheCluster",
      namespace: "remote",
    },
  ];

  // Bucket timestamp into ~10 s slots — documents in the same slot share a trace_id
  const tsBucket = Math.floor(new Date(ts).getTime() / 10000);
  const slotKey = `${tsBucket}-${randInt(0, 7)}`;
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
  const startTime = new Date(ts).getTime() / 1000;
  const dur = Number(randFloat(0.001, isErr ? 30 : 3));
  const endTime = startTime + dur;
  const status = isErr
    ? rand([500, 502, 503])
    : isThrottle
      ? 429
      : isClientErr
        ? rand([400, 403, 404])
        : rand([200, 200, 201, 204]);
  const method = rand(HTTP_METHODS);
  const path = rand(HTTP_PATHS);
  const url = `https://${rand(["api", "app", "service"])}.${rand(["example.com", "myapp.io", "internal.corp"])}${path}`;
  const clientIp = `${randInt(10, 223)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`;
  const userAgent = rand(USER_AGENTS);

  // Build subsegments matching real X-Ray segment document format
  const SUBSEG_TEMPLATES = [
    {
      name: "DynamoDB",
      ops: ["GetItem", "PutItem", "Query", "Scan", "BatchGetItem", "UpdateItem"],
      namespace: "aws",
    },
    { name: "S3", ops: ["GetObject", "PutObject", "ListObjects", "HeadObject"], namespace: "aws" },
    { name: "SQS", ops: ["SendMessage", "ReceiveMessage", "DeleteMessage"], namespace: "aws" },
    { name: "SNS", ops: ["Publish"], namespace: "aws" },
    { name: "Lambda", ops: ["Invoke"], namespace: "aws" },
  ];
  const httpSubsegs = [
    { host: "user-service.internal:8080", method: "GET", status: isErr ? 500 : 200 },
    { host: "payment-service.internal:8080", method: "POST", status: isErr ? 503 : 200 },
    { host: "cache-layer.internal:6379", method: "GET", status: 200 },
  ];

  const subsegments = isRoot
    ? null
    : Array.from({ length: randInt(1, 4) }, () => {
        const subStart = startTime + Number(randFloat(0, dur * 0.3));
        const subDur = Number(randFloat(0.001, dur * 0.8));
        const subEnd = subStart + subDur;
        const subFault = isErr && Math.random() < 0.5;

        if (Math.random() < 0.6) {
          // AWS SDK subsegment
          const tmpl = rand(SUBSEG_TEMPLATES);
          const op = rand(tmpl.ops);
          return {
            id: randId(16).toLowerCase(),
            name: tmpl.name,
            start_time: subStart,
            end_time: subEnd,
            namespace: tmpl.namespace,
            aws: {
              operation: op,
              region,
              retries: subFault ? randInt(1, 3) : 0,
              ...(tmpl.name === "DynamoDB"
                ? {
                    table_name: rand(["Users", "Orders", "Sessions", "Products"]),
                    request_id: randId(32).toLowerCase(),
                    consumed_capacity: {
                      TableName: rand(["Users", "Orders"]),
                      CapacityUnits: Number(randFloat(0.5, 10)),
                    },
                  }
                : {}),
              ...(tmpl.name === "S3"
                ? {
                    bucket_name: rand(["data-bucket", "assets-bucket", "logs-bucket"]),
                    key: `${rand(["data", "uploads", "exports"])}/${randId(12).toLowerCase()}.${rand(["json", "parquet", "csv"])}`,
                    request_id: randId(16).toUpperCase(),
                  }
                : {}),
            },
            http: {
              response: {
                status: subFault ? rand([400, 500, 503]) : 200,
                content_length: randInt(50, 50000),
              },
            },
            fault: subFault,
            error: false,
            throttle: false,
          };
        } else {
          // Remote HTTP subsegment
          const remote = rand(httpSubsegs);
          return {
            id: randId(16).toLowerCase(),
            name: remote.host,
            start_time: subStart,
            end_time: subEnd,
            namespace: "remote",
            http: {
              request: { method: remote.method, url: `http://${remote.host}${rand(HTTP_PATHS)}` },
              response: {
                status: subFault ? 500 : remote.status,
                content_length: randInt(50, 10000),
              },
            },
            fault: subFault,
            error: false,
            throttle: false,
          };
        }
      });

  // Exception block matching X-Ray segment format
  const cause = isErr
    ? {
        working_directory: "/var/task",
        paths: [],
        exceptions: [
          {
            id: randId(16).toLowerCase(),
            message: rand([
              "Connection refused",
              "Task timed out after 30.00 seconds",
              "An error occurred (ConditionalCheckFailedException)",
              "ECONNRESET: socket hang up",
              "Rate exceeded",
            ]),
            type: rand([
              "ConnectionError",
              "TimeoutError",
              "ConditionalCheckFailedException",
              "SocketError",
              "ThrottlingException",
            ]),
            remote: Math.random() < 0.5,
            stack: [
              {
                path: rand(["index.js", "handler.py", "service.ts"]),
                line: randInt(10, 200),
                label: rand(["processRequest", "handleEvent", "main"]),
              },
            ],
          },
        ],
      }
    : null;

  const segmentJson = JSON.stringify({
    trace_id: trace.id,
    id: segmentId,
    name: svc.name,
    start_time: startTime,
    end_time: endTime,
    ...(isRoot ? {} : { parent_id: trace.rootSegmentId }),
    http: {
      request: { method, url, client_ip: clientIp, user_agent: userAgent },
      response: { status, content_length: randInt(50, 50000) },
    },
    aws: {
      account_id: acct.id,
      region,
      operation: svc.awsType.startsWith("AWS::") ? svc.awsType.split("::").pop() : undefined,
      resource_names: [svc.name],
    },
    annotations: {
      environment: rand(["production", "staging"]),
      version: `v${randInt(1, 20)}.${randInt(0, 9)}.${randInt(0, 99)}`,
      team: rand(["platform", "backend", "frontend", "data"]),
    },
    metadata: {
      default: {
        response_size: randInt(50, 50000),
        ...(isErr ? { error_details: cause?.exceptions?.[0]?.message } : {}),
      },
    },
    fault: isErr,
    error: isClientErr,
    throttle: isThrottle,
    ...(cause ? { cause } : {}),
    origin: svc.origin,
    resource_arn: `arn:aws:${svc.awsType.split("::")[1]?.toLowerCase() || "lambda"}:${region}:${acct.id}:${svc.name}`,
  });
  const d0 = new Date(ts).getTime();
  const dz = (ms: number) => new Date(d0 + ms).toISOString();
  const daemonPool = [
    `${dz(0)} [Info] X-Ray daemon ${rand(["1.37.0", "3.3.14", "3.3.13"])} listening on address 127.0.0.1:2000`,
    `${dz(120)} [Info] Received segment document id=${segmentId} trace_id=${trace.id} bytes=${randInt(900, 120000)}`,
    `${dz(240)} [Info] Buffering segments queueDepth=${randInt(0, 18)}`,
    `${dz(360)} [Info] Successfully sent batch of ${randInt(1, 40)} segment document(s) to 169.254.100.0:2000`,
    `${dz(480)} [Info] Traces uploaded batchBytes=${randInt(4_000, 900_000)} latencyMs=${randInt(8, 220)}`,
    `${dz(600)} [Info] Sampling decision trace_id=${trace.id} rule=${rand(["Default", "api-high-traffic", "errors-only"])} reservoir=${randInt(0, 2)} outcome=${rand(["Sampled", "NotSampled", "Borrowed"])}`,
    `${dz(720)} [Info] PublishSlices segments=${randInt(5, 4000)} faults=${isErr ? randInt(1, 120) : randInt(0, 8)} throttles=${isThrottle ? randInt(1, 40) : randInt(0, 3)}`,
    `${dz(840)} [Info] Service map update applied nodes=${randInt(10, 220)} edges=${randInt(12, 360)} version=${randInt(1, 12)}`,
  ];
  const daemonText = Array.from({ length: randInt(3, 6) }, () => rand(daemonPool)).join("\n");
  const message = Math.random() < 0.65 ? `${daemonText}\n${segmentJson}` : segmentJson;

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
        start_time: startTime,
        end_time: endTime,
        origin: svc.origin,
        service: { name: svc.name, type: svc.awsType },
        duration: dur,
        fault: isErr,
        error: isClientErr,
        throttle: isThrottle,
        http: {
          request: { method, url, client_ip: clientIp, user_agent: userAgent },
          response: { status, content_length: randInt(50, 50000) },
        },
        aws: {
          account_id: acct.id,
          region,
          resource_names: [svc.name],
        },
        annotations: {
          environment: rand(["production", "staging"]),
          version: `v${randInt(1, 20)}.${randInt(0, 9)}.${randInt(0, 99)}`,
          team: rand(["platform", "backend", "frontend", "data"]),
        },
        ...(cause ? { cause } : {}),
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
          Latency: {
            avg: dur * 1000,
            p50: dur * 800,
            p90: dur * 1500,
            p95: dur * 2000,
            p99: dur * 3000,
          },
          OkCount: { sum: !isErr && !isClientErr && !isThrottle ? randInt(1, 10000) : 0 },
          ErrorCount: { sum: isClientErr ? randInt(1, 100) : 0 },
          FaultCount: { sum: isErr ? randInt(1, 50) : 0 },
          ThrottleCount: { sum: isThrottle ? randInt(1, 20) : 0 },
        },
      },
    },
    http: {
      request: { method, body: { bytes: randInt(0, 10000) } },
      response: { status_code: status, body: { bytes: randInt(50, 50000) } },
    },
    url: { path, full: url },
    user_agent: { original: userAgent },
    source: { ip: clientIp },
    event: {
      duration: Math.round(dur * 1e9),
      outcome: isErr || isClientErr ? "failure" : "success",
      category: ["network"],
      type: isErr ? ["connection", "denied"] : ["connection"],
      dataset: "aws.xray",
      provider: "xray.amazonaws.com",
    },
    message,
    log: { level: isErr ? "error" : isThrottle || isClientErr ? "warn" : "info" },
    ...(isErr && cause
      ? {
          error: {
            code: cause.exceptions[0].type,
            message: cause.exceptions[0].message,
            type: "trace",
            stack_trace: cause.exceptions[0].stack
              .map(
                (s: { label: string; path: string; line: number }) =>
                  `  at ${s.label} (${s.path}:${s.line})`
              )
              .join("\n"),
          },
        }
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
  const prNumber = randInt(1, 612);
  const prBranch = rand(["feature/auth-refresh", "fix/payments", "chore/deps", "feat/api-v2"]);
  const wfSteps = [
    "Checkout",
    "Install",
    "Lint",
    "UnitTests",
    "BuildImage",
    "PublishArtifacts",
  ] as const;
  const stepIdx = isErr ? randInt(1, wfSteps.length - 1) : wfSteps.length;
  const stepLine = wfSteps
    .slice(0, stepIdx)
    .map(
      (s, i) =>
        `[WorkflowRun:${workflowRunId}] step=${s} status=SUCCEEDED durationMs=${randInt(900, 180_000)} order=${i + 1}`
    )
    .join("\n");
  const failStep = isErr ? (wfSteps[stepIdx] ?? "BuildImage") : null;
  const prTrigger = Math.random() < 0.5;
  const devLifecycle =
    action === "CreateDevEnvironment" || action === "DeleteDevEnvironment"
      ? `${action} devEnvId=${devEnvId} statusTransition=${rand(["REQUESTED", "PROVISIONING", "READY", "STOPPING", "DELETED"])} machineType=${rand(["STANDARD", "PERFORMANCE"])}`
      : null;
  const msgLines = [
    `[CodeCatalyst] space=${spaceName} project=${projectName} workflow=${workflowName} run=${workflowRunId} status=${runStatus}`,
    prTrigger
      ? `[WorkflowRun] trigger=pull_request pr=#${prNumber} head=${prBranch} base=main sha=${randId(40).toLowerCase()}`
      : `[WorkflowRun] trigger=${rand(["push", "schedule", "manual"])} ref=${rand(["refs/heads/main", "refs/heads/develop"])}`,
    stepLine,
    isErr && failStep
      ? `[WorkflowRun:${workflowRunId}] step=${failStep} status=FAILED exitCode=${randInt(1, 127)}`
      : null,
    devLifecycle,
    !isErr && runStatus === "SUCCEEDED"
      ? `[WorkflowRun:${workflowRunId}] completed artifacts=${rand(["codecatalyst://artifacts/pkg", "s3://codecatalyst-artifacts/"])}${workflowRunId}`
      : null,
  ].filter((l): l is string => Boolean(l));
  const message = isErr
    ? `${msgLines.join("\n")}\nCodeCatalyst ${action} FAILED: ${rand(["Workflow run failed", "Dev environment error", "Branch conflict", "Quota exceeded"])}`
    : msgLines.join("\n");
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
        workflow_steps_completed: isErr ? stepIdx : wfSteps.length,
        pull_request_number: prTrigger ? prNumber : null,
        pull_request_head_branch: prTrigger ? prBranch : null,
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
    message,
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
