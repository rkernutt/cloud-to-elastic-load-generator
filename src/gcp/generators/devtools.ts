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
  HTTP_METHODS,
} from "./helpers.js";

function hexSha8(): string {
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function generateCloudBuildLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const buildId = `${randId(8).toLowerCase()}-${randId(4).toLowerCase()}-${randId(4).toLowerCase()}`;
  const triggerName = `trigger-${rand(["main", "release", "nightly", "pr"])}`;
  const sourceRepo = `github.com/${project.id.split("-")[0]}/${rand(["api", "web", "infra"])}`;
  const branch = rand(["main", "develop", "release/1.4", `feature/${randId(4).toLowerCase()}`]);
  const commitSha = hexSha8();
  const stepName = rand(["fetch", "docker_build", "run_tests", "push_images", "deploy_manifest"]);
  const status = isErr ? rand(["FAILURE", "TIMEOUT", "QUEUED"]) : rand(["QUEUED", "WORKING", "SUCCESS"]);
  const buildDurationSeconds = isErr ? randInt(30, 2400) : randInt(120, 3600);
  const imagesBuilt = isErr ? randInt(0, 1) : randInt(1, 6);
  const machineType = rand(["E2_MEDIUM", "E2_HIGHCPU_8", "N1_HIGHCPU_32"] as const);
  const message = isErr
    ? `Cloud Build ${buildId} ${status} at step "${stepName}": ${rand(["Step exited with code 1", "Docker push denied", "Test suite failed", "Build timeout"])}`
    : `Cloud Build ${buildId} ${status} for ${branch}@${commitSha} (${imagesBuilt} images, ${buildDurationSeconds}s on ${machineType})`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloudbuild.googleapis.com"),
    gcp: {
      cloud_build: {
        build_id: buildId,
        trigger_name: triggerName,
        source_repo: sourceRepo,
        branch,
        commit_sha: commitSha,
        step_name: stepName,
        status,
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
  const message = isErr
    ? `Cloud Deploy rollout ${rolloutId} failed in ${phase} for ${targetName}: ${rand(["Health check failed", "Canary analysis rejected release", "Verification timeout"])}`
    : `Cloud Deploy ${releaseName} ${status} — ${phase} on target ${targetName} (approval=${approvalState})`;

  return {
    "@timestamp": ts,
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
  };
}

export function generateSourceRepositoriesLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const repoName = `${rand(["api", "frontend", "terraform", "libs"])}-repo`;
  const eventType = rand(["PUSH", "PULL", "CREATE_BRANCH", "DELETE_BRANCH", "CREATE_TAG"] as const);
  const refName = rand(["refs/heads/main", "refs/heads/develop", `refs/heads/feature/${randId(4)}`, `refs/tags/v${randInt(1, 9)}.${randInt(0, 20)}.${randInt(0, 9)}`]);
  const authorEmail = rand([`dev@${project.id}.example.com`, `ci@${project.id}.example.com`]);
  const commitCount = randInt(1, isErr ? 1 : 25);
  const filesChanged = isErr ? 0 : randInt(1, 200);
  const message = isErr
    ? `Source Repositories ${eventType} rejected on ${repoName}: ${rand(["Hook validation failed", "Protected branch", "Permission denied"])}`
    : `Source Repositories ${eventType} on ${refName} by ${authorEmail} (${commitCount} commits, ${filesChanged} files)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "sourcerepo.googleapis.com"),
    gcp: {
      source_repositories: {
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
  const message = isErr
    ? `Firebase ${eventType} failed for ${resource} (${platform}): ${rand(["Permission denied", "Invalid rules syntax", "Function deploy error"])}`
    : `Firebase ${eventType} ${status} for app ${appId} — ${resource} ${version}`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Cloud Endpoints ${apiMethod} ${apiVersion} returned ${responseCode} (${latencyMs}ms): ${rand(["Invalid API key", "Quota exceeded", "Backend unavailable"])}`
    : `Cloud Endpoints ${serviceName} ${apiMethod} ${responseCode} in ${latencyMs}ms (consumer=${consumerProject.id}, api_key=${apiKeyUsed})`;

  return {
    "@timestamp": ts,
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
  const policyName = rand(["SpikeArrest", "VerifyJWT", "JSONThreatProtection", "Quota", "AssignMessage"]);
  const policyFault = isErr ? rand(["JWT expired", "Spike arrest violated", "JSONThreatProtection.BodyTooLarge", "Invalid client_id"]) : "";
  const message = isErr
    ? `Apigee proxy ${apiProxy} r${revision} fault on ${policyName}: ${policyFault} (${responseCode}, ${latencyMs}ms)`
    : `Apigee ${verb} ${path} via ${apiProxy} (${environment}) ${responseCode} in ${latencyMs}ms [${developerApp}]`;

  return {
    "@timestamp": ts,
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
  const message = isErr
    ? `Cloud Shell ${sessionId} ${eventType} failed (${shellType}): ${rand(["Disk full", "Session timeout", "Quota exceeded"])}`
    : `Cloud Shell ${sessionId} ${eventType} on ${machineType} (${shellType}, ${storageUsedMb}MB used)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "cloud-shell"),
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
  const message = isErr
    ? `Gemini Code Assist ${action} failed in ${editor} (${language}): upstream error`
    : `Gemini Code Assist ${action} ${language} in ${editor} accepted=${accepted} tokens=${tokensGenerated} (${latencyMs.toFixed(1)}ms)`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "gemini-code-assist"),
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
  const message = isErr
    ? `API Gateway ${gatewayName} ${method} ${path} -> ${responseCode} (${latencyMs.toFixed(1)}ms)`
    : `API Gateway ${gatewayName} ${method} ${path} ${responseCode} consumer=${consumerProject}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "api-gateway"),
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
  };
}
