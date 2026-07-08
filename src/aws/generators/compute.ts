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
      dataset: "aws.ec2_logs",
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
      `containerd: unpacking layer sha256:${randHexId(40)} (application/vnd.docker.image.rootfs.diff.tar.gzip)`,
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
  const plainMessage = rand(MSGS[level]);
  const ecsCluster = cluster;
  const ecsTaskDefinition = `${taskDefFamily}:${taskDefRev}`;
  const ecsTaskArn = taskArn;
  const message = JSON.stringify({
    ecs_cluster: ecsCluster,
    ecs_task_arn: ecsTaskArn,
    container_name: svc,
    log: plainMessage,
    timestamp: new Date(ts).toISOString(),
    ecs_task_definition: ecsTaskDefinition,
    level,
  });
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
      metadata: { creationTimestamp: iso, namespace: ns, name: pod },
      responseStatus: { code: isErr ? rand([401, 403, 500]) : 200 },
      sourceIPs: [randSourceIp()],
      timestamp: iso,
    });
  } else if (lineKind === "authenticator") {
    useStructuredLogging = true;
    message = JSON.stringify({
      apiVersion: "client.authentication.k8s.io/v1beta1",
      kind: "ExecCredential",
      metadata: { creationTimestamp: iso },
      spec: { clusterName: clusterName },
      status: isErr
        ? { expirationTimestamp: iso, error: 'configmaps "aws-auth" not found' }
        : {
            expirationTimestamp: iso,
            user: {
              username,
              groups: ["system:bootstrappers", "system:nodes"],
              uid: `aws-iam-authenticator:${acct.id}:role/${rand(["eksNodeRole", "node-instance-role"])}`,
            },
          },
    });
  } else if (lineKind === "scheduler") {
    useStructuredLogging = true;
    message = JSON.stringify({
      apiVersion: "v1",
      kind: "Event",
      metadata: { namespace: ns, name: pod, creationTimestamp: iso },
      verb: isErr ? "failed" : "scheduled",
      user: { username: "system:kube-scheduler" },
      objectRef: { kind: "Pod", namespace: ns, name: pod, resource: "pods" },
      message: isErr
        ? `Unable to schedule pod; 0/${randInt(3, 20)} nodes available: insufficient cpu`
        : `Successfully assigned ${ns}/${pod} to ${nodeName}`,
      reason: isErr ? "FailedScheduling" : "Scheduled",
      type: isErr ? "Warning" : "Normal",
    });
  } else if (lineKind === "controller") {
    useStructuredLogging = true;
    message = JSON.stringify({
      apiVersion: "v1",
      kind: "Event",
      metadata: { namespace: ns, name: pod, creationTimestamp: iso },
      verb: isErr ? "sync" : "sync",
      user: { username: "system:kube-controller-manager" },
      objectRef: {
        kind: "Deployment",
        namespace: ns,
        name: pod.split("-")[0],
        resource: "deployments",
        apiVersion: "apps/v1",
      },
      message: isErr
        ? `error syncing deployment ${ns}/${pod.split("-")[0]}: failed to create ReplicaSet: forbidden`
        : `Finished syncing deployment ${ns}/${pod.split("-")[0]}`,
      reason: isErr ? "FailedCreate" : "SuccessfulCreate",
      type: isErr ? "Warning" : "Normal",
    });
  } else if (lineKind === "event") {
    useStructuredLogging = true;
    message = JSON.stringify({
      apiVersion: "v1",
      kind: "Event",
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
      verb,
      user: { username },
    });
  } else if (lineKind === "coredns") {
    useStructuredLogging = true;
    const client = randPrivateIp();
    const qtype = rand(["A", "AAAA", "SRV"]);
    const rcode = isErr ? "SERVFAIL" : "NOERROR";
    message = JSON.stringify({
      apiVersion: "v1",
      kind: "DNSLog",
      metadata: { cluster: clusterName, namespace: ns },
      client,
      query: { type: qtype, name: svcDns },
      rcode,
      duration: Number(randFloat(0.00001, isErr ? 2 : 0.05)),
      level: level === "error" ? "ERROR" : "INFO",
    });
  } else {
    useStructuredLogging = true;
    message = JSON.stringify({
      apiVersion: "v1",
      kind: "PodLog",
      metadata: { cluster: clusterName, namespace: ns, name: pod },
      stream: rand(["stdout", "stderr"]),
      log: kubeletPlain,
      timestamp: iso,
      level,
    });
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
  const message = JSON.stringify({
    version: "0",
    id: randUUID(),
    "detail-type": "Batch Job State Change",
    source: "aws.batch",
    account: acct.id,
    time: new Date(ts).toISOString(),
    region,
    resources: [`arn:aws:batch:${region}:${acct.id}:job/${jobId}`],
    detail: {
      jobName,
      jobId,
      jobQueue,
      status: isErr ? "FAILED" : jobStatus,
      jobDefinition: jobDefName,
      container: { exitCode, logStreamName, attempt },
      statusReason: isErr ? plainMessage : undefined,
      arrayProperties: { size: randInt(1, 100), index: randInt(0, 99) },
    },
  });
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
  const plainMessage = rand(isErr ? MSGS.error : status >= 400 ? MSGS.warn : MSGS.info);
  const useStructuredLogging = Math.random() < 0.55;
  const logSource = rand(["eb-engine", "nginx", "healthd", "platform-hooks"]);
  const message = JSON.stringify(
    logSource === "nginx"
      ? {
          "@timestamp": new Date(ts).toISOString(),
          application: app,
          environment: env,
          instance_id: instanceId,
          remote_addr: clientIp,
          request: `${rand(["GET", "POST"])} ${reqPath} HTTP/1.1`,
          status,
          body_bytes_sent: randInt(100, 12000),
          request_time: Number(randFloat(0.01, latP99 / 1000)),
          upstream_response_time: Number(randFloat(0.01, latP95 / 1000)),
          log_source: "nginx",
        }
      : {
          "@timestamp": new Date(ts).toISOString(),
          application: app,
          environment: env,
          instance_id: instanceId,
          severity: isErr ? "ERROR" : status >= 400 ? "WARN" : "INFO",
          message: plainMessage,
          log_source: logSource,
          platform: rand(["Node.js 18", "Python 3.11", "Docker"]),
        }
  );
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
  const digest = `sha256:${randHexId(40)}`;
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
  const imageSizeBytes = randInt(5e6, 2e9);
  const message = JSON.stringify(
    action === "scan"
      ? {
          eventType: "ImageScanCompleted",
          repositoryName: repo,
          registryId: acct.id,
          imageDigest: digest,
          imageTag: tag,
          scanStatus: isErr ? "COMPLETE_WITH_FINDINGS" : "COMPLETE",
          findingCount,
          findingSeverity: isErr ? rand(SCAN_SEVS) : null,
          error: isErr ? errMsg : undefined,
        }
      : action === "push"
        ? {
            eventType: "PutImage",
            repositoryName: repo,
            registryId: acct.id,
            imageTag: tag,
            imageDigest: digest,
            imageSizeInBytes: imageSizeBytes,
            layerCount,
            error: isErr ? errMsg : undefined,
          }
        : action === "pull"
          ? {
              eventType: "BatchGetImage",
              repositoryName: repo,
              registryId: acct.id,
              imageTag: tag,
              layersFetched: pulledLayers,
              layerCount,
              bytesTransferred: randInt(2e6, 400e6),
              error: isErr ? errMsg : undefined,
            }
          : action === "delete"
            ? {
                eventType: "BatchDeleteImage",
                repositoryName: repo,
                imageDigest: digest,
                imageTag: tag,
                deleted: isErr ? 0 : randInt(1, 3),
                error: isErr ? errMsg : undefined,
              }
            : action === "lifecycle"
              ? {
                  eventType: "LifecyclePolicyExecution",
                  repositoryName: repo,
                  ruleId: lifecycleRuleId,
                  imagesExpired: isErr ? 0 : randInt(1, 8),
                  bytesReclaimed: isErr ? 0 : randInt(5e7, 5e9),
                  error: isErr ? errMsg : undefined,
                }
              : {
                  eventType: "ReplicationComplete",
                  repositoryName: repo,
                  imageDigest: digest,
                  sourceRegion: region,
                  destination: replicationDestination,
                  status: isErr ? "FAILED" : "COMPLETE",
                  error: isErr ? errMsg : undefined,
                }
  );
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
  const wpDesired = useWarmPool ? randInt(2, 10) : 0;
  const wpPending = useWarmPool ? randInt(0, 3) : 0;
  const wpTerm = useWarmPool ? randInt(0, 2) : 0;
  const wpTotal = useWarmPool ? wpDesired + wpPending + wpTerm : 0;
  const wpWarmed = useWarmPool ? randInt(1, Math.max(1, wpTotal)) : 0;
  const message = JSON.stringify({
    ActivityId: activityId,
    AutoScalingGroupName: asg,
    Description: isErr ? errMsg : reason,
    Cause: reason,
    StartTime: new Date(ts).toISOString(),
    StatusCode: isErr ? "Failed" : "Successful",
    StatusMessage: isErr ? errMsg : "",
    Progress: isErr ? 0 : 100,
    Details: {
      AvailabilityZone: `${region}a`,
      InvokedAt: new Date(ts).toISOString(),
    },
    RequestId: randUUID(),
    ...(action === "Launch" || action === "Terminate"
      ? { EC2InstanceId: instanceId, Action: action }
      : {}),
    ...(action === "LifecycleHook"
      ? {
          LifecycleHookName: hookName,
          LifecycleTransition: lifecycleTransition,
          EC2InstanceId: instanceId,
        }
      : {}),
    ...(action === "WarmPoolTransition"
      ? {
          WarmPoolWarmedCapacity: wpWarmed,
          WarmPoolDesiredCapacity: wpDesired,
          EC2InstanceId: instanceId,
        }
      : {}),
    ...(action === "PredictiveScalingForecast"
      ? {
          PredictedCPU: Number(randFloat(45, 92)),
          RecommendedDesiredCapacity: randInt(desired, desired + 6),
        }
      : {}),
  });
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
    message: JSON.stringify({
      pipelineName: pipeline,
      imageVersion: `${randInt(1, 5)}.${randInt(0, 20)}.${randInt(0, 10)}/1`,
      phase,
      phaseStatus: isErr ? "FAILED" : "COMPLETED",
      durationSeconds: dur,
      amiId: isErr ? null : imageId,
      recipeName: rand(["web-server-recipe", "hardened-base", "docker-host"]),
      message: isErr ? errMsg : infoMsg,
      error: isErr ? errMsg : undefined,
    }),
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
    message: JSON.stringify({
      eventType: scenario,
      outpostId,
      outpostArn,
      siteId,
      rackId,
      instanceType,
      availableInstanceCount,
      totalInstanceCount,
      capacityStatus,
      connectivityStatus,
      assetState,
      ...(scenario === "service_link_health" || Math.random() < 0.35 ? { serviceLink } : {}),
      ...(scenario === "rack_status" || scenario === "instance_launch" ? { rackTelemetry } : {}),
      error: isErr ? errCode : undefined,
    }),
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
    message: JSON.stringify({
      eventType: scenario,
      wavelengthZone: wz.zone,
      carrier: wz.carrier,
      city: wz.city,
      instanceId,
      instanceType,
      carrierGatewayId: carrierGwId,
      subnetId,
      network: {
        uplinkMbps,
        downlinkMbps,
        latencyMs,
        packetLossPct: isErr ? Number(randFloat(1, 15)) : Number(randFloat(0, 0.1)),
      },
      ...(scenario === "carrier_gateway_attach" || scenario === "subnet_association"
        ? { carrierGateway }
        : {}),
      ...(scenario === "edge_compute_launch" || scenario === "metadata_refresh"
        ? { edgeLaunch }
        : {}),
      ...(scenario === "low_latency_check" || latentFail ? { latencyProbe } : {}),
      error: isErr ? errorCodeApi : undefined,
    }),
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
    message: JSON.stringify({
      eventType: scenario,
      applicationId,
      environmentId,
      engineType,
      deploymentId,
      batchJobStatus,
      ...(scenario === "migration_assess" ? { assessment: assessReport } : {}),
      ...(scenario === "refactor_start" ? { refactor } : {}),
      ...(scenario === "replatform_deploy" ? { replatform } : {}),
      metrics: {
        batchJobsRunning,
        onlineTransactionsPerSec: onlineTps,
        cpuUtilization,
      },
      error: isErr ? errCode : undefined,
    }),
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
    message: JSON.stringify({
      eventType: scenario,
      clusterId,
      scheduler,
      queueName,
      jobId,
      jobState,
      ...(scenario === "job_submit"
        ? {
            job: {
              id: jobId,
              name: jobSubmit.script_path.split("/").pop(),
              state: jobState,
              qos: jobSubmit.qos,
              gres: { gpu: jobSubmit.gres_gpu },
              walltime: `${jobSubmit.walltime_hours}:00:00`,
              script: jobSubmit.script_path,
            },
          }
        : {}),
      ...(scenario === "mpi_barrier" || scenario === "job_submit" ? { mpi } : {}),
      ...(scenario === "node_scale" ? { scaling: scalingActivity } : {}),
      metrics: { runningJobs, pendingJobs, computeNodesActive },
      error: isErr ? errCode : undefined,
    }),
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
    message: JSON.stringify({
      eventType: scenario,
      environmentId,
      vcenterHostname,
      esxiVersion,
      hostCount,
      vsanDatastoreId,
      ...(scenario === "vmware_host_provision" || scenario === "drs_rebalance"
        ? { vmwareHost }
        : {}),
      ...(scenario === "vsan_extend" || scenario === "lifecycle_snapshot" ? { vsan } : {}),
      ...(scenario === "nsx_configure" ? { nsx } : {}),
      metrics: {
        hostsOnline,
        vsanCapacityUsedTb,
        vcpuAllocationRatio,
      },
      error: isErr ? errCode : undefined,
    }),
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
};
