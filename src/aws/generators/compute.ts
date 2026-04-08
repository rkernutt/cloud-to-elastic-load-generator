import { rand, randInt, randFloat, randId, randIp, randAccount, REGIONS } from "../../helpers";
import type { EcsDocument } from "./types.js";

function generateEc2Log(ts, er) {
  const region = rand(REGIONS);
  const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const instanceType = rand(["t3.medium", "m5.xlarge", "c5.2xlarge", "r5.large"]);
  const CPU_CORES = { "t3.medium": 2, "m5.xlarge": 4, "c5.2xlarge": 8, "r5.large": 2 };
  const cpuCores = CPU_CORES[instanceType];
  const MSGS = {
    error: [
      "kernel: EXT4-fs error (device xvda1): ext4_validate_block_bitmap: bg 0: bad block bitmap checksum",
      "systemd: Failed to start Amazon SSM Agent.",
      "kernel: Out of memory: Killed process",
      "sshd: error: Could not load host key",
      "Failed to start NetworkManager",
      "disk I/O error on /dev/xvda1",
    ],
    warn: [
      "CPU steal time above threshold: 23%",
      "High disk utilization: 88% full",
      "Memory available below 512MB",
      "SSH login from unknown IP",
    ],
    info: [
      "cloud-init: Cloud-init v. 22.2.2 running 'init-local'",
      "systemd: Started Amazon SSM Agent.",
      "kernel: [    0.000000] Linux version 5.10.68-62.173.amzn2.x86_64",
      "sshd: Accepted publickey for ec2-user",
      "cloud-init: modules done",
      "awslogs: Starting daemon",
    ],
  };
  const EC2_ERROR_CODES = [
    "InsufficientInstanceCapacity",
    "InstanceNotFound",
    "InvalidParameterValue",
    "AuthFailure",
    "UnauthorizedOperation",
    "InvalidInstanceID.NotFound",
    "InsufficientAddressCapacity",
    "InvalidAMIID.NotFound",
    "InvalidKeyPair.NotFound",
  ];
  const isErr = level === "error";
  const cpuPct = Number(randFloat(1, isErr ? 99 : 70));
  const durationSec = randInt(60, 3600);
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        instanceId,
        instanceType,
        level,
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
        component: rand(["syslog", "cloud-init", "sshd", "awslogs"]),
      })
    : plainMessage;
  const eventType = isErr
    ? ["error"]
    : level === "warn"
      ? ["info"]
      : level === "info" && plainMessage.includes("Started")
        ? ["change"]
        : ["info"];
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "ec2" },
      instance: { id: instanceId },
    },
    aws: {
      dimensions: {
        InstanceId: instanceId,
        InstanceType: instanceType,
        ImageId: `ami-${randId(8).toLowerCase()}`,
        AutoScalingGroupName: rand(["web-asg", "api-asg", "worker-asg", null]),
      },
      ec2: {
        instance: {
          image: { id: `ami-${randId(8).toLowerCase()}` },
          state: { name: isErr ? rand(["stopping", "stopped"]) : "running", code: isErr ? 64 : 16 },
          monitoring: { state: rand(["disabled", "enabled"]) },
          core: { count: cpuCores },
          type: instanceType,
          threads_per_core: 2,
          private: {
            ip: randIp(),
            dns_name: `ip-${randIp().replace(/\./g, "-")}.${rand(REGIONS)}.compute.internal`,
          },
          public: {
            ip: randIp(),
            dns_name: `ec2-${randIp().replace(/\./g, "-")}.compute-1.amazonaws.com`,
          },
        },
        cpu: {
          total: { pct: parseFloat((cpuPct / 100).toFixed(4)) },
          credit_usage: Number(randFloat(0, 5)),
          credit_balance: Number(randFloat(10, 500)),
          surplus_credit_balance: 0,
          surplus_credits_charged: 0,
        },
        network: {
          in: {
            bytes: randInt(1000, 1e9),
            bytes_per_sec: Number(randFloat(0, 1e6)),
            packets: randInt(100, 1e6),
            packets_per_sec: Number(randFloat(0, 10000)),
          },
          out: {
            bytes: randInt(1000, 1e9),
            bytes_per_sec: Number(randFloat(0, 1e6)),
            packets: randInt(100, 1e6),
            packets_per_sec: Number(randFloat(0, 10000)),
          },
        },
        diskio: {
          read: {
            bytes: randInt(0, 1e9),
            bytes_per_sec: Number(randFloat(0, 1e6)),
            count: randInt(0, 10000),
            count_per_sec: Number(randFloat(0, 1000)),
          },
          write: {
            bytes: randInt(0, 1e9),
            bytes_per_sec: Number(randFloat(0, 1e6)),
            count: randInt(0, 10000),
            count_per_sec: Number(randFloat(0, 1000)),
          },
        },
        status: {
          check_failed: isErr ? 1 : 0,
          check_failed_system: 0,
          check_failed_instance: isErr ? 1 : 0,
        },
      },
    },
    host: {
      hostname: `ip-${randIp().replace(/\./g, "-")}`,
      os: {
        type: "linux",
        kernel: `5.10.${randInt(100, 230)}-${randInt(1, 200)}.amzn2.x86_64`,
        version: rand(["2", "2023"]),
      },
      architecture: rand(["x86_64", "arm64"]),
      cpu: { count: cpuCores * 2, usage: cpuPct / 100 },
      disk: { read: { bytes: randInt(0, 1e9) }, write: { bytes: randInt(0, 1e9) } },
      network: { ingress: { bytes: randInt(1000, 1e9) }, egress: { bytes: randInt(1000, 1e9) } },
    },
    log: { level },
    event: {
      category: ["host", "process"],
      type: eventType,
      outcome: isErr ? "failure" : "success",
      dataset: "aws.ec2",
      provider: "ec2.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    ...(isErr
      ? { error: { code: rand(EC2_ERROR_CODES), message: rand(MSGS.error), type: "host" } }
      : {}),
  };
}

function generateEcsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const svc = rand(["web-frontend", "api-backend", "worker", "scheduler", "auth-service"]);
  const cluster = rand(["prod-cluster", "staging", "workers"]);
  const level = Math.random() < er ? "error" : Math.random() < 0.15 ? "warn" : "info";
  const isErr = level === "error";
  const cpuPct = Number(randFloat(1, isErr ? 99 : 70));
  const memReservation = Number(randFloat(20, 70));
  const memPct = Number(randFloat(10, Math.min(memReservation, isErr ? 99 : 80)));
  const MSGS = {
    error: [
      "Container exited with code 1",
      "OOMKilled",
      "Health check failed",
      "Failed to pull image",
    ],
    warn: ["High memory: 85%", "Slow response", "Retry 2/3", "Connection pool exhausted"],
    info: ["Task started", "Health check passed", "Request processed", "Scaling event triggered"],
  };
  const ECS_ERROR_CODES = [
    "ClusterContainsContainerInstances",
    "ClusterContainsServices",
    "ClusterContainsTasks",
    "ClusterNotFoundException",
    "InvalidParameterException",
    "MissingVersionException",
    "NoUpdateAvailableException",
    "PlatformTaskDefinitionIncompatibilityException",
    "PlatformUnknownException",
    "ResourceNotFoundException",
    "ServiceNotActiveException",
    "ServiceNotFoundException",
    "TaskDefinitionFamilyExistsException",
    "UnsupportedFeatureException",
    "UpdateInProgressException",
  ];
  const durationSec = randInt(5, isErr ? 300 : 3600);
  const taskId = randId(32).toLowerCase();
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging
    ? JSON.stringify({
        cluster,
        service: svc,
        taskId,
        container: svc,
        level,
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
      service: { name: "ecs" },
    },
    aws: {
      dimensions: { ClusterName: cluster, ServiceName: svc },
      ecs: {
        metrics: {
          CPUUtilization: { avg: cpuPct },
          CPUReservation: { avg: Number(randFloat(10, 80)) },
          MemoryUtilization: { avg: memPct },
          MemoryReservation: { avg: memReservation },
          GPUReservation: { avg: 0 },
        },
      },
    },
    container: {
      id: randId(12).toLowerCase(),
      name: svc,
      image: {
        name: `${rand(["nginx", "node", "python", "java", "golang"])}:${rand(["latest", "alpine", "1.24", "18-alpine", "3.11"])}`,
        tag: rand(["latest", "alpine", "1.24"]),
      },
      runtime: "docker",
    },
    process: { pid: randInt(1, 65535), name: svc },
    log: { level },
    event: {
      category: ["process", "container"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.ecs",
      provider: "ecs.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    service: { name: svc, type: "ecs" },
    ...(isErr
      ? { error: { code: rand(ECS_ERROR_CODES), message: rand(MSGS.error), type: "container" } }
      : {}),
  };
}

function generateEksLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.12 ? "warn" : "info";
  const ns = rand(["default", "kube-system", "monitoring", "ingress-nginx", "app-prod"]);
  const pod = `${rand(["web", "api", "worker", "cache"])}-${randId(5).toLowerCase()}-${randId(5).toLowerCase()}`;
  const clusterName = `prod-cluster-${region}`;
  const isErr = level === "error";
  const MSGS = {
    error: [
      "OOMKilled: container exceeded memory limit",
      "CrashLoopBackOff: back-off restarting failed container",
      "ImagePullBackOff: failed to pull image",
      "Liveness probe failed",
      "FailedScheduling: 0/12 nodes available",
    ],
    warn: [
      "PodDisruptionBudget violations detected",
      "Node memory pressure detected",
      "Evicted pod due to disk pressure",
      "HPA scaling event: replicas 3->8",
    ],
    info: [
      "Pod scheduled on node",
      "Container started",
      "Endpoint slice updated",
      "Deployment rollout complete",
      "Service endpoint added",
    ],
  };
  const EKS_ERROR_CODES = [
    "OOMKilled",
    "CrashLoopBackOff",
    "ImagePullBackOff",
    "LivenessProbeFailed",
    "FailedScheduling",
  ];
  const durationSec = randInt(1, isErr ? 300 : 3600);
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const kubeletTs = `${new Date(ts).toISOString().replace("T", " ").replace("Z", "")}`;
  const kubeletMsg = `${kubeletTs} ${rand(["E", "W", "I"])}${randInt(100, 1299)} ${randId(6)} ${rand(["reconciler.go", "controller.go", "manager.go"])}:${randInt(50, 500)}] ${plainMessage}`;
  const message = useStructuredLogging
    ? JSON.stringify({
        cluster: clusterName,
        namespace: ns,
        pod,
        level,
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
        stream: rand(["stdout", "stderr"]),
      })
    : kubeletMsg;
  const nodeName = `ip-${randIp().replace(/\./g, "-")}.${region}.compute.internal`;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "eks" },
    },
    aws: {
      dimensions: { ClusterName: clusterName, NodeName: nodeName, Namespace: ns, PodName: pod },
      eks: {
        structured_logging: useStructuredLogging,
        cluster: { name: clusterName },
        node: { name: nodeName },
        metrics: {
          cluster_failed_node_count: { avg: isErr ? randInt(1, 3) : 0 },
          node_cpu_utilization: { avg: randFloat(10, 80) },
          node_memory_utilization: { avg: randFloat(20, 80) },
          node_network_total_bytes: { sum: randInt(1000, 1e9) },
          node_filesystem_utilization: { avg: randFloat(10, 80) },
          pod_cpu_utilization: { avg: randFloat(1, 80) },
          pod_memory_utilization: { avg: randFloat(5, 80) },
          pod_network_rx_bytes: { sum: randInt(1000, 1e8) },
          pod_network_tx_bytes: { sum: randInt(1000, 1e8) },
          node_count: { avg: randInt(2, 50) },
          pod_count: { avg: randInt(5, 500) },
        },
      },
    },
    container: {
      id: randId(12).toLowerCase(),
      name: pod.split("-")[0],
      image: { name: `k8s.gcr.io/${pod.split("-")[0]}:v1.${randInt(24, 28)}.${randInt(0, 5)}` },
      runtime: "containerd",
    },
    kubernetes: {
      namespace: ns,
      pod: { name: pod },
      container: { name: pod.split("-")[0] },
      labels: { app: pod.split("-")[0], env: "prod" },
    },
    log: { level },
    event: {
      category: ["process", "container"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.eks",
      provider: "eks.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    ...(isErr
      ? { error: { code: rand(EKS_ERROR_CODES), message: rand(MSGS.error), type: "container" } }
      : {}),
  };
}

function generateBatchLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const jobName = rand([
    "nightly-etl",
    "report-generation",
    "data-export",
    "ml-training-prep",
    "cleanup-job",
  ]);
  const jobQueue = `${jobName}-queue`;
  const jobId = `${randId(8)}-${randId(4)}`.toLowerCase();
  const isErr = level === "error";
  const durationSec = randInt(10, isErr ? 7200 : 3600);
  const MSGS = {
    error: [
      "Job run failed",
      "Job failed with exit code 1",
      "Container instance terminated unexpectedly",
      "Job queue capacity exceeded",
      "IAM role permission denied",
      "Spot instance reclaimed during execution",
    ],
    warn: [
      "Job retry attempt 2/3",
      "vCPU limit approaching: 980/1000",
      "Job timeout warning: 80% elapsed",
    ],
    info: [
      "Job run started",
      "Job run succeeded",
      "Job submitted to queue",
      "Container started on ECS instance",
      "Job completed successfully",
      "Job definition registered",
    ],
  };
  const BATCH_ERROR_CODES = [
    "ClientException",
    "ServerException",
    "CE_DELETED",
    "CE_INVALID",
    "CE_INSUFFICIENT_CAPACITY",
    "JQ_DELETED",
    "JD_DELETED",
    "JobDependencyError",
  ];
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const message = useStructuredLogging
    ? JSON.stringify({
        jobId,
        jobName,
        jobQueue,
        level,
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
        arrayIndex: randInt(0, 99),
      })
    : plainMessage;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "batch" },
    },
    aws: {
      dimensions: { JobQueue: jobQueue },
      batch: {
        job: { name: jobName, id: jobId, status: isErr ? "FAILED" : "SUCCEEDED" },
        job_queue: jobQueue,
        compute_environment: `ce-${rand(["spot", "ondemand"])}`,
        structured_logging: useStructuredLogging,
        metrics: {
          PendingJobCount: { avg: randInt(0, 100) },
          RunnableJobCount: { avg: randInt(0, 50) },
          StartingJobCount: { avg: randInt(0, 20) },
          RunningJobCount: { avg: randInt(0, 200) },
          SucceededJobCount: { sum: isErr ? 0 : 1 },
          FailedJobCount: { sum: isErr ? 1 : 0 },
          CPUReserved: { avg: randFloat(10, 80) },
          GPUReserved: { avg: 0 },
          MemoryReserved: { avg: randFloat(10, 90) },
        },
      },
    },
    process: {
      pid: randInt(1, 65535),
      name: rand(["python", "java", "spark-submit", "bash"]),
      exit_code: isErr ? rand([1, 2, 127, 137, 143]) : 0,
    },
    log: { level },
    event: {
      category: ["process"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.batch",
      provider: "batch.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    ...(isErr
      ? { error: { code: rand(BATCH_ERROR_CODES), message: rand(MSGS.error), type: "process" } }
      : {}),
  };
}

function generateBeanstalkLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand(["my-web-app", "admin-portal", "api-service", "worker-app"]);
  const env = `${app}-${rand(["production", "staging", "dev"])}`;
  const status = isErr ? rand([500, 502, 503]) : rand([200, 200, 201, 204, 301]);
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const MSGS = {
    error: [
      "ERROR: Failed to deploy application version",
      "ENV_ERROR: Deployment failed, rolling back",
      "Application version rejected: validation failed",
    ],
    warn: [
      "WARN: Enhanced health reporting: Warning",
      "CPU utilization above 75%",
      "Response time above 3s threshold",
    ],
    info: [
      "Deployment completed successfully",
      "Environment health: OK",
      "Auto Scaling event: +2 instances",
      "Rolling update complete",
    ],
  };
  const BEANSTALK_ERROR_CODES = ["DeploymentFailed", "Rollback", "ValidationFailed"];
  const durationSec = randInt(5, isErr ? 600 : 120);
  const latP10 = Number(randFloat(1, 30));
  const latP50 = Number(randFloat(latP10 * 1.2, latP10 * 4));
  const latP75 = Number(randFloat(latP50 * 1.1, latP50 * 2));
  const latP85 = Number(randFloat(latP75 * 1.05, latP75 * 1.5));
  const latP90 = Number(randFloat(latP85 * 1.05, latP85 * 1.5));
  const latP95 = Number(randFloat(latP90 * 1.1, latP90 * 2));
  const latP99 = Number(randFloat(latP95 * 1.2, latP95 * 3));
  const latP999 = Number(randFloat(latP99 * 1.1, latP99 * 2));
  const plainMessage = rand(isErr ? MSGS.error : status >= 400 ? MSGS.warn : MSGS.info);
  const useStructuredLogging = Math.random() < 0.55;
  const message = useStructuredLogging
    ? JSON.stringify({
        application: app,
        environment: env,
        status,
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
      service: { name: "elasticbeanstalk" },
    },
    aws: {
      dimensions: { EnvironmentName: env, InstanceId: instanceId },
      elasticbeanstalk: {
        application: app,
        environment: env,
        structured_logging: useStructuredLogging,
        platform: rand(["Node.js 18", "Python 3.11", "Docker"]),
        version_label: `v${randInt(1, 200)}`,
        metrics: {
          ApplicationRequests2xx: { sum: status < 300 ? 1 : 0 },
          ApplicationRequests3xx: { sum: status >= 300 && status < 400 ? 1 : 0 },
          ApplicationRequests4xx: { sum: status >= 400 && status < 500 ? 1 : 0 },
          ApplicationRequests5xx: { sum: status >= 500 ? 1 : 0 },
          ApplicationLatencyP10: { avg: latP10 },
          ApplicationLatencyP50: { avg: latP50 },
          ApplicationLatencyP75: { avg: latP75 },
          ApplicationLatencyP85: { avg: latP85 },
          ApplicationLatencyP90: { avg: latP90 },
          ApplicationLatencyP95: { avg: latP95 },
          ApplicationLatencyP99: { avg: latP99 },
          "ApplicationLatencyP99.9": { avg: latP999 },
          ApplicationRequests: { sum: 1 },
          InstancesSevere: { avg: isErr ? randInt(1, 3) : 0 },
          InstancesDegraded: { avg: isErr ? randInt(1, 5) : 0 },
          InstancesWarning: { avg: isErr ? randInt(1, 3) : 0 },
          InstancesOk: { avg: randInt(1, 10) },
          EnvironmentHealth: { avg: isErr ? 15 : 20 }, // 20=Ok, 15=Warning, 10=Degraded, 0=Severe
        },
      },
    },
    http: { response: { status_code: status } },
    log: { level: isErr ? "error" : "info" },
    event: {
      category: ["web", "process"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.elasticbeanstalk",
      provider: "elasticbeanstalk.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    ...(isErr
      ? {
          error: {
            code: rand(BEANSTALK_ERROR_CODES),
            message: rand(MSGS.error),
            type: "application",
          },
        }
      : {}),
  };
}

function generateEcrLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const repo = rand([
    "web-app",
    "api-service",
    "worker",
    "base-image",
    "ml-inference",
    "nginx-custom",
  ]);
  const tag = rand(["latest", "v1.2.3", "main", "release-42", "sha-a3f1bc"]);
  const action = rand(["push", "pull", "pull", "pull", "scan", "delete"]);
  const SCAN_SEVS = ["CRITICAL", "HIGH", "MEDIUM"];
  const ECR_ERROR_CODES = ["ScanFindings", "ImageNotFound", "AccessDenied", "RateLimitExceeded"];
  const findingCount = isErr ? randInt(1, 30) : 0;
  let sevRem = findingCount;
  const sevCritical = isErr ? randInt(0, Math.min(sevRem, 5)) : 0;
  sevRem -= sevCritical;
  const sevHigh = isErr ? randInt(0, Math.min(sevRem, 10)) : 0;
  sevRem -= sevHigh;
  const sevMedium = isErr ? sevRem : 0;
  const errMsg = isErr
    ? `ECR scan: ${repo}:${tag} found ${findingCount} vulnerabilities [${rand(SCAN_SEVS)}]`
    : null;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "ecr" },
    },
    aws: {
      dimensions: { RepositoryName: repo, RegistryId: `${acct.id}` },
      ecr: {
        repository_name: repo,
        registry_id: `${acct.id}`,
        image_tag: tag,
        image_digest: `sha256:${randId(40).toLowerCase()}`,
        action,
        image_size_bytes: randInt(5e6, 2e9),
        pushed_by: rand(["codebuild", "github-actions", "developer", "ci-pipeline"]),
        scan_status: isErr
          ? "COMPLETE_WITH_FINDINGS"
          : action === "scan"
            ? "COMPLETE"
            : "NOT_STARTED",
        finding_severity: isErr ? rand(SCAN_SEVS) : null,
        finding_count: findingCount,
        vulnerability_scan_enabled: true,
        metrics: {
          ImageCount: { avg: randInt(1, 1000) },
          RepositorySizeInBytes: { avg: randInt(1e6, 50e9) },
          LifecyclePolicyRuleEvaluationCount: { sum: Math.random() > 0.9 ? randInt(1, 100) : 0 },
          PullCount: { sum: action === "pull" ? randInt(1, 1000) : 0 },
          PushCount: { sum: action === "push" ? 1 : 0 },
          ScanFindingsSeverityCritical: { sum: sevCritical },
          ScanFindingsSeverityHigh: { sum: sevHigh },
          ScanFindingsSeverityMedium: { sum: sevMedium },
          ScanFindingsSeverityLow: { sum: randInt(0, 100) },
          ScanFindingsSeverityInformational: { sum: randInt(0, 200) },
        },
      },
    },
    event: {
      category: ["package"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.ecr",
      provider: "ecr.amazonaws.com",
      duration: randInt(100, isErr ? 30000 : 5000) * 1e6,
    },
    message: isErr ? errMsg : `ECR ${action}: ${repo}:${tag}`,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr ? { error: { code: rand(ECR_ERROR_CODES), message: errMsg, type: "package" } } : {}),
  };
}

function generateAutoScalingLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const asg = rand(["web-asg", "api-asg", "worker-asg", "batch-asg", "spot-fleet"]);
  const action = rand(["Launch", "Terminate", "Launch", "Launch", "HealthCheck"]);
  const reason =
    action === "Launch"
      ? rand([
          "Scale out triggered: capacity below desired",
          "Scheduled action triggered",
          "Unhealthy instance replaced",
        ])
      : action === "Terminate"
        ? rand(["Scale in: reducing to desired", "Spot interruption", "Instance unhealthy"])
        : rand(["EC2 health check passed", "ELB health check: InService"]);
  const failReasons = ["No capacity", "Launch template error", "VPC limit"];
  const errMsg = isErr ? `AutoScaling ${asg}: ${action} FAILED - ${rand(failReasons)}` : null;
  const ASG_ERROR_CODES = ["InsufficientCapacity", "LaunchTemplateError", "VpcLimitExceeded"];
  const desired = randInt(2, 20);
  const activityDurationSec = randInt(30, 600);
  const terminating = action === "Terminate" ? randInt(1, Math.min(3, desired)) : 0;
  const remaining = desired - terminating;
  const standby = randInt(0, Math.min(2, remaining));
  const pendingSlots = remaining - standby;
  const pending = isErr ? randInt(1, Math.max(1, Math.min(3, pendingSlots))) : 0;
  const inService = pendingSlots - pending;
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "autoscaling" },
    },
    aws: {
      dimensions: { AutoScalingGroupName: asg },
      autoscaling: {
        group_name: asg,
        activity_id: `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase(),
        action_type: action,
        instance_id: `i-${randId(17).toLowerCase()}`,
        instance_type: rand(["t3.medium", "m5.xlarge", "c5.2xlarge", "r5.large"]),
        desired_capacity: desired,
        min_size: 2,
        max_size: 50,
        current_capacity: inService,
        cause: reason,
        status_code: isErr ? "Failed" : "Successful",
        launch_template: rand(["web-lt:5", "api-lt:3", "worker-lt:8"]),
        metrics: {
          GroupMinSize: { avg: 2 },
          GroupMaxSize: { avg: 50 },
          GroupDesiredCapacity: { avg: desired },
          GroupInServiceInstances: { avg: inService },
          GroupPendingInstances: { avg: pending },
          GroupStandbyInstances: { avg: standby },
          GroupTerminatingInstances: { avg: terminating },
          GroupTotalInstances: { avg: inService + pending + standby + terminating },
          GroupInServiceCapacity: { avg: inService },
          GroupPendingCapacity: { avg: pending },
          GroupStandbyCapacity: { avg: standby },
          GroupTerminatingCapacity: { avg: terminating },
          GroupTotalCapacity: { avg: inService + pending + standby + terminating },
          WarmPoolMinSize: { avg: 0 },
          WarmPoolDesiredCapacity: { avg: 0 },
          WarmPoolPendingCapacity: { avg: 0 },
          WarmPoolTerminatingCapacity: { avg: 0 },
          WarmPoolTotalCapacity: { avg: 0 },
          WarmPoolWarmedCapacity: { avg: 0 },
        },
      },
    },
    event: {
      category: ["host"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.autoscaling",
      provider: "autoscaling.amazonaws.com",
      duration: activityDurationSec * 1e9,
    },
    message: isErr ? errMsg : `AutoScaling ${asg}: ${action} instance`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr ? { error: { code: rand(ASG_ERROR_CODES), message: errMsg, type: "host" } } : {}),
  };
}

function generateImageBuilderLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const pipeline = rand([
    "golden-ami-pipeline",
    "container-base-pipeline",
    "windows-hardened",
    "amazon-linux-cis",
  ]);
  const phase = rand(["BUILD", "TEST", "DISTRIBUTE", "DEPROVISION"]);
  const dur = randInt(300, isErr ? 3600 : 1800);
  const imageId = `ami-${randId(8).toLowerCase()}`;
  const IB_FAIL_MSGS = [
    "Component execution failed",
    "Health check failed",
    "Instance unreachable",
  ];
  const errMsg = isErr ? `Build failed in ${phase} phase: ${rand(IB_FAIL_MSGS)}` : null;
  const IMAGEBUILDER_ERROR_CODES = ["ComponentError", "ValidationFailed", "SsmTimeout"];
  const infoMsg = rand([
    `EC2 Image Builder: ${pipeline} - ${phase} phase STARTED`,
    `Running component: ${rand(["aws:RunShellScript", "aws:UpdateOS", "aws:InstallSSMAgent", "aws:ValidateInfrastructure"])}`,
    `Testing image: ${imageId} with test component ${rand(["aws:SimpleTestComponent", "aws:TestInfrastructureAssociation"])}`,
    `Image Builder ${pipeline} ${phase} COMPLETED in ${dur}s`,
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "imagebuilder" },
    },
    aws: {
      dimensions: { PipelineName: pipeline, Phase: phase },
      imagebuilder: {
        pipeline_name: pipeline,
        image_version: `${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 10)}/1`,
        phase,
        phase_status: isErr ? "FAILED" : "COMPLETED",
        duration_seconds: dur,
        os: rand(["Amazon Linux 2023", "Ubuntu 22.04", "Windows Server 2022", "RHEL 9"]),
        recipe_name: rand(["web-server-recipe", "hardened-base", "docker-host"]),
        ami_id: isErr ? null : imageId,
        metrics: {
          BuildDuration: { avg: dur },
          ImageBuildSuccessCount: { sum: isErr ? 0 : 1 },
          ImageBuildFailureCount: { sum: isErr ? 1 : 0 },
          ComponentBuildDuration: { avg: randInt(60, Math.min(dur, 1200)) },
        },
      },
    },
    event: {
      category: ["process"],
      duration: dur * 1e9,
      outcome: isErr ? "failure" : "success",
      dataset: "aws.imagebuilder",
      provider: "imagebuilder.amazonaws.com",
    },
    message: isErr ? errMsg : infoMsg,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? { error: { code: rand(IMAGEBUILDER_ERROR_CODES), message: errMsg, type: "process" } }
      : {}),
  };
}

function generateOutpostsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const outpostId = `op-` + randId(17).toLowerCase();
  const outpostArn = `arn:aws:outposts:${region}:${acct.id}:outpost/op-${randId(17).toLowerCase()}`;
  const siteId = `os-` + randId(17).toLowerCase();
  const rackId = `or-` + randId(17).toLowerCase();
  const instanceType = rand(["m5.xlarge", "m5.2xlarge", "c5.xlarge", "r5.xlarge", "m5d.xlarge"]);
  const availableInstanceCount = randInt(0, 20);
  const totalInstanceCount = randInt(20, 40);
  const capacityStatus = isErr
    ? rand(["InsufficientCapacity", "Degraded"])
    : rand(["Active", "Active", "Active", "Scheduled"]);
  const connectivityStatus = isErr ? rand(["Disconnected", "Degraded"]) : "Connected";
  const assetState = rand(["ACTIVE", "ACTIVE", "RETIRING", "ISOLATED"]);
  const action = rand([
    "CapacityReservation",
    "InstanceLaunch",
    "InstanceTermination",
    "ConnectivityStatusChange",
    "HardwareMaintenanceScheduled",
    "AssetStateChange",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "outposts" },
    },
    aws: {
      dimensions: { OutpostId: outpostId, InstanceType: instanceType },
      outposts: {
        outpost_id: outpostId,
        outpost_arn: outpostArn,
        site_id: siteId,
        rack_id: rackId,
        instance_type: instanceType,
        available_instance_count: availableInstanceCount,
        total_instance_count: totalInstanceCount,
        capacity_status: capacityStatus,
        connectivity_status: connectivityStatus,
        asset_state: assetState,
      },
    },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["host", "infrastructure"],
      dataset: "aws.outposts",
      provider: "outposts.amazonaws.com",
      duration: randInt(100, 5000) * 1e6,
    },
    message: isErr
      ? `Outpost ${outpostId}: ${capacityStatus} — ${availableInstanceCount}/${totalInstanceCount} ${instanceType} available`
      : `Outpost ${outpostId}: ${action} ${instanceType} ${capacityStatus}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: capacityStatus,
            message: `Outpost connectivity: ${connectivityStatus}`,
            type: "host",
          },
        }
      : {}),
  };
}

