import {
  rand,
  randInt,
  randFloat,
  randId,
  randHexId,
  randPublicIp,
  randPrivateIp,
  ec2PrivateDns,
  randUUID,
  randAccount,
  REGIONS,
} from "../../helpers";
import { randSourceIp } from "../../helpers/identity.js";
import type { EcsDocument } from "./types.js";

function generateEc2Log(ts: string, er: number) {
  const region = rand(REGIONS);
  const acct = randAccount();
  const level = Math.random() < er ? "error" : Math.random() < 0.1 ? "warn" : "info";
  const instanceId = `i-${randHexId(17)}`;
  const privateIp = randPrivateIp();
  const publicIp = randPublicIp();
  const CPU_CORES = { "t3.medium": 2, "m5.xlarge": 4, "c5.2xlarge": 8, "r5.large": 2 } as const;
  const INSTANCE_TYPES = ["t3.medium", "m5.xlarge", "c5.2xlarge", "r5.large"] as const;
  const instanceType = rand(INSTANCE_TYPES);
  const cpuCores = CPU_CORES[instanceType];
  const stackId = `arn:aws:cloudformation:${region}:${acct.id}:stack/${rand(["web", "api", "data"])}-stack/${randId(8)}`;
  const MSGS = {
    error: [
      "kernel: EXT4-fs error (device xvda1): ext4_validate_block_bitmap: bg 0: bad block bitmap checksum",
      "systemd: Failed to start Amazon SSM Agent.",
      "kernel: Out of memory: Killed process",
      "sshd: error: Could not load host key",
      "Failed to start NetworkManager",
      "disk I/O error on /dev/xvda1",
      "amazon-cloudwatch-agent: E! [outputs.cloudwatchlogs] Write failed: AccessDeniedException",
      "cfn-init: Error executing configSet default: Command 01_install failed",
    ],
    warn: [
      "CPU steal time above threshold: 23%",
      "High disk utilization: 88% full",
      "Memory available below 512MB",
      "SSH login from unknown IP",
      "amazon-ssm-agent: WARN Ping response latency high: 850ms",
      "amazon-cloudwatch-agent: W! Deprecation: configuration key 'metrics_collected' nested path changed",
    ],
    info: [
      `cloud-init: Cloud-init v. 22.2.2 running 'init-local' at ${new Date(ts).toUTCString()}. Up 2.13 seconds.`,
      "cloud-init: Fetching ec2 metadata from http://169.254.169.254/latest/meta-data/instance-id",
      "cloud-init: Reading user-data from /var/lib/cloud/instance/user-data.txt (multipart: False)",
      "cloud-init: Running module write_files (<module>, 0, False) with frequency once-per-instance",
      "cloud-init: Running command ['sh', '-c', 'systemctl enable amazon-ssm-agent'] (frequency once-per-instance)",
      "cloud-init: modules-final: running modules for final",
      "amazon-ssm-agent: INFO [HealthCheck] HealthCheck reporting agent health.",
      "amazon-ssm-agent: INFO [MessageService] [EngineProcessor] [MessageHandler] successfully completed document aws:runShellScript",
      "amazon-ssm-agent: INFO [LongRunningPluginsManager] There are no long running plugins currently getting executed - skipping their healthcheck",
      "amazon-cloudwatch-agent: I! Detected runAsUser: cwagent",
      "amazon-cloudwatch-agent: I! Loaded configuration from /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json",
      "amazon-cloudwatch-agent: I! [logagent] start logs plugin file paths [/var/log/messages]",
      "amazon-cloudwatch-agent: D! [outputs.cloudwatchlogs] Buffer fullness: 12%",
      "cfn-init: Completed successfully",
      `cfn-init: Signaling resource ${rand(["WebServerInstance", "LaunchTemplate", "AutoScalingGroup"])} in stack ${stackId}`,
      "systemd: Started Amazon SSM Agent.",
      "kernel: [    0.000000] Linux version 5.10.68-62.173.amzn2.x86_64",
      "sshd: Accepted publickey for ec2-user",
      "cloud-init: modules done",
      "awslogs: Starting daemon",
    ],
  };
  const EC2_ERROR_CODES = [
    "InsufficientInstanceCapacity",
    "InstanceLimitExceeded",
    "InvalidInstanceID",
    "VolumeInUse",
    "Unsupported",
  ];
  const isErr = level === "error";
  const cpuPct = Number(randFloat(1, isErr ? 99 : 70));
  const durationSec = randInt(60, 3600);
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.55;
  const logGroup = rand([
    `/aws/ec2/${instanceId}/messages`,
    `/aws/ec2/${instanceId}/cloud-init`,
    `/aws/ec2/${instanceId}/ssm`,
    `/aws/ec2/${instanceId}/cfn-init-cmd.log`,
    `/aws/ec2/${instanceId}/cwagent`,
  ]);
  const logStream = `${instanceId}/${rand(["messages", "cloud-init.log", "amazon-ssm-agent.log", "amazon-cloudwatch-agent.log", "cfn-init.log"])}`;
  const message = useStructuredLogging
    ? JSON.stringify({
        source: rand(["amazon-cloudwatch-agent", "cwagent"]),
        log_group: logGroup,
        log_stream: logStream,
        instance_id: instanceId,
        instance_type: instanceType,
        log_level: level,
        message: plainMessage,
        "@timestamp": new Date(ts).toISOString(),
        os_type: "linux",
        agent_version: rand(["1.300032.0", "1.248013.0"]),
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
        ImageId: `ami-${randHexId(8)}`,
        AutoScalingGroupName: rand(["web-asg", "api-asg", "worker-asg", null]),
      },
      ec2: {
        instance: {
          image: { id: `ami-${randHexId(8)}` },
          state: { name: isErr ? rand(["stopping", "stopped"]) : "running", code: isErr ? 64 : 16 },
          monitoring: { state: rand(["disabled", "enabled"]) },
          core: { count: cpuCores },
          type: instanceType,
          threads_per_core: 2,
          private: {
            ip: privateIp,
            dns_name: ec2PrivateDns(privateIp, region),
          },
          public: {
            ip: publicIp,
            dns_name: `ec2-${publicIp.replace(/\./g, "-")}.compute-1.amazonaws.com`,
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
      hostname: ec2PrivateDns(privateIp, region).split(".")[0],
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
      ? { error: { code: rand(EC2_ERROR_CODES), message: rand(MSGS.error), type: "aws" } }
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
  const taskDefFamily = `${svc}-td`;
  const taskDefRev = randInt(1, 42);
  const taskArn = `arn:aws:ecs:${region}:${acct.id}:task/${cluster}/${randId(32).toLowerCase()}`;
  const imageRef = `${acct.id}.dkr.ecr.${region}.amazonaws.com/${svc}:${rand(["latest", "v1.4.2", "sha256:a1b2"])}`;
  const MSGS = {
    error: [
      "Container exited with code 1",
      "OOMKilled",
      "Health check failed",
      "Failed to pull image",
      `containerd: failed to pull and unpack image "${imageRef}": failed to resolve reference: unexpected status 403`,
      `ecs-agent: [ERROR] TaskEngine: error transitioning container [${svc}] to [CREATED]: DockerTimeoutError`,
    ],
    warn: [
      "High memory: 85%",
      "Slow response",
      "Retry 2/3",
      "Connection pool exhausted",
      `ecs-agent: [WARN] TaskEngine: pull image slow for container [${svc}] duration=45s`,
      `containerd: unpacking layer sha256:${randId(40).toLowerCase()} (application/vnd.docker.image.rootfs.diff.tar.gzip)`,
    ],
    info: [
      "Task started",
      "Health check passed",
      "Request processed",
      "Scaling event triggered",
      `containerd: pulling image "${imageRef}"`,
      `containerd: successfully pulled image "${imageRef}" in 3.2s`,
      `containerd: creating container ${randId(12).toLowerCase()} name=${svc}`,
      `ecs-agent: [INFO] Managed task [arn:aws:ecs:...] at [RUNNING]: steady state`,
      `ecs-agent: [INFO] TaskHandler: Recording task started, task arn: ${taskArn}`,
      `service ${svc} has reached a steady state.`,
      `service ${svc} deployment ecs-svc/${randId(10)} deployment completed.`,
      `(service ${svc}) has started 1 tasks: (task ${randId(32).toLowerCase()}).`,
      `(service ${svc}) registered 1 targets in (target-group tg-${randId(8)})`,
    ],
  };
  const ECS_ERROR_CODES = [
    "ClusterNotFoundException",
    "ServiceNotFoundException",
    "TaskSetNotFoundException",
    "PlatformUnknownException",
  ];
  const durationSec = randInt(5, isErr ? 300 : 3600);
  const taskId = taskArn.split("/").pop() ?? randId(32).toLowerCase();
  const plainMessage = rand(MSGS[level]);
  const useStructuredLogging = Math.random() < 0.6;
  const ecsCluster = cluster;
  const ecsTaskDefinition = `${taskDefFamily}:${taskDefRev}`;
  const ecsTaskArn = taskArn;
  const message = useStructuredLogging
    ? JSON.stringify({
        cluster,
        service: svc,
        taskId,
        container: svc,
        level,
        message: plainMessage,
        timestamp: new Date(ts).toISOString(),
        ecs_cluster: ecsCluster,
        ecs_task_definition: ecsTaskDefinition,
        ecs_task_arn: ecsTaskArn,
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
        ecs_cluster: ecsCluster,
        ecs_task_definition: ecsTaskDefinition,
        ecs_task_arn: ecsTaskArn,
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
      category: ["process"],
      type: ["info"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.ecs",
      provider: "ecs.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    service: { name: svc, type: "ecs" },
    ecs_cluster: ecsCluster,
    ecs_task_definition: ecsTaskDefinition,
    ecs_task_arn: ecsTaskArn,
    ...(isErr
      ? { error: { code: rand(ECS_ERROR_CODES), message: rand(MSGS.error), type: "aws" } }
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
    "ResourceNotFoundException",
    "InvalidParameterException",
    "ClientException",
    "ServerException",
  ];
  const durationSec = randInt(1, isErr ? 300 : 3600);
  const nodePrivateIp = randPrivateIp();
  const nodeName = ec2PrivateDns(nodePrivateIp, region);
  const iso = new Date(ts).toISOString();
  const kubeletPlain = rand(MSGS[level]);
  const lineKind = rand([
    "kubelet",
    "kubelet",
    "authenticator",
    "audit",
    "scheduler",
    "controller",
    "event",
    "coredns",
  ]);
  const username = rand([
    `system:serviceaccount:${ns}:${pod.split("-")[0]}-sa`,
    `system:node:${nodeName}`,
    `arn:aws:sts::${acct.id}:assumed-role/${rand(["eks-nodegroup-role", "EKS-Fargate-PodRole"])}/session`,
    "admin",
  ]);
  const verb = rand(["get", "list", "watch", "create", "update", "patch", "delete"]);
  const resName = rand(["pods", "deployments", "services", "configmaps", "events"]);
  const objectRef = {
    kind: rand(["Pod", "Deployment", "Service", "ConfigMap"]),
    namespace: ns,
    name: pod,
    resource: resName,
    apiVersion: rand(["v1", "apps/v1"]),
  };
  const svcDns = `${pod.split("-")[0]}.${ns}.svc.cluster.local`;
  let message: string;
  let useStructuredLogging: boolean;
  if (lineKind === "audit") {
    useStructuredLogging = true;
    message = JSON.stringify({
      kind: "Event",
      apiVersion: "audit.k8s.io/v1",
      level: isErr ? "RequestResponse" : "Metadata",
      auditID: randId(16).toLowerCase(),
      stage: rand(["RequestReceived", "ResponseComplete"]),
      requestURI: `/api/v1/namespaces/${ns}/${resName}/${pod}`,
      verb,
      user: { username },
      objectRef,
      responseStatus: { code: isErr ? rand([401, 403, 500]) : 200 },
      sourceIPs: [randSourceIp()],
      timestamp: iso,
    });
  } else if (lineKind === "authenticator") {
    useStructuredLogging = false;
    message = isErr
      ? `time="${iso}" level=error msg="could not load ConfigMap "aws-auth" in namespace "kube-system": configmaps "aws-auth" not found"`
      : `time="${iso}" level=info msg="mapping IAM role" groups="system:bootstrappers,system:nodes" username="${username}" uid="aws-iam-authenticator:${acct.id}:role/${rand(["eksNodeRole", "node-instance-role"])}"`;
  } else if (lineKind === "scheduler") {
    useStructuredLogging = false;
    message = isErr
      ? `E${randInt(100, 129)}${randInt(1000, 9999)} ${iso.substring(11, 23).replace("T", " ")}       1 factory.go:${randInt(200, 999)}] "Unable to schedule pod; no fit" pod=${ns}/${pod} err="0/${randInt(3, 20)} nodes available: insufficient cpu"`
      : `I${randInt(100, 129)}${randInt(1000, 9999)} ${iso.substring(11, 23).replace("T", " ")}       1 default_binder.go:${randInt(50, 200)}] "Successfully bound pod to node" pod=${ns}/${pod} node=${nodeName} evaluatedNodes=${randInt(5, 40)} feasibleNodes=${randInt(1, 10)}`;
  } else if (lineKind === "controller") {
    useStructuredLogging = false;
    message = isErr
      ? `E${randInt(100, 129)}${randInt(1000, 9999)} ${iso.substring(11, 23).replace("T", " ")}       1 deployment_controller.go:${randInt(400, 900)}] "error syncing deployment" deployment=${ns}/${pod.split("-")[0]} err="failed to create ReplicaSet: forbidden"`
      : `I${randInt(100, 129)}${randInt(1000, 9999)} ${iso.substring(11, 23).replace("T", " ")}       1 replica_set.go:${randInt(100, 400)}] "Finished syncing" deployment=${ns}/${pod.split("-")[0]} duration="${Number(randFloat(0.001, 0.25)).toFixed(6)}s"`;
  } else if (lineKind === "event") {
    useStructuredLogging = true;
    message = JSON.stringify({
      type: isErr ? "Warning" : "Normal",
      reason: rand(["Scheduled", "Pulling", "Started", "Killing", "FailedMount"]),
      message: kubeletPlain,
      metadata: { namespace: ns, name: pod, creationTimestamp: iso },
      involvedObject: {
        kind: objectRef.kind,
        namespace: ns,
        name: pod,
        uid: randId(10).toLowerCase(),
      },
      reportingComponent: rand(["kube-scheduler", "kubelet", "deployment-controller"]),
      reportingInstance: nodeName,
      action: verb,
      user: { username },
    });
  } else if (lineKind === "coredns") {
    useStructuredLogging = false;
    const client = randPrivateIp();
    const qtype = rand(["A", "AAAA", "SRV"]);
    const rcode = isErr ? "SERVFAIL" : "NOERROR";
    message = `[${level === "error" ? "ERROR" : "INFO"}] ${client}:${randInt(40000, 65535)} - ${randInt(10000, 99999)} "${qtype} IN ${svcDns}. udp ${randInt(40, 512)} false ${randInt(512, 4096)}" ${rcode} qr,aa,rd,ra ${randInt(50, 200)} ${Number(randFloat(0.00001, isErr ? 2 : 0.05)).toFixed(8)}s`;
  } else {
    const kubeletTs = `${iso.replace("T", " ").replace("Z", "")}`;
    const kubeletMsg = `${kubeletTs} ${rand(["E", "W", "I"])}${randInt(100, 1299)} ${randId(6)} ${rand(["reconciler.go", "kubelet.go", "kuberuntime_manager.go"])}:${randInt(50, 500)}] ${kubeletPlain}`;
    useStructuredLogging = Math.random() < 0.6;
    message = useStructuredLogging
      ? JSON.stringify({
          cluster: clusterName,
          namespace: ns,
          pod,
          level,
          message: kubeletPlain,
          timestamp: iso,
          stream: rand(["stdout", "stderr"]),
        })
      : kubeletMsg;
  }
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
        log_line_kind: lineKind,
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
      category: ["process"],
      type: ["info"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.eks",
      provider: "eks.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    ...(isErr
      ? { error: { code: rand(EKS_ERROR_CODES), message: rand(MSGS.error), type: "aws" } }
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
  const jobDefName = `${jobName}-def`;
  const ecsTaskId = randId(32).toLowerCase();
  const logStreamName = `${jobDefName}/default/${ecsTaskId}`;
  const attempt = isErr ? randInt(1, 3) : randInt(1, 1);
  const exitCode = isErr ? rand([1, 2, 127, 137, 139, 255]) : 0;
  const jobStatus = rand(
    isErr
      ? ["FAILED", "FAILED", "RUNNING"]
      : ["SUBMITTED", "PENDING", "RUNNABLE", "STARTING", "RUNNING", "SUCCEEDED"]
  );
  const MSGS = {
    error: [
      "Job run failed",
      "Job failed with exit code 1",
      "Container instance terminated unexpectedly",
      "Job queue capacity exceeded",
      "IAM role permission denied",
      "Spot instance reclaimed during execution",
      `AWS_BATCH_JOB_ATTEMPT=${attempt} container exited with code ${exitCode}: OOMKilled`,
      `StatusReason=Host EC2 (instance i-${randHexId(17)}) terminated.`,
    ],
    warn: [
      "Job retry attempt 2/3",
      "vCPU limit approaching: 980/1000",
      "Job timeout warning: 80% elapsed",
      `Job ${jobId} transition RUNNABLE -> STARTING (waiting for instance capacity)`,
    ],
    info: [
      `batch: job ${jobId} status SUBMITTED -> PENDING`,
      `batch: job ${jobId} status PENDING -> RUNNABLE`,
      `batch: job ${jobId} status RUNNABLE -> STARTING`,
      `batch: job ${jobId} status STARTING -> RUNNING`,
      `batch: job ${jobId} status RUNNING -> SUCCEEDED`,
      "Job submitted to queue",
      "Container started on ECS instance",
      "Job completed successfully",
      "Job definition registered",
      `stderr:WARNING:deprecation: legacy flag --use_spark will be removed`,
      `stdout:INFO:__main__:processed partition ${randInt(0, 999)} rows=${randInt(1e3, 1e6)}`,
      `stdout:${new Date(ts).toISOString()} INFO spark.SparkContext: Running job 0 stage ${randInt(0, 20)}`,
    ],
  };
  const BATCH_ERROR_CODES = ["ClientException", "ServerException", "TooManyRequestsException"];
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
        logStreamName,
        jobAttempt: attempt,
        containerExitCode: exitCode,
        jobStatus,
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
        job: {
          name: jobName,
          id: jobId,
          status: isErr ? "FAILED" : jobStatus === "SUCCEEDED" ? "SUCCEEDED" : jobStatus,
        },
        job_queue: jobQueue,
        compute_environment: `ce-${rand(["spot", "ondemand"])}`,
        log_stream_name: logStreamName,
        job_attempt: attempt,
        container_exit_code: exitCode,
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
      exit_code: exitCode,
    },
    log: { level },
    event: {
      category: ["process"],
      type: ["info"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.batch",
      provider: "batch.amazonaws.com",
      duration: durationSec * 1e9,
    },
    message: message,
    logStreamName,
    ...(isErr
      ? { error: { code: rand(BATCH_ERROR_CODES), message: rand(MSGS.error), type: "aws" } }
      : {}),
  };
}

function generateBeanstalkLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const app = rand(["web-frontend", "admin-portal", "api-service", "worker-app"]);
  const env = `${app}-${rand(["production", "staging", "dev"])}`;
  const status = isErr ? rand([500, 502, 503]) : rand([200, 200, 201, 204, 301]);
  const instanceId = `i-${randHexId(17)}`;
  const reqPath = rand(["/api/health", "/index.html", "/v1/status", "/static/app.js"]);
  const clientIp = randPublicIp();
  const MSGS = {
    error: [
      "ERROR: Failed to deploy application version",
      "ENV_ERROR: Deployment failed, rolling back",
      "Application version rejected: validation failed",
      "eb-engine: ERROR Instance deployment failed. For details, see 'eb-engine.log'.",
      "nginx: [error] connect() failed (111: Connection refused) while connecting to upstream",
    ],
    warn: [
      "WARN: Enhanced health reporting: Warning",
      "CPU utilization above 75%",
      "Response time above 3s threshold",
      "eb-engine: WARN Command took longer than expected: hooks/appdeploy/pre/01_install_deps.sh",
      `nginx: [warn] upstream server temporarily disabled`,
    ],
    info: [
      "Deployment completed successfully",
      "Environment health: OK",
      "Auto Scaling event: +2 instances",
      "Rolling update complete",
      "eb-engine: INFO Running platform hook: .platform/hooks/prebuild/01_set_env.sh",
      "eb-engine: INFO Executing instruction: RunAppDeployPreDeployHooks",
      "eb-engine: INFO Instance deployment: application code deploy finished successfully.",
      `nginx: ${clientIp} - - [${new Date(ts).toISOString().replace("T", " ").replace("Z", " +0000")}] "GET ${reqPath} HTTP/1.1" ${status} ${randInt(100, 12000)} "-" "ELB-HealthChecker/2.0"`,
      `nginx: ${clientIp} - - [${new Date(ts).toISOString().replace("T", " ").replace("Z", " +0000")}] "POST ${reqPath} HTTP/1.1" ${status} ${randInt(200, 5000)}`,
      "healthd: INFO Health transition: Ok -> Info (Application update in progress on 1 out of 3 instances.)",
      "healthd: INFO Health transition: Info -> Ok (All instances are healthy.)",
      "healthd: WARN Environment health has transitioned from Ok to Warning. 1 out of 3 instances are impacted.",
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
        instance_id: instanceId,
        log_source: rand(["eb-engine", "nginx", "healthd", "platform-hooks"]),
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
      type: ["access"],
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
  const action = rand(["push", "pull", "pull", "scan", "delete", "lifecycle", "replication"]);
  const SCAN_SEVS = ["CRITICAL", "HIGH", "MEDIUM"];
  const ECR_ERROR_CODES = ["ScanFindings", "ImageNotFound", "AccessDenied", "RateLimitExceeded"];
  const findingCount = isErr && action === "scan" ? randInt(1, 30) : isErr ? randInt(0, 12) : 0;
  let sevRem = findingCount;
  const sevCritical = isErr ? randInt(0, Math.min(sevRem, 5)) : 0;
  sevRem -= sevCritical;
  const sevHigh = isErr ? randInt(0, Math.min(sevRem, 10)) : 0;
  sevRem -= sevHigh;
  const sevMedium = isErr ? sevRem : 0;
  const digest = `sha256:${randId(40).toLowerCase()}`;
  const otherRegions = REGIONS.filter((r) => r !== region);
  const destRegion = rand(otherRegions.length ? otherRegions : REGIONS);
  const replicationDestination = `${acct.id}.dkr.ecr.${destRegion}.amazonaws.com/${repo}`;
  const lifecycleRuleId = `rule-${randInt(1, 12)}`;
  const errMsg = isErr
    ? action === "scan"
      ? `ECR ImageScanCompleted: repository=${repo} imageDigest=${digest} findingsCount=${findingCount} maxSeverity=${rand(SCAN_SEVS)}`
      : `ECR ${action} failed for ${repo}:${tag}: ${rand(["ThrottlingException", "RepositoryNotFoundException", "ImageNotFoundException"])}`
    : null;
  const layerCount = randInt(4, 32);
  const pulledLayers = randInt(1, layerCount);
  let message: string;
  if (action === "scan") {
    message = isErr
      ? (errMsg as string)
      : `ECR ImageScanCompleted: repository=${repo} imageDigest=${digest} findingsCount=0 severitySummary=CLEAN scanTimestamp=${new Date(ts).toISOString()}`;
  } else if (action === "push") {
    message = isErr
      ? (errMsg as string)
      : `ECR PutImage repository=${repo} imageTag=${tag} imageDigest=${digest} imageSizeInBytes=${randInt(8e6, 900e6)} layerCount=${layerCount} partChecksums=${randInt(8, layerCount)}`;
  } else if (action === "pull") {
    message = isErr
      ? (errMsg as string)
      : `ECR BatchGetImage repository=${repo} registryId=${acct.id} imageManifestMediaType=application/vnd.docker.distribution.manifest.v2+json layersFetched=${pulledLayers}/${layerCount} bytesTransferred=${randInt(2e6, 400e6)}`;
  } else if (action === "delete") {
    message = isErr
      ? (errMsg as string)
      : `ECR BatchDeleteImage repository=${repo} imageIds=[{imageDigest=${digest},imageTag=${tag}}] deleted=${randInt(1, 3)}`;
  } else if (action === "lifecycle") {
    message = isErr
      ? (errMsg as string)
      : `ECR LifecyclePolicyExecution: repository=${repo} ruleId=${lifecycleRuleId} action=expire imagesExpired=${randInt(1, 8)} bytesReclaimed=${randInt(5e7, 5e9)}`;
  } else {
    message = isErr
      ? (errMsg as string)
      : `ECR ReplicationComplete: repository=${repo} imageDigest=${digest} sourceRegion=${region} destination=${replicationDestination} status=COMPLETE`;
  }
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
        image_digest: digest,
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
        replication_destination: action === "replication" ? replicationDestination : null,
        lifecycle_policy_rule_id: action === "lifecycle" ? lifecycleRuleId : null,
        layer_count: action === "push" || action === "pull" ? layerCount : null,
        metrics: {
          ImageCount: { avg: randInt(1, 1000) },
          RepositorySizeInBytes: { avg: randInt(1e6, 50e9) },
          LifecyclePolicyRuleEvaluationCount: {
            sum:
              action === "lifecycle" ? randInt(1, 50) : Math.random() > 0.9 ? randInt(1, 100) : 0,
          },
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
      type: ["info"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.ecr",
      provider: "ecr.amazonaws.com",
      duration: randInt(100, isErr ? 30000 : 5000) * 1e6,
    },
    message,
    log: { level: isErr ? "warn" : "info" },
    ...(isErr
      ? { error: { code: rand(ECR_ERROR_CODES), message: errMsg as string, type: "package" } }
      : {}),
  };
}

function generateAutoScalingLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const isErr = Math.random() < er;
  const asg = rand(["web-asg", "api-asg", "worker-asg", "batch-asg", "spot-fleet"]);
  const action = rand([
    "Launch",
    "Terminate",
    "Launch",
    "Launch",
    "HealthCheck",
    "LifecycleHook",
    "WarmPoolTransition",
    "PredictiveScalingForecast",
  ]);
  const instanceId = `i-${randHexId(17)}`;
  const activityId = `${randId(8)}-${randId(4)}-${randId(4)}`.toLowerCase();
  const hookName = rand([
    "launch-wait",
    "drain-connections",
    "register-targets",
    "finalize-termination",
  ]);
  const lifecycleTransition = rand([
    "autoscaling:EC2_INSTANCE_LAUNCHING",
    "autoscaling:EC2_INSTANCE_TERMINATING",
  ]);
  const reason =
    action === "Launch"
      ? rand([
          `At ${ts} a user request update of AutoScalingGroup constraints to min: 2, max: 50, desired: 8 changing the desired capacity from 6 to 8`,
          `At ${ts} a monitor alarm TargetTracking-scale-out-alarm in state ALARM triggered policy scale-out`,
          `At ${ts} instance ${instanceId} failed ELB health checks`,
        ])
      : action === "Terminate"
        ? rand([
            `At ${ts} a user request update of AutoScalingGroup constraints to min: 2, max: 50, desired: 4 changing the desired capacity from 6 to 4`,
            `At ${ts} instance ${instanceId} was taken out of service in response to a spot instance interruption notice`,
            `At ${ts} instance failed EC2 health check`,
          ])
        : action === "LifecycleHook"
          ? `LifecycleHookNotification for ${hookName} transition ${lifecycleTransition}`
          : action === "WarmPoolTransition"
            ? rand([
                "Warm pool instance moved from Warmed:Stopped to Warmed:Running",
                "Warm pool instance transitioned Hibernated -> Warming -> InService",
              ])
            : action === "PredictiveScalingForecast"
              ? `PredictiveScaling: forecast shows load increase; preemptive capacity adjustment recommended for ${asg}`
              : rand(["EC2 health check passed", "ELB health check: InService"]);
  const failReasons = ["No capacity", "Launch template error", "VPC limit"];
  const errMsg = isErr ? `AutoScaling ${asg}: ${action} FAILED - ${rand(failReasons)}` : null;
  const ASG_ERROR_CODES = ["InsufficientCapacity", "LaunchTemplateError", "VpcLimitExceeded"];
  const desired = randInt(2, 20);
  const activityDurationSec = randInt(30, 600);
  const terminating =
    action === "Terminate"
      ? randInt(1, Math.min(3, desired))
      : action === "LifecycleHook" && lifecycleTransition.includes("TERMINATING")
        ? 1
        : 0;
  const remaining = desired - terminating;
  const standby = randInt(0, Math.min(2, remaining));
  const pendingSlots = remaining - standby;
  const pending =
    action === "Launch" || action === "LifecycleHook"
      ? isErr
        ? randInt(1, Math.max(1, Math.min(3, pendingSlots)))
        : randInt(0, Math.min(2, pendingSlots))
      : isErr
        ? randInt(1, Math.max(1, Math.min(3, pendingSlots)))
        : 0;
  const inService = Math.max(0, pendingSlots - pending);
  const useWarmPool = action === "WarmPoolTransition" || Math.random() < 0.22;
  const wpMin = useWarmPool ? randInt(0, 2) : 0;
  const wpDesired = useWarmPool ? randInt(2, 10) : 0;
  const wpPending = useWarmPool ? randInt(0, 3) : 0;
  const wpTerm = useWarmPool ? randInt(0, 2) : 0;
  const wpTotal = useWarmPool ? wpDesired + wpPending + wpTerm : 0;
  const wpWarmed = useWarmPool ? randInt(1, Math.max(1, wpTotal)) : 0;
  let message: string;
  if (isErr) {
    message = errMsg as string;
  } else if (action === "LifecycleHook") {
    message = rand([
      `LifecycleHook ${hookName} for ${asg}: Pending:Wait -> Pending:Proceed instance ${instanceId} heartbeatTimeout=3600`,
      `SNS lifecycle hook notification published hook=${hookName} AutoScalingGroupName=${asg} EC2InstanceId=${instanceId} LifecycleTransition=${lifecycleTransition}`,
    ]);
  } else if (action === "WarmPoolTransition") {
    message = `WarmPool state change ASG=${asg} instance=${instanceId} warmed=${wpWarmed} desired=${wpDesired} poolStatus=${rand(["Active", "Warming"])}`;
  } else if (action === "PredictiveScalingForecast") {
    message = `PredictiveScalingForecast asg=${asg} forecastTime=${new Date(ts).toISOString()} predictedCPU=${Number(randFloat(45, 92)).toFixed(1)}% recommendedDesiredCapacity=${randInt(desired, desired + 6)}`;
  } else if (action === "Launch") {
    message = `SuccessfulScalingActivity: Launching a new EC2 instance: ${instanceId} ActivityId=${activityId} Cause: ${reason}`;
  } else if (action === "Terminate") {
    message = `SuccessfulScalingActivity: Terminating EC2 instance: ${instanceId} ActivityId=${activityId} Cause: ${reason}`;
  } else {
    message = `AutoScaling ${asg}: ${action} instance ${instanceId} — ${reason}`;
  }
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
        activity_id: activityId,
        action_type: action,
        instance_id: instanceId,
        instance_type: rand(["t3.medium", "m5.xlarge", "c5.2xlarge", "r5.large"]),
        desired_capacity: desired,
        min_size: 2,
        max_size: 50,
        current_capacity: inService,
        cause: reason,
        status_code: isErr ? "Failed" : "Successful",
        launch_template: rand(["web-lt:5", "api-lt:3", "worker-lt:8"]),
        lifecycle_hook_name: action === "LifecycleHook" ? hookName : null,
        lifecycle_transition: action === "LifecycleHook" ? lifecycleTransition : null,
        predictive_scaling_forecast: action === "PredictiveScalingForecast",
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
          WarmPoolMinSize: { avg: wpMin },
          WarmPoolDesiredCapacity: { avg: wpDesired },
          WarmPoolPendingCapacity: { avg: wpPending },
          WarmPoolTerminatingCapacity: { avg: wpTerm },
          WarmPoolTotalCapacity: { avg: wpTotal },
          WarmPoolWarmedCapacity: { avg: wpWarmed },
        },
      },
    },
    event: {
      category: ["host"],
      type: ["info"],
      outcome: isErr ? "failure" : "success",
      dataset: "aws.autoscaling",
      provider: "autoscaling.amazonaws.com",
      duration: activityDurationSec * 1e9,
    },
    message,
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
  const imageId = `ami-${randHexId(8)}`;
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
      type: ["info"],
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
  const outpostId = `op-` + randId(17).toLowerCase();
  const outpostArn = `arn:aws:outposts:${region}:${acct.id}:outpost/${outpostId}`;
  const siteId = `os-` + randId(17).toLowerCase();
  const rackId = `or-` + randId(17).toLowerCase();
  const instanceType = rand(["m5.xlarge", "m5.2xlarge", "c5.xlarge", "r5.xlarge", "m5d.xlarge"]);
  const availableInstanceCount = randInt(0, 20);
  const totalInstanceCount = randInt(20, 40);
  const r = randFloat(0, 1);
  const scenario =
    r < 0.26
      ? "rack_status"
      : r < 0.46
        ? "capacity_check"
        : r < 0.65
          ? "instance_launch"
          : r < 0.82
            ? "network_reachability"
            : "service_link_health";
  const connectivityStatus =
    scenario === "network_reachability"
      ? Math.random() < 0.72
        ? "Connected"
        : rand(["Disconnected", "Degraded"])
      : "Connected";
  const capacityStatus =
    scenario === "capacity_check"
      ? Math.random() < 0.78
        ? rand(["Active", "Active", "Scheduled"])
        : rand(["InsufficientCapacity", "Degraded"])
      : rand(["Active", "Active", "Scheduled"]);
  const badNetwork = scenario === "network_reachability" && connectivityStatus !== "Connected";
  const badCapacity = scenario === "capacity_check" && capacityStatus === "InsufficientCapacity";
  const isErr = badNetwork || badCapacity || Math.random() < er;
  const assetState = rand(["ACTIVE", "ACTIVE", "RETIRING", "ISOLATED"]);
  const serviceLink = {
    vpc_id: `vpc-${randHexId(8)}`,
    service_linked_role: `AWSServiceRoleForOutposts`,
    route_table_revision: randInt(1, 12),
    last_health_ping_ms: randInt(5, isErr ? 800 : 40),
  };
  const rackTelemetry = {
    power_kw: Number(randFloat(8, isErr ? 40 : 24)),
    ambient_c: randInt(18, 32),
    fabric_links_up: randInt(isErr ? 0 : 2, 4),
  };
  const errCode = rand([
    "ValidationException",
    "InternalServerException",
    "ConflictException",
    "NotFoundException",
  ] as const);
  const messages: Record<string, string> = {
    rack_status: `Rack ${rackId}: asset_state=${assetState} lifecycle=${rand(["NORMAL", "RETIRING"])} firmware=${rand(["2.14.5", "2.15.0"])}`,
    capacity_check: `ListCapacity: ${availableInstanceCount}/${totalInstanceCount} ${instanceType} available status=${capacityStatus}`,
    instance_launch: `RunInstances on ${outpostId} (${instanceType}) placement_host=${randId(8)} pool=${rand(["POOL_A", "POOL_B"])}`,
    network_reachability: `LACP ${rand(["AGG1", "AGG2"])} status connectivity=${connectivityStatus} LOS=${randFloat(0, isErr ? 2.5 : 0.01).toFixed(3)}%`,
    service_link_health: `AWSServiceRoleForOutposts health OK=${!isErr} route_sync=${serviceLink.route_table_revision} ping=${serviceLink.last_health_ping_ms}ms`,
  };
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
        scenario,
        instance_type: instanceType,
        available_instance_count: availableInstanceCount,
        total_instance_count: totalInstanceCount,
        capacity_status: capacityStatus,
        connectivity_status: connectivityStatus,
        asset_state: assetState,
        service_link:
          scenario === "service_link_health" || Math.random() < 0.35 ? serviceLink : undefined,
        ...(scenario === "rack_status" || scenario === "instance_launch"
          ? { rack_telemetry: rackTelemetry }
          : {}),
      },
    },
    event: {
      action: scenario,
      outcome: isErr ? "failure" : "success",
      category: ["host"],
      type: ["info"],
      dataset: "aws.outposts",
      provider: "outposts.amazonaws.com",
      duration: randInt(100, 5000) * 1e6,
    },
    message: isErr ? `${messages[scenario]} — ${errCode}` : messages[scenario],
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errCode,
            message: `Outposts ${scenario} fault on ${outpostId}`,
            type: "aws",
          },
        }
      : {}),
  };
}

