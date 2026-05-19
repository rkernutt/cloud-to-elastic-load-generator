/**
 * GCP developer tools log generators (Cloud Build, Deploy, Source Repos, Firebase, Endpoints, Apigee).
 */

import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  gcpCloud,
  makeGcpSetup,
  randProject,
  randHttpStatus,
  randLatencyMs,
  randSeverity,
  HTTP_METHODS,
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
  INTERNAL: "Cloud Build orchestration internal error",
  DEADLINE_EXCEEDED: "Build or source operation exceeded deadline",
  PERMISSION_DENIED: "Missing cloudbuild.builds.* or repos scope",
  RESOURCE_EXHAUSTED: "Build concurrency / worker pool exhausted",
  NOT_FOUND: "Build, repo, ref, or object not found",
  ALREADY_EXISTS: "Branch or repo already exists",
  UNAVAILABLE: "Build worker or SCM bridge unavailable",
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

function hexSha8(): string {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function generateCloudBuildLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const buildId = `${randId(8).toLowerCase()}-${randId(4).toLowerCase()}-${randId(4).toLowerCase()}`;
  const triggerId = `trigger-${rand(["main", "release", "nightly", "pr"])}-${randId(6).toLowerCase()}`;
  const bucket = `${project.id}_cloudbuild`;
  const objectPath = `source/${randId(10).toLowerCase()}.tgz`;
  const source = `gs://${bucket}/${objectPath}`;
  const sourceRepo = `github.com/${project.id.split("-")[0]}/${rand(["api", "web", "infra"])}`;
  const branch = rand(["main", "develop", "release/1.4", `feature/${randId(4).toLowerCase()}`]);
  const commitSha = hexSha8();
  const stepNames = [
    "gcr.io/cloud-builders/git",
    "gcr.io/cloud-builders/docker",
    "gcr.io/cloud-builders/gcloud",
    "gcr.io/kaniko-project/executor:latest",
    "bash",
    "maven:3.9-eclipse-temurin-17",
    "gcr.io/cloud-builders/golang",
  ];
  const steps = randInt(3, 8);
  const currentStep = randInt(0, steps - 1);
  const stepImage = rand(stepNames);
  const stepDurationSec = randInt(5, 180);

  const BUILD_STORIES = [
    "builds_create",
    "builds_get",
    "builds_cancel",
    "builds_approve",
    "step_advanced",
    "webhook_trigger",
  ] as const;
  const story = rand(BUILD_STORIES);

  let status = "BUILD_WORKING";
  let message = "";
  let apiMethod = `cloudbuild.googleapis.com/v1/projects/${project.id}/builds`;

  if (story === "builds_create") {
    apiMethod = `cloudbuild.googleapis.com/v1/projects/${project.id}/builds`;
    status = isErr ? "BUILD_FAILURE" : "BUILD_QUEUED";
    message = isErr
      ? `CreateBuild FAILED INVALID_ARGUMENT: substitutions key ${rand(["_TAG", "_ENV"])} reserved`
      : `CreateBuild accepted build_id=${buildId} machineType=${rand(["E2_HIGHCPU_8", "E2_MEDIUM"])}`;
  } else if (story === "builds_get") {
    apiMethod = `cloudbuild.googleapis.com/v1/projects/${project.id}/builds/${buildId}`;
    status = isErr ? "BUILD_FAILURE" : "BUILD_SUCCESS";
    message = isErr
      ? `GetBuild FAILED NOT_FOUND id=${buildId}`
      : `GetBuild ${buildId} logUrl=… status=${status}`;
  } else if (story === "builds_cancel") {
    apiMethod = `cloudbuild.googleapis.com/v1/projects/${project.id}/builds/${buildId}:cancel`;
    status = "CANCELLED";
    message = isErr
      ? `CancelBuild FAILED FAILED_PRECONDITION (already terminal)`
      : `CancelBuild OK build_id=${buildId} reason=user_requested`;
  } else if (story === "builds_approve") {
    apiMethod = `cloudbuild.googleapis.com/v1/projects/${project.id}/builds/${buildId}:approve`;
    status = isErr ? "BUILD_FAILURE" : "BUILD_WORKING";
    message = isErr
      ? `Manual approval DENIED — build failed policy check`
      : `Manual approval GRANTED by ${rand(["security@…", "release-mgr@…"])}`;
  } else if (story === "step_advanced") {
    status = isErr ? "BUILD_FAILURE" : "BUILD_WORKING";
    const stepKind = rand(["maven", "secret", "parallel", "docker_push", "go_test"] as const);
    apiMethod = `cloudbuild.googleapis.com/v1/projects/${project.id}/builds/${buildId}#step${currentStep}`;
    if (stepKind === "maven") {
      message = isErr
        ? `Step #${currentStep} "maven": [ERROR] Failed to execute goal test — exit 1`
        : `Step #${currentStep} "maven": BUILD SUCCESS module=svc-api`;
    } else if (stepKind === "secret") {
      message = isErr
        ? `Step #${currentStep} "bash": secretManager: access denied on projects/…/secrets/${randId(6)}/versions/latest`
        : `Step #${currentStep} "bash": Mounted secret env=MAVEN_SETTINGS length=${randInt(200, 4000)}`;
    } else if (stepKind === "parallel") {
      message = isErr
        ? `Step #${currentStep}-${currentStep + 1} parallel: one shard timed out — DEADLINE_EXCEEDED`
        : `Parallel steps #${currentStep}-#${currentStep + 2} fanout=${randInt(2, 6)} ok`;
    } else if (stepKind === "docker_push") {
      message = isErr
        ? `ERROR: denied: Permission "artifactregistry.repositories.uploadArtifacts" denied on resource`
        : `Pushing gcr.io/${project.id}/svc:${commitSha}\nLayer ${hexSha8()}: Pushing [=====>     ] ${randInt(10, 90)}%`;
    } else {
      message = isErr
        ? `Step #${currentStep} "go test": --- FAIL: TestCheckoutParallel (timeout)`
        : `Step #${currentStep} "go test": ok  \tgithub.com/${project.id}/svc\t${stepDurationSec}s`;
    }
  } else {
    apiMethod = `cloudbuild.googleapis.com/v1/projects/${project.id}/triggers/${triggerId}:run`;
    status = "BUILD_WORKING";
    message = `GitHub webhook received: event=push repo=${sourceRepo} ref=refs/heads/${branch}; matched trigger "${triggerId}" starting build ${buildId}`;
  }

  const imagesBuilt = isErr ? randInt(0, 1) : randInt(1, 6);
  const machineType = rand(["E2_MEDIUM", "E2_HIGHCPU_8", "N1_HIGHCPU_32"] as const);
  const buildDurationSeconds = isErr ? randInt(30, 2400) : randInt(120, 3600);
  const stepList = Array.from(
    { length: Math.min(steps, 5) },
    (_, i) => stepNames[i % stepNames.length]!
  );
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      build_id: buildId,
      build_trigger_id: triggerId,
      project_id: project.id,
      api_method: apiMethod,
      build_story: story,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloudbuild.googleapis.com"),
    gcp: {
      cloud_build: {
        story,
        api_method: apiMethod,
        build_id: buildId,
        project_id: project.id,
        status,
        source,
        trigger_id: triggerId,
        steps: stepList,
        trigger_name: triggerId,
        source_repo: sourceRepo,
        branch,
        commit_sha: commitSha,
        step_name: stepImage,
        build_duration_seconds: buildDurationSeconds,
        images_built: imagesBuilt,
        machine_type: machineType,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: buildDurationSeconds * 1000,
    },
    message,
    ...faultSpread,
  };
}