function generateWavelengthLog(ts: string, er: number): EcsDocument {
  const acct = randAccount();
  const isErr = Math.random() < er;
  const WAVELENGTH_ZONES = [
    { zone: "us-east-1-wl1-bos-wlz-1", region: "us-east-1", carrier: "Verizon", city: "Boston" },
    { zone: "us-east-1-wl1-nyc-wlz-1", region: "us-east-1", carrier: "Verizon", city: "New York" },
    {
      zone: "us-east-1-wl1-was-wlz-1",
      region: "us-east-1",
      carrier: "Verizon",
      city: "Washington DC",
    },
    { zone: "us-east-1-wl1-chi-wlz-1", region: "us-east-1", carrier: "Verizon", city: "Chicago" },
    {
      zone: "us-east-1-wl1-sfo-wlz-1",
      region: "us-east-1",
      carrier: "Verizon",
      city: "San Francisco",
    },
    { zone: "us-west-2-wl1-las-wlz-1", region: "us-west-2", carrier: "Verizon", city: "Las Vegas" },
    { zone: "eu-west-2-wl1-lon-wlz-1", region: "eu-west-2", carrier: "Vodafone", city: "London" },
    {
      zone: "ap-northeast-1-wl1-nrt-wlz-1",
      region: "ap-northeast-1",
      carrier: "KDDI",
      city: "Tokyo",
    },
    {
      zone: "ap-northeast-2-wl1-sel-wlz-1",
      region: "ap-northeast-2",
      carrier: "SKT",
      city: "Seoul",
    },
  ];
  const wz = rand(WAVELENGTH_ZONES);
  const instanceId = `i-${randId(17).toLowerCase()}`;
  const instanceType = rand(["t3.medium", "t3.xlarge", "g4dn.2xlarge", "r5.large", "c5.2xlarge"]);
  const carrierGwId = `cagw-${randId(17).toLowerCase()}`;
  const subnetId = `subnet-${randId(17).toLowerCase()}`;
  const carrierIp = randIp();
  const ueIp = randIp();
  const uplinkMbps = Number(randFloat(1, isErr ? 10 : 500));
  const downlinkMbps = Number(randFloat(1, isErr ? 10 : 1000));
  const latencyMs = Number(randFloat(1, isErr ? 50 : 10));
  const bandwidthAllowanceGbps = randInt(1, 25);
  const action = rand([
    "RunInstances",
    "TerminateInstances",
    "AllocateAddress",
    "CarrierGatewayCreated",
    "BandwidthThrottled",
    "PacketLoss",
    "InstanceStateChange",
  ]);
  const errorCode = rand([
    "InsufficientCapacityInWavelengthZone",
    "CarrierGatewayLimitExceeded",
    "BandwidthLimitExceeded",
    "InvalidWavelengthZone",
  ]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region: wz.region,
      account: { id: acct.id, name: acct.name },
      service: { name: "wavelength" },
      availability_zone: wz.zone,
      instance: { id: instanceId },
    },
    aws: {
      dimensions: {
        WavelengthZone: wz.zone,
        InstanceId: instanceId,
        CarrierGatewayId: carrierGwId,
      },
      wavelength: {
        zone: wz.zone,
        carrier: wz.carrier,
        city: wz.city,
        instance_id: instanceId,
        instance_type: instanceType,
        carrier_gateway_id: carrierGwId,
        subnet_id: subnetId,
        carrier_ip: carrierIp,
        ue_ip: ueIp,
        bandwidth_allowance_gbps: bandwidthAllowanceGbps,
        network: {
          uplink_mbps: uplinkMbps,
          downlink_mbps: downlinkMbps,
          latency_ms: latencyMs,
          packet_loss_pct: isErr ? Number(randFloat(1, 15)) : Number(randFloat(0, 0.1)),
        },
        error_code: isErr ? errorCode : null,
      },
    },
    source: { ip: ueIp },
    event: {
      action,
      outcome: isErr ? "failure" : "success",
      category: ["network", "host"],
      dataset: "aws.wavelength",
      provider: "ec2.amazonaws.com",
      duration: randInt(10, 500) * 1e6,
    },
    message: isErr
      ? `Wavelength [${wz.city}/${wz.carrier}] ${action} FAILED on ${instanceId}: ${errorCode}`
      : `Wavelength [${wz.city}/${wz.carrier}] ${instanceId} (${instanceType}) UL=${uplinkMbps.toFixed(0)}Mbps DL=${downlinkMbps.toFixed(0)}Mbps lat=${latencyMs.toFixed(1)}ms`,
    log: { level: isErr ? "error" : latencyMs > 20 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Wavelength zone operation failed in ${wz.zone}`,
            type: "network",
          },
        }
      : {}),
  };
}

function generateMainframeModernizationLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const applicationId = `app-${randId(6).toLowerCase()}`;
  const environmentId = `env-${randId(8).toLowerCase()}`;
  const engineType = rand(["microfocus", "bluage"]);
  const deploymentId = `deploy-${randId(8).toLowerCase()}`;
  const batchJobStatus = isErr ? "Failed" : rand(["Succeeded", "Running", "Succeeded"]);
  const batchJobsRunning = isErr ? 0 : randInt(0, 20);
  const onlineTps = isErr ? 0 : Number(randFloat(1, 500));
  const cpuUtilization = isErr ? Number(randFloat(90, 100)) : Number(randFloat(5, 75));
  const errorCode = rand(["BatchJobFailed", "ApplicationStartFailed"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "m2" },
    },
    aws: {
      dimensions: { ApplicationId: applicationId, EnvironmentId: environmentId },
      m2: {
        application_id: applicationId,
        environment_id: environmentId,
        engine_type: engineType,
        deployment_id: deploymentId,
        batch_job_status: batchJobStatus,
        metrics: {
          batch_jobs_running: batchJobsRunning,
          online_transactions_per_sec: onlineTps,
          cpu_utilization: cpuUtilization,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.m2",
      provider: "m2.amazonaws.com",
      duration: randInt(100, isErr ? 30000 : 5000) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.m2", namespace: "default" },
    message: isErr
      ? `Mainframe Modernization ${applicationId}: ${errorCode} (${engineType})`
      : `Mainframe Modernization ${applicationId}: batch_status=${batchJobStatus}, tps=${onlineTps.toFixed(0)}, cpu=${cpuUtilization.toFixed(1)}%`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Mainframe Modernization application ${applicationId} failed`,
            type: "process",
          },
        }
      : {}),
  };
}

function generateParallelComputingLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const clusterId = `pcs-${randId(8).toLowerCase()}`;
  const scheduler = "slurm";
  const queueName = rand(["high-priority", "batch", "gpu"]);
  const jobId = `job-${randInt(1, 999999)}`;
  const jobState = isErr ? "FAILED" : rand(["PENDING", "RUNNING", "COMPLETED", "RUNNING"]);
  const runningJobs = isErr ? 0 : randInt(0, 500);
  const pendingJobs = randInt(0, isErr ? 1000 : 200);
  const computeNodesActive = isErr ? 0 : randInt(1, 1000);
  const errorCode = rand(["JobFailed", "NodeProvisioningFailed"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "pcs" },
    },
    aws: {
      dimensions: { ClusterId: clusterId, QueueName: queueName },
      pcs: {
        cluster_id: clusterId,
        scheduler,
        queue_name: queueName,
        job_id: jobId,
        job_state: jobState,
        metrics: {
          running_jobs: runningJobs,
          pending_jobs: pendingJobs,
          compute_nodes_active: computeNodesActive,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.pcs",
      provider: "pcs.amazonaws.com",
      duration: randInt(1, isErr ? 60000 : 3600) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.pcs", namespace: "default" },
    message: isErr
      ? `PCS cluster ${clusterId}: ${errorCode} for job ${jobId} in queue ${queueName}`
      : `PCS cluster ${clusterId}: ${runningJobs} running, ${pendingJobs} pending, ${computeNodesActive} nodes active`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Parallel Computing Service job failed on cluster ${clusterId}`,
            type: "process",
          },
        }
      : {}),
  };
}

function generateEvsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const environmentId = `evs-${randId(8).toLowerCase()}`;
  const vcenterHostname = `vcenter-${randId(6).toLowerCase()}.internal`;
  const esxiVersion = "8.0.3";
  const hostCount = randInt(3, 20);
  const vsanDatastoreId = `datastore-${randInt(1, 999)}`;
  const hostsOnline = isErr ? randInt(1, hostCount - 1) : hostCount;
  const vsanCapacityUsedTb = Number(randFloat(1, 100));
  const vcpuAllocationRatio = Number(randFloat(1, isErr ? 20 : 8));
  const errorCode = rand(["HostFailure", "VsanDegradedError"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "evs" },
    },
    aws: {
      dimensions: { EnvironmentId: environmentId },
      evs: {
        environment_id: environmentId,
        vcenter_hostname: vcenterHostname,
        esxi_version: esxiVersion,
        host_count: hostCount,
        vsan_datastore_id: vsanDatastoreId,
        metrics: {
          hosts_online: hostsOnline,
          vsan_capacity_used_tb: vsanCapacityUsedTb,
          vcpu_allocation_ratio: vcpuAllocationRatio,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["host"],
      dataset: "aws.evs",
      provider: "evs.amazonaws.com",
      duration: randInt(50, 2000) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.evs", namespace: "default" },
    message: isErr
      ? `EVS environment ${environmentId}: ${errorCode} — ${hostsOnline}/${hostCount} hosts online`
      : `EVS environment ${environmentId}: ${hostsOnline}/${hostCount} hosts, vSAN=${vsanCapacityUsedTb.toFixed(1)}TB, vCPU ratio=${vcpuAllocationRatio.toFixed(1)}`,
    log: { level: isErr ? "error" : hostsOnline < hostCount ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `Elastic VMware Service failure in environment ${environmentId}`,
            type: "host",
          },
        }
      : {}),
  };
}

function generateSimSpaceWeaverLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const simulationId = `sim-${randId(10).toLowerCase()}`;
  const appName = rand([
    "urban-traffic-sim",
    "crowd-simulation",
    "logistics-optimizer",
    "battlefield-sim",
  ]);
  const domainName = rand(["Terrain", "Agents", "Traffic"]);
  const clockTickMs = randInt(100, 1000);
  const simulationStatus = isErr ? "FAILED" : rand(["RUNNING", "STARTING", "RUNNING"]);
  const entitiesCount = isErr ? 0 : randInt(100, 1000000);
  const computeWorkers = isErr ? 0 : randInt(1, 200);
  const clockLagMs = isErr ? randInt(500, 5000) : randInt(0, 50);
  const errorCode = rand(["PartitionFailed", "ClockDesyncError"]);
  return {
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "simspaceweaver" },
    },
    aws: {
      dimensions: { SimulationId: simulationId, DomainName: domainName },
      simspaceweaver: {
        simulation_id: simulationId,
        app_name: appName,
        domain_name: domainName,
        clock_tick_ms: clockTickMs,
        simulation_status: simulationStatus,
        metrics: {
          entities_count: entitiesCount,
          compute_workers: computeWorkers,
          clock_lag_ms: clockLagMs,
        },
        error_code: isErr ? errorCode : null,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      dataset: "aws.simspaceweaver",
      provider: "simspaceweaver.amazonaws.com",
      duration: clockTickMs * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.simspaceweaver", namespace: "default" },
    message: isErr
      ? `SimSpace Weaver simulation ${simulationId}: ${errorCode} in domain ${domainName}`
      : `SimSpace Weaver ${simulationId} [${appName}]: status=${simulationStatus}, entities=${entitiesCount}, lag=${clockLagMs}ms`,
    log: { level: isErr ? "error" : clockLagMs > 100 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCode,
            message: `SimSpace Weaver simulation ${simulationId} failed`,
            type: "process",
          },
        }
      : {}),
  };
}

export {
  generateEc2Log,
  generateEcsLog,
  generateEksLog,
  generateBatchLog,
  generateBeanstalkLog,
  generateEcrLog,
  generateAutoScalingLog,
  generateImageBuilderLog,
  generateOutpostsLog,
  generateWavelengthLog,
  generateMainframeModernizationLog,
  generateParallelComputingLog,
  generateEvsLog,
  generateSimSpaceWeaverLog,
};