function generateWavelengthLog(ts: string, er: number): EcsDocument {
  const acct = randAccount();
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
  const instanceId = `i-${randHexId(17)}`;
  const instanceType = rand(["t3.medium", "t3.xlarge", "g4dn.2xlarge", "r5.large", "c5.2xlarge"]);
  const carrierGwId = `cagw-${randId(17).toLowerCase()}`;
  const subnetId = `subnet-${randHexId(17)}`;
  const carrierIp = randPrivateIp();
  const ueIp = randPrivateIp();
  const bandwidthAllowanceGbps = randInt(1, 25);
  const r = randFloat(0, 1);
  const scenario =
    r < 0.24
      ? "carrier_gateway_attach"
      : r < 0.44
        ? "edge_compute_launch"
        : r < 0.62
          ? "low_latency_check"
          : r < 0.78
            ? "throughput_probe"
            : r < 0.92
              ? "subnet_association"
              : "metadata_refresh";
  const gwFail = scenario === "carrier_gateway_attach" && Math.random() < 0.22;
  const latentFail =
    (scenario === "low_latency_check" && Math.random() < 0.28) ||
    (scenario === "edge_compute_launch" && Math.random() < 0.12);
  const isErr = gwFail || latentFail || Math.random() < er;
  const uplinkMbps = Number(randFloat(1, isErr ? 10 : 500));
  const downlinkMbps = Number(randFloat(1, isErr ? 10 : 1000));
  const latencyMs = Number(randFloat(1, isErr ? 50 : 10));
  const errorCodeApi = rand([
    "InsufficientCapacityInWavelengthZone",
    "CarrierGatewayLimitExceeded",
    "BandwidthLimitExceeded",
    "InvalidWavelengthZone",
  ] as const);
  const edgeLaunch = {
    ami_id: `ami-${randHexId(8)}`,
    launch_template: `lt-${randId(8)}`,
    placement_tenancy: "default",
    carrier_route_table: `rtb-${randHexId(8)}`,
  };
  const carrierGateway = {
    state: gwFail ? rand(["failed", "pending"]) : "available",
    attachment_id: `cagw-attach-${randId(8)}`,
    amazon_side_asn: randInt(64512, 65534),
  };
  const latencyProbe = {
    target_host: rand(["edge-core", "5gc-upf", "mec-app"]),
    rtt_us_p99: randInt(isErr ? 500 : 120, isErr ? 12000 : 800),
    jitter_ms: Number(randFloat(0.1, isErr ? 12 : 1.8)),
    samples: randInt(20, 200),
  };
  const messages: Record<string, string> = {
    carrier_gateway_attach: `CreateCarrierGateway ${carrierGwId} subnet=${subnetId} state=${carrierGateway.state}`,
    edge_compute_launch: `RunInstances ${instanceType} zone=${wz.zone} instance=${instanceId} template=${edgeLaunch.launch_template}`,
    low_latency_check: `HealthCheck UE=${ueIp.slice(0, 8)}… carrier=${wz.carrier} p99=${latencyProbe.rtt_us_p99 / 1000}ms jitter=${latencyProbe.jitter_ms}`,
    throughput_probe: `BW test UL=${uplinkMbps.toFixed(1)}Mbps DL=${downlinkMbps.toFixed(1)}Mbps quota=${bandwidthAllowanceGbps}Gbps`,
    subnet_association: `AssociateCarrierGateway vpc=vpc-${randHexId(8)} route_table=${edgeLaunch.carrier_route_table} assoc=${carrierGateway.attachment_id}`,
    metadata_refresh: `IMDS token refresh ttl=${randInt(1, 6)}h on ${instanceId}`,
  };
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
        scenario,
        instance_id: instanceId,
        instance_type: instanceType,
        carrier_gateway_id: carrierGwId,
        subnet_id: subnetId,
        carrier_ip: carrierIp,
        ue_ip: ueIp,
        bandwidth_allowance_gbps: bandwidthAllowanceGbps,
        carrier_gateway:
          scenario === "carrier_gateway_attach" || scenario === "subnet_association"
            ? carrierGateway
            : undefined,
        edge_launch:
          scenario === "edge_compute_launch" || scenario === "metadata_refresh"
            ? edgeLaunch
            : undefined,
        latency_probe: scenario === "low_latency_check" || latentFail ? latencyProbe : undefined,
        network: {
          uplink_mbps: uplinkMbps,
          downlink_mbps: downlinkMbps,
          latency_ms: latencyMs,
          packet_loss_pct: isErr ? Number(randFloat(1, 15)) : Number(randFloat(0, 0.1)),
        },
        api_error_code: isErr ? errorCodeApi : null,
      },
    },
    source: { ip: ueIp },
    event: {
      action: scenario,
      outcome: isErr ? "failure" : "success",
      category: ["network", "host"],
      type: ["connection"],
      dataset: "aws.wavelength",
      provider: "ec2.amazonaws.com",
      duration: randInt(10, 500) * 1e6,
    },
    message: isErr
      ? `Wavelength [${wz.city}/${wz.carrier}] ${scenario}: ${errorCodeApi} (${instanceId})`
      : messages[scenario],
    log: { level: isErr ? "error" : latencyMs > 20 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: errorCodeApi,
            message: `Wavelength ${scenario} failed in ${wz.zone}`,
            type: "aws",
          },
        }
      : {}),
  };
}

function generateMainframeModernizationLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const applicationId = `app-${randId(6).toLowerCase()}`;
  const environmentId = `env-${randId(8).toLowerCase()}`;
  const engineType = rand(["microfocus", "bluage"]);
  const deploymentId = `deploy-${randId(8).toLowerCase()}`;
  const r = randFloat(0, 1);
  const scenario =
    r < 0.26
      ? "migration_assess"
      : r < 0.48
        ? "refactor_start"
        : r < 0.68
          ? "replatform_deploy"
          : r < 0.86
            ? "runtime_update"
            : "batch_cutover";
  const assessReport = {
    cobol_loc: randInt(50_000, 5_000_000),
    dependencies_resolved: randInt(100, 9000),
    blocker_count: randInt(0, scenario === "migration_assess" && Math.random() < 0.25 ? 12 : 0),
  };
  const refactor = {
    project_id: `ref-${randId(6)}`,
    transform_rules_applied: randInt(5, 200),
    compile_warnings: randInt(0, 120),
  };
  const replatform = {
    target_runtime: rand(["AWS Mainframe Runtime", "containerized-mf"]),
    cloudformation_stack: `m2-${randId(8)}`,
    blue_green_slice_pct: randInt(5, 50),
  };
  const risky =
    scenario === "replatform_deploy" ||
    scenario === "runtime_update" ||
    scenario === "batch_cutover";
  const isErr =
    (scenario === "migration_assess" && assessReport.blocker_count > 0 && Math.random() < 0.55) ||
    (risky && Math.random() < 0.24) ||
    Math.random() < er;
  const batchJobStatus = isErr ? "Failed" : rand(["Succeeded", "Running", "Succeeded"]);
  const batchJobsRunning = isErr ? 0 : randInt(0, 20);
  const onlineTps = isErr ? 0 : Number(randFloat(1, 500));
  const cpuUtilization = isErr ? Number(randFloat(90, 100)) : Number(randFloat(5, 75));
  const errCode = rand([
    "ServiceQuotaExceededException",
    "InternalServerException",
    "AccessDeniedException",
    "ResourceNotFoundException",
  ] as const);
  const messages: Record<string, string> = {
    migration_assess: `GetAssessment ${applicationId}: loc=${assessReport.cobol_loc} blockers=${assessReport.blocker_count}`,
    refactor_start: `StartTransform ${refactor.project_id} rules=${refactor.transform_rules_applied} warnings=${refactor.compile_warnings}`,
    replatform_deploy: `CreateDeployment ${deploymentId} stack=${replatform.cloudformation_stack} slice=${replatform.blue_green_slice_pct}%`,
    runtime_update: `UpdateRuntime ${environmentId} engine=${engineType} build=${rand(["R2024-09", "R2025-01"])}`,
    batch_cutover: `Batch ${rand(["PAYROLL", "LEDGER", "CLAIMS"])} job state=${batchJobStatus} cput=${cpuUtilization.toFixed(1)}%`,
  };
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
        scenario,
        batch_job_status: batchJobStatus,
        assessment: scenario === "migration_assess" ? assessReport : undefined,
        refactor: scenario === "refactor_start" ? refactor : undefined,
        replatform: scenario === "replatform_deploy" ? replatform : undefined,
        metrics: {
          batch_jobs_running: batchJobsRunning,
          online_transactions_per_sec: onlineTps,
          cpu_utilization: cpuUtilization,
        },
        api_error_code: isErr ? errCode : null,
      },
    },
    event: {
      action: scenario,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.m2",
      provider: "m2.amazonaws.com",
      duration: randInt(100, isErr ? 30000 : 5000) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.m2", namespace: "default" },
    message: isErr ? `${messages[scenario]} — ${errCode}` : messages[scenario],
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errCode,
            message: `M2 ${scenario} failed for ${applicationId}`,
            type: "aws",
          },
        }
      : {}),
  };
}

function generateParallelComputingLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const clusterId = `pcs-${randId(8).toLowerCase()}`;
  const scheduler = rand(["slurm", "slurm", "aws-batch-style"]);
  const queueName = rand(["high-priority", "batch", "gpu"]);
  const jobId = `job-${randInt(1, 999999)}`;
  const r = randFloat(0, 1);
  const scenario =
    r < 0.26
      ? "cluster_create"
      : r < 0.46
        ? "job_submit"
        : r < 0.62
          ? "node_scale"
          : r < 0.78
            ? "mpi_barrier"
            : r < 0.9
              ? "queue_drain"
              : "scheduler_resync";
  const scalingActivity = {
    target_nodes: randInt(4, 2800),
    active_nodes: randInt(2, 800),
    action: rand(["SCALE_OUT", "SCALE_IN", "REPLACE_UNHEALTHY"]),
  };
  const mpi = {
    comm_world_size: randInt(64, 16384),
    barrier_wait_ms_p99: randInt(1, 120),
    ibv_retries: randInt(0, 2),
    collective: rand(["MPI_Barrier", "MPI_Allreduce", "MPI_Ibarrier"]),
  };
  const jobSubmit = {
    script_path: `/shared/jobs/${rand(["cfd", "molecular", "weather"])}.sbatch`,
    gres_gpu: randInt(0, 8),
    walltime_hours: randInt(1, 96),
    qos: rand(["interactive", "normal", "premium"]),
  };
  const risky =
    scenario === "job_submit" || scenario === "node_scale" || scenario === "mpi_barrier";
  const isErr = (risky && Math.random() < 0.26) || Math.random() < er;
  const jobState =
    scenario === "job_submit" && !isErr
      ? rand(["SUBMITTED", "PENDING", "RUNNING"])
      : isErr
        ? "FAILED"
        : rand(["PENDING", "RUNNING", "COMPLETED"]);
  const runningJobs = isErr && scenario === "node_scale" ? randInt(0, 80) : randInt(0, 500);
  const pendingJobs = randInt(0, isErr ? 1000 : 200);
  const computeNodesActive =
    isErr && scenario === "cluster_create" ? randInt(0, 4) : randInt(1, 1000);
  const errCode = rand([
    "ValidationException",
    "ConflictException",
    "InternalServerException",
    "AccessDeniedException",
  ] as const);
  const messages: Record<string, string> = {
    cluster_create: `CreateCluster ${clusterId} controller=${scheduler} vpc=${`vpc-${randHexId(8)}`}`,
    job_submit: `sbatch ${jobSubmit.script_path} QOS=${jobSubmit.qos} gpus=${jobSubmit.gres_gpu} -> ${jobId}`,
    node_scale: `Fleet scale ${scalingActivity.action}: target=${scalingActivity.target_nodes} live=${scalingActivity.active_nodes}`,
    mpi_barrier: `${mpi.collective} size=${mpi.comm_world_size} p99_wait=${mpi.barrier_wait_ms_p99}ms ibv_retries=${mpi.ibv_retries}`,
    queue_drain: `Queue ${queueName} drain_requested=${rand([true, false])} backlog=${pendingJobs}`,
    scheduler_resync: `Slurm REST slurmctld@${rand(["10.0.1.2", "10.1.44.88"])} version=${rand(["23.02", "23.11"])}`,
  };
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
        scenario,
        queue_name: queueName,
        job_id: jobId,
        job_state: jobState,
        mpi: scenario === "mpi_barrier" || scenario === "job_submit" ? mpi : undefined,
        scaling: scenario === "node_scale" ? scalingActivity : undefined,
        workload: scenario === "job_submit" ? jobSubmit : undefined,
        metrics: {
          running_jobs: runningJobs,
          pending_jobs: pendingJobs,
          compute_nodes_active: computeNodesActive,
        },
        api_error_code: isErr ? errCode : null,
      },
    },
    event: {
      action: scenario,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.pcs",
      provider: "pcs.amazonaws.com",
      duration: randInt(1, isErr ? 60000 : 3600) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.pcs", namespace: "default" },
    message: isErr ? `${messages[scenario]} — ${errCode}` : messages[scenario],
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            code: errCode,
            message: `PCS ${scenario} failed on cluster ${clusterId}`,
            type: "aws",
          },
        }
      : {}),
  };
}

function generateEvsLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const environmentId = `evs-${randId(8).toLowerCase()}`;
  const vcenterHostname = `vcenter-${randId(6).toLowerCase()}.internal`;
  const esxiVersion = "8.0.3";
  const hostCount = randInt(3, 20);
  const vsanDatastoreId = `datastore-${randInt(1, 999)}`;
  const r = randFloat(0, 1);
  const scenario =
    r < 0.27
      ? "vmware_host_provision"
      : r < 0.46
        ? "vsan_extend"
        : r < 0.62
          ? "nsx_configure"
          : r < 0.79
            ? "ha_failover_drill"
            : r < 0.93
              ? "drs_rebalance"
              : "lifecycle_snapshot";
  const vmwareHost = {
    bios_uuid: randUUID(),
    mgmt_ip: randPrivateIp(),
    cluster_name: rand(["mgmt-a", "edge-b"]),
    maintenance_mode: rand(["false", "false", "true"]),
  };
  const vsan = {
    stripe_width: randInt(2, 8),
    fault_domains: randInt(2, 5),
    resync_bytes_outstanding:
      scenario === "vsan_extend" && Math.random() < 0.35 ? randInt(1e9, 15e11) : randInt(0, 5e9),
    disk_group: `dg-${randId(4)}`,
  };
  const nsx = {
    tz_name: rand(["OVERLAY-TZ", "VLAN-uplink"]),
    tier0: `tier0-${randId(4)}`,
    segment_count: randInt(5, 200),
    edge_cluster: rand(["EDGE-A", "EDGE-B"]),
  };
  const risky =
    scenario === "vmware_host_provision" ||
    scenario === "vsan_extend" ||
    scenario === "nsx_configure";
  const isErr =
    (risky && Math.random() < 0.25) ||
    (scenario === "ha_failover_drill" && Math.random() < 0.2) ||
    Math.random() < er;
  const hostsOnline =
    scenario === "vmware_host_provision" || scenario === "ha_failover_drill"
      ? isErr
        ? randInt(1, Math.max(1, hostCount - 1))
        : hostCount
      : hostCount;
  const vsanCapacityUsedTb = Number(randFloat(1, 100));
  const vcpuAllocationRatio = Number(randFloat(1, isErr ? 20 : 8));
  const errCode = rand([
    "ServiceUnavailableException",
    "ConflictException",
    "InternalServerException",
    "ValidationException",
  ] as const);
  const messages: Record<string, string> = {
    vmware_host_provision: `AddHost ${vmwareHost.mgmt_ip} bios=${vmwareHost.bios_uuid.slice(0, 8)}… cluster=*${vmwareHost.cluster_name}`,
    vsan_extend: `vSAN ResizeDiskGroup ${vsan.disk_group} stripe=${vsan.stripe_width} resync=${vsan.resync_bytes_outstanding}B`,
    nsx_configure: `NSX ${nsx.tier0}/${nsx.tz_name}: segments=${nsx.segment_count} edge=${nsx.edge_cluster}`,
    ha_failover_drill: `vSphere HA restart priority=${rand(["medium", "high"])} VMs_affected=${isErr ? randInt(10, 80) : 0}`,
    drs_rebalance: `DRS lvl=${rand([1, 2, 3])} mig_recs=${randInt(0, 12)} vMotion_window=${randInt(5, 45)}s`,
    lifecycle_snapshot: `SDDC snapshot policy compliance=${rand(["OK", "OK", "STALE"])}`,
  };
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
        scenario,
        host_count: hostCount,
        vsan_datastore_id: vsanDatastoreId,
        vmware_host:
          scenario === "vmware_host_provision" || scenario === "drs_rebalance"
            ? vmwareHost
            : undefined,
        vsan: scenario === "vsan_extend" || scenario === "lifecycle_snapshot" ? vsan : undefined,
        nsx: scenario === "nsx_configure" ? nsx : undefined,
        metrics: {
          hosts_online: hostsOnline,
          vsan_capacity_used_tb: vsanCapacityUsedTb,
          vcpu_allocation_ratio: vcpuAllocationRatio,
        },
        api_error_code: isErr ? errCode : null,
      },
    },
    event: {
      action: scenario,
      outcome: isErr ? "failure" : "success",
      category: ["host"],
      type: ["info"],
      dataset: "aws.evs",
      provider: "evs.amazonaws.com",
      duration: randInt(50, 2000) * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.evs", namespace: "default" },
    message: isErr ? `${messages[scenario]} — ${errCode}` : messages[scenario],
    log: { level: isErr ? "error" : hostsOnline < hostCount ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: errCode,
            message: `EVS ${scenario} failed for ${environmentId}`,
            type: "aws",
          },
        }
      : {}),
  };
}