export function generateCloudDeployLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const targetName = rand(["dev", "staging", "production"] as const);
  const needsApproval = targetName === "production" && Math.random() < 0.4;
  const approvalState = needsApproval
    ? rand(["NEEDS_APPROVAL", "APPROVED", "REJECTED"] as const)
    : rand(["APPROVED", "APPROVED", "APPROVED"]);
  const phase = rand(["DEPLOY", "VERIFY", "POSTDEPLOY"] as const);
  const status = isErr ? rand(["FAILED", "ABORTED"]) : rand(["SUCCEEDED", "RUNNING"]);
  const pipelineName = `pipeline-${rand(["api", "web", "batch"])}`;
  const releaseName = `rel-${randId(6).toLowerCase()}`;
  const rolloutId = `rollout-${randId(10).toLowerCase()}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `clouddeploy.googleapis.com: Rollout ${rolloutId} FAILED phase=${phase} target=${targetName}: ${rand(["Cloud Run health check failed", "Canary metrics rejected release", "Verification job timeout"])}`
    : `Rollout ${rolloutId} ${status} release=${releaseName} pipeline=${pipelineName} phase=${phase} target=${targetName} approval_state=${targetName === "production" ? approvalState : "N/A"}`;

  const grpcFault = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "clouddeploy.googleapis.com/Rollout",
      rollout: rolloutId,
      api_method: `clouddeploy.googleapis.com/v1/projects/${project.id}/locations/${region}/rollouts/${rolloutId}`,
      ...grpcFault.rpcLabel,
    },
    cloud: gcpCloud(region, project, "clouddeploy.googleapis.com"),
    gcp: {
      cloud_deploy: {
        pipeline_name: pipelineName,
        release_name: releaseName,
        target_name: targetName,
        rollout_id: rolloutId,
        phase,
        status,
        approval_state: targetName === "production" ? approvalState : "N/A",
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(5000, isErr ? 900_000 : 600_000),
    },
    message,
    ...grpcFault.spread,
  };
}

export function generateSourceRepositoriesLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const repoName = `${rand(["api", "frontend", "terraform", "libs"])}-repo`;
  const refName = rand([
    "refs/heads/main",
    "refs/heads/develop",
    `refs/heads/feature/${randId(4)}`,
    `refs/tags/v${randInt(1, 9)}.${randInt(0, 20)}.${randInt(0, 9)}`,
  ]);
  const authorEmail = rand([`dev@${project.id}.example.com`, `ci@${project.id}.example.com`]);
  const commitCount = randInt(1, isErr ? 1 : 25);
  const filesChanged = isErr ? 0 : randInt(1, 200);

  const SCENARIOS = [
    "repos_create",
    "repos_get",
    "repos_fetch",
    "repos_batch_create_refs",
    "repos_sync",
    "objects_batch_get",
  ] as const;
  const scenario = rand(SCENARIOS);

  let eventType = rand(["PUSH", "PULL", "CREATE_BRANCH", "DELETE_BRANCH", "CREATE_TAG"] as const);
  let apiMethod = "";
  let message = "";

  const repoParent = `projects/${project.id}/repos/${repoName}`;

  if (scenario === "repos_create") {
    eventType = rand(["CREATE_BRANCH", "PULL"]);
    apiMethod = `sourcerepo.googleapis.com/v1/projects/${project.id}/repos`;
    message = isErr
      ? `CreateRepo FAILED ${repoName}: ALREADY_EXISTS`
      : `CreateRepo LRO completed mirror_config=none`;
  } else if (scenario === "repos_get") {
    apiMethod = `sourcerepo.googleapis.com/v1/${repoParent}`;
    eventType = "PULL";
    message = isErr
      ? `GetRepo FAILED NOT_FOUND`
      : `GetRepo ${repoName} size_bytes=${randInt(1e6, 5e8)}`;
  } else if (scenario === "repos_fetch") {
    apiMethod = `sourcerepo.googleapis.com/v1/${repoParent}:fetch`;
    eventType = rand(["PULL", "PUSH"]);
    message = isErr
      ? `FetchRefs FAILED packfile timeout — DEADLINE_EXCEEDED`
      : `FetchRefs want=${refName} negotiated_common=${randInt(0, 40)}`;
  } else if (scenario === "repos_batch_create_refs") {
    apiMethod = `sourcerepo.googleapis.com/v1/${repoParent}:batchCreateRefs`;
    eventType = "CREATE_BRANCH";
    message = isErr
      ? `batchCreateRefs FAILED non-fast-forward protected ${refName}`
      : `batchCreateRefs inserted ${randInt(1, 12)} refs`;
  } else if (scenario === "repos_sync") {
    apiMethod = `sourcerepo.googleapis.com/v1/${repoParent}:sync`;
    eventType = rand(["PUSH", "PULL"]);
    message = isErr
      ? `Sync mirror FAILED upstream UNAVAILABLE`
      : `Sync repo ${repoName} rev=${hexSha8()}${hexSha8()}`;
  } else {
    apiMethod = `sourcerepo.googleapis.com/v1/${repoParent}/objects:batchGet`;
    eventType = rand(["PUSH", "PULL"]);
    message = isErr
      ? `objects.batchGet FAILED unknown object ${hexSha8()} NOT_FOUND`
      : `objects.batchGet blobs=${randInt(1, 80)} total_bytes=${randInt(4_000, 9_000_000)}`;
  }

  if (
    !isErr &&
    (scenario === "repos_batch_create_refs" ||
      scenario === "repos_fetch" ||
      scenario === "repos_get" ||
      scenario === "repos_sync")
  ) {
    message = `git receive-pack: ${eventType} ${refName} by ${authorEmail} (+${commitCount} commits, ${filesChanged} files) repo=${repoName}`;
  }
  if (isErr && (scenario === "repos_batch_create_refs" || scenario === "repos_fetch")) {
    message = `sourcerepo.googleapis.com: ${eventType} rejected on ${repoParent}: ${rand(["Hook validation failed", "Protected branch update denied", "Permission denied"])}`;
  }

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);
  const severity = randSeverity(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "sourcerepo.googleapis.com/Repo",
      repository: repoName,
      api_method: apiMethod,
      source_repo_scenario: scenario,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "sourcerepo.googleapis.com"),
    gcp: {
      source_repositories: {
        scenario,
        api_method: apiMethod,
        repo_name: repoName,
        event_type: eventType,
        ref_name: refName,
        author_email: authorEmail,
        commit_count: commitCount,
        files_changed: filesChanged,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(100, 8000),
    },
    message,
    ...faultSpread,
  };
}

export function generateFirebaseLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const platform = rand(["ios", "android", "web"] as const);
  const numeric = randInt(100000000, 999999999);
  const appId =
    platform === "web"
      ? `1:${numeric}:web:${randId(8).toLowerCase()}`
      : platform === "android"
        ? `1:${numeric}:android:${randId(8).toLowerCase()}`
        : `1:${numeric}:ios:${randId(8).toLowerCase()}`;
  const eventType = rand([
    "DEPLOY",
    "HOSTING_RELEASE",
    "RULES_PUBLISH",
    "FUNCTION_DEPLOY",
    "AUTH_EVENT",
  ] as const);
  const resource = rand(["hosting", "firestore.rules", "functions:api", "auth", "remoteconfig"]);
  const status = isErr ? rand(["FAILED", "ROLLED_BACK"]) : rand(["SUCCESS", "IN_PROGRESS"]);
  const version = `v${randInt(1, 40)}.${randInt(0, 30)}.${randInt(0, 99)}`;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `firebase.googleapis.com: ${eventType} FAILED for ${resource} app=${appId}: ${rand(["PERMISSION_DENIED on bucket", "Firestore rules compile error", "Cloud Functions deployment error"])}`
    : `[Hosting] Release ${version} ${status} for site=${project.id} app=${appId} resource=${resource}`;

  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "firebase.googleapis.com/Project",
      "firebase.app": appId,
      api_method: `firebase.googleapis.com/v1/projects/${project.id}/operations`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "firebase.googleapis.com"),
    gcp: {
      firebase: {
        app_id: appId,
        platform,
        event_type: eventType,
        resource,
        status,
        version,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 120_000 : 45_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateCloudEndpointsLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const consumerProject = randProject();
  const responseCode = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(15, 400), isErr);
  const serviceName = `${rand(["catalog", "orders", "users"])}.endpoints.${project.id}.cloud.goog`;
  const apiMethod = rand(["GET", "POST", "PUT", "DELETE"] as const);
  const apiVersion = rand(["v1", "v1alpha", "v2"]);
  const requestSizeBytes = randInt(120, 2_000_000);
  const apiKeyUsed = Math.random() < 0.65;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `endpoints.googleapis.com: ${apiMethod} /${apiVersion}/… ${responseCode} consumer_project=${consumerProject.id} latency_ms=${latencyMs} error_type=${rand(["API_KEY_INVALID", "QUOTA_EXCEEDED", "BACKEND_ERROR"])}`
    : `ESPv2: ${apiMethod} ${apiVersion} ${responseCode} service=${serviceName} latency_ms=${latencyMs} request_bytes=${requestSizeBytes} api_key=${apiKeyUsed ? "present" : "absent"} consumer=${consumerProject.id}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "api.googleapis.com/Service",
      service: serviceName,
      api_method: `servicemanagement.googleapis.com/v1/services/${serviceName}/configs/${apiVersion}:get`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "endpoints.googleapis.com"),
    gcp: {
      cloud_endpoints: {
        service_name: serviceName,
        api_method: apiMethod,
        api_version: apiVersion,
        consumer_project: consumerProject.id,
        response_code: responseCode,
        latency_ms: latencyMs,
        request_size_bytes: requestSizeBytes,
        api_key_used: apiKeyUsed,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
    ...faultSpread,
  };
}

export function generateApigeeLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const orgName = `${project.id.split("-")[0]}-apigee`;
  const environment = rand(["dev", "test", "prod"] as const);
  const apiProxy = rand(["payments-api", "inventory-api", "partner-gateway"]);
  const revision = String(randInt(1, 120));
  const verb = rand(["GET", "POST", "PUT", "DELETE"] as const);
  const path = rand(["/v1/orders", "/v2/items", "/oauth/token", "/webhooks/stripe"]);
  const responseCode = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(20, 900), isErr);
  const developerApp = `app-${randId(6).toLowerCase()}`;
  const policyName = rand([
    "SpikeArrest",
    "VerifyJWT",
    "JSONThreatProtection",
    "Quota",
    "AssignMessage",
  ]);
  const policyFault = isErr
    ? rand([
        "JWT expired",
        "Spike arrest violated",
        "JSONThreatProtection.BodyTooLarge",
        "Invalid client_id",
      ])
    : "";
  const severity = randSeverity(isErr);
  const message = isErr
    ? `apigee.googleapis.com: proxy=${apiProxy} rev=${revision} env=${environment} fault_flow_name=${policyName} fault_string="${policyFault}" response_code=${responseCode} total_latency_ms=${latencyMs}`
    : `${verb} ${path} apigee_proxy=${apiProxy} env=${environment} response_code=${responseCode} client_id=${developerApp} total_ms=${latencyMs}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "apigee.googleapis.com/Environment",
      proxy: apiProxy,
      environment,
      api_method: `apigee.googleapis.com/v1/organizations/${orgName}/apis/${apiProxy}/revisions/${revision}:deploy`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "apigee.googleapis.com"),
    gcp: {
      apigee: {
        org_name: orgName,
        environment,
        api_proxy: apiProxy,
        revision,
        verb,
        path,
        response_code: responseCode,
        latency_ms: latencyMs,
        developer_app: developerApp,
        policy_name: policyName,
        policy_fault: policyFault || null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
    ...faultSpread,
  };
}

export function generateCloudShellLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const sessionId = `cloudshell-${randId(12).toLowerCase()}`;
  const machineType = rand(["e2-small", "e2-medium", "n1-standard-1"] as const);
  const eventType = rand([
    "SESSION_START",
    "SESSION_END",
    "FILE_UPLOAD",
    "FILE_DOWNLOAD",
    "COMMAND_EXEC",
  ] as const);
  const shellType = rand(["bash", "zsh"] as const);
  const storageUsedMb = isErr ? randInt(4800, 5120) : randInt(50, 4000);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudshell.googleapis.com: ${eventType} session=${sessionId} FAILED: ${rand(["Disk quota exceeded on /home", "Session idle timeout", "User environment provisioning error"])}`
    : `Cloud Shell ${eventType}: session=${sessionId} machine=${machineType} shell=${shellType} disk_used_mb=${storageUsedMb}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudshell.googleapis.com/UserEnvironment",
      session_id: sessionId,
      api_method: `cloudshell.googleapis.com/v1/users/me/environments/default:start`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloudshell.googleapis.com"),
    gcp: {
      cloud_shell: {
        session_id: sessionId,
        machine_type: machineType,
        event_type: eventType,
        shell_type: shellType,
        storage_used_mb: storageUsedMb,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: randInt(500, isErr ? 60_000 : 15_000),
    },
    message,
    ...faultSpread,
  };
}

export function generateGeminiCodeAssistLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const editor = rand(["vscode", "jetbrains", "cloud-shell"] as const);
  const action = rand(["COMPLETION", "CHAT", "CODE_REVIEW", "TRANSFORMATION"] as const);
  const language = rand(["typescript", "python", "go", "java", "terraform"]);
  const accepted = !isErr && Math.random() > 0.35;
  const latencyMs = randLatencyMs(randInt(80, 1200), isErr);
  const tokensGenerated = isErr ? randInt(0, 50) : randInt(20, 2048);
  const severity = randSeverity(isErr);
  const message = isErr
    ? `cloudaicompanion.googleapis.com: ${action} request FAILED editor=${editor} language=${language}: upstream UNAVAILABLE`
    : `Code Assist ${action}: language=${language} editor=${editor} latency_ms=${latencyMs.toFixed(1)} suggestion_accepted=${accepted} generated_tokens=${tokensGenerated}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "cloudaicompanion.googleapis.com/Request",
      editor,
      language,
      api_method: `cloudaicompanion.googleapis.com/v1/projects/${project.id}/inlineCompletion:generate`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "cloudaicompanion.googleapis.com"),
    gcp: {
      gemini_code_assist: {
        editor,
        action,
        language,
        accepted,
        latency_ms: latencyMs,
        tokens_generated: tokensGenerated,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
    ...faultSpread,
  };
}