function generateSimSpaceWeaverLog(ts: string, er: number): EcsDocument {
  const region = rand(REGIONS);
  const acct = randAccount();
  const simulationId = `sim-${randId(10).toLowerCase()}`;
  const appName = rand([
    "urban-traffic-sim",
    "crowd-simulation",
    "logistics-optimizer",
    "battlefield-sim",
  ]);
  const domainName = rand(["Terrain", "Agents", "Traffic"]);
  const clockTickMs = randInt(100, 1000);
  const r = randFloat(0, 1);
  const scenario =
    r < 0.24
      ? "simulation_create"
      : r < 0.4
        ? "entity_spawn"
        : r < 0.56
          ? "clock_tick"
          : r < 0.72
            ? "spatial_partition"
            : r < 0.87
              ? "state_snapshot"
              : "weaver_sync";
  const risky =
    scenario === "spatial_partition" ||
    scenario === "clock_tick" ||
    scenario === "simulation_create";
  const isErr = (risky && Math.random() < 0.23) || Math.random() < er;
  const spatial = {
    partition_id: randInt(0, 511),
    cell_size_m: Number(randFloat(0.25, isErr ? 64 : 8)),
    halo_exchange_bytes: randInt(1024, isErr ? 10_000_000_000 : 900_000_000),
    load_imbalance_pct: Number(randFloat(0.1, isErr ? 62 : 9)),
    tree_depth: randInt(4, 22),
  };
  const entity = {
    archetype_id: rand(["PED", "VEHICLE", "SIGNAL"]),
    spawn_rate_per_sec: randInt(50, isErr ? 20000 : 4000),
    max_entities_budget: randInt(10_000, 2_000_000),
  };
  const clock = {
    tick_index: randInt(0, Math.floor(isErr ? 100_000_000_000 : 900_000_000)),
    logical_time_ms: randInt(0, 86_400_000),
    drift_budget_ms: randInt(0, isErr ? 50 : 4),
    authority: rand(["PRIMARY", "STANDBY"]),
  };
  const simulationStatus = isErr ? "FAILED" : rand(["RUNNING", "STARTING", "RUNNING"]);
  const entitiesCount =
    scenario === "entity_spawn"
      ? randInt(isErr ? 0 : 100, isErr ? 200 : 1_000_000)
      : randInt(100, 1_000_000);
  const computeWorkers =
    scenario === "simulation_create" ? randInt(isErr ? 1 : 4, isErr ? 20 : 200) : randInt(1, 200);
  const clockLagMs = isErr ? randInt(120, 5000) : randInt(0, 65);
  const errCode = rand([
    "ServiceUnavailableException",
    "ConflictException",
    "InternalServerException",
    "ValidationException",
  ] as const);
  const messages: Record<string, string> = {
    simulation_create: `CreateSimulation workload=${appName} workers=${computeWorkers} domainSeed=${randId(8)}`,
    entity_spawn: `SpawnBatch archetype=${entity.archetype_id} rate=${entity.spawn_rate_per_sec}/s cap=${entity.max_entities_budget}`,
    clock_tick: `GlobalClock idx=${clock.tick_index} drift=${clock.drift_budget_ms}ms role=${clock.authority}`,
    spatial_partition: `SpacePartition pid=${spatial.partition_id} haloB=${spatial.halo_exchange_bytes} imbalance=${spatial.load_imbalance_pct}% depth=${spatial.tree_depth}`,
    state_snapshot: `Checkpoint s3://ssw-${acct.id}/${simulationId}/ckpt-${randInt(1, 99)}.bin (${randInt(50, 800)} GiB)`,
    weaver_sync: `WeaverRouteTable version=${randInt(1, 40)} domains=${randInt(2, 12)}`,
  };
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
        scenario,
        clock_tick_ms: clockTickMs,
        simulation_status: simulationStatus,
        spatial: scenario === "spatial_partition" ? spatial : undefined,
        entity_budget: scenario === "entity_spawn" ? entity : undefined,
        simulation_clock:
          scenario === "clock_tick" || scenario === "weaver_sync" ? clock : undefined,
        metrics: {
          entities_count: entitiesCount,
          compute_workers: computeWorkers,
          clock_lag_ms: clockLagMs,
        },
        api_error_code: isErr ? errCode : null,
      },
    },
    event: {
      action: scenario,
      outcome: isErr ? "failure" : "success",
      category: ["process"],
      type: ["info"],
      dataset: "aws.simspaceweaver",
      provider: "simspaceweaver.amazonaws.com",
      duration: clockTickMs * 1e6,
    },
    data_stream: { type: "logs", dataset: "aws.simspaceweaver", namespace: "default" },
    message: isErr ? `${messages[scenario]} — ${errCode}` : messages[scenario],
    log: { level: isErr ? "error" : clockLagMs > 100 ? "warn" : "info" },
    ...(isErr
      ? {
          error: {
            code: errCode,
            message: `SimSpace Weaver ${scenario} failed for ${simulationId}`,
            type: "aws",
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