export function generateApiGatewayLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const gatewayName = `gw-${rand(["public", "internal", "partner"])}-${randId(4).toLowerCase()}`;
  const apiConfig = `configs/${randId(8).toLowerCase()}`;
  const method = rand(HTTP_METHODS);
  const path = rand(["/v1/users", "/v2/orders", "/health", "/webhooks/stripe"]);
  const responseCode = randHttpStatus(isErr);
  const latencyMs = randLatencyMs(randInt(12, 400), isErr);
  const apiKey = isErr ? "" : `AIza${randId(28)}`;
  const consumerProject = randProject().id;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `apigateway.googleapis.com: ${method} ${path} gateways/${gatewayName} -> ${responseCode} latency_ms=${latencyMs.toFixed(1)} reason=${rand(["API_KEY_INVALID", "BACKEND_TIMEOUT", "UNAUTHENTICATED"])}`
    : `API Gateway ${gatewayName}: ${method} ${path} ${responseCode} backend_latency_ms=${latencyMs.toFixed(1)} consumer_project=${consumerProject}`;
  const { spread: faultSpread, rpcLabel } = grpcStructuredFault(isErr);

  return {
    "@timestamp": ts,
    severity,
    log: { level: severity.toLowerCase() },
    labels: {
      "resource.type": "apigateway.googleapis.com/Gateway",
      gateway: gatewayName,
      api_method: `apigateway.googleapis.com/v1/projects/${project.id}/locations/${region}/gateways/${gatewayName}:report`,
      ...rpcLabel,
    },
    cloud: gcpCloud(region, project, "apigateway.googleapis.com"),
    gcp: {
      api_gateway: {
        gateway_name: gatewayName,
        api_config: apiConfig,
        method,
        path,
        response_code: responseCode,
        latency_ms: latencyMs,
        api_key: apiKey || null,
        consumer_project: consumerProject,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: latencyMs,
    },
    message,
    ...faultSpread,
  };
}
