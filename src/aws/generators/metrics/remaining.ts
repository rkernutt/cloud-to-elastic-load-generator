/**
 * Dedicated dimensional metric generators for services that previously used the
 * generic CloudWatch fallback (Location, AppStream, Aurora DSQL, RUM, FIS, etc.).
 * Metric names are plausible for each AWS/… namespace.
 */

import {
  REGIONS,
  ACCOUNTS,
  rand,
  randInt,
  randFloat,
  randId,
  dp,
  stat,
  counter,
  metricDoc,
  pickCloudContext,
  jitter,
} from "./helpers.js";
import { ELASTIC_METRICS_DATASET_MAP, ELASTIC_DATASET_MAP } from "../../../data/elasticMaps";
import type { EcsDocument } from "../types.js";

function dataset(svcId: string): string {
  const m = ELASTIC_METRICS_DATASET_MAP[svcId as keyof typeof ELASTIC_METRICS_DATASET_MAP];
  const d = ELASTIC_DATASET_MAP[svcId as keyof typeof ELASTIC_DATASET_MAP];
  return m ?? d ?? `aws.${svcId}`;
}

// ─── Location Service (AWS/Location) ──────────────────────────────────────────

export function generateLocationserviceMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const searches = randInt(500, 800_000);
  return [
    metricDoc(
      ts,
      "locationservice",
      dataset("locationservice"),
      region,
      account,
      { IndexName: rand(["places", "assets", "delivery-zones"]) },
      {
        SearchPlaceIndexForTextSuccessCount: counter(searches),
        SearchPlaceIndexForTextFailureCount: counter(isErr ? randInt(1, 12_000) : randInt(0, 200)),
        GeocodeSuccessCount: counter(randInt(200, 400_000)),
      }
    ),
  ];
}

// ─── AppStream 2.0 (AWS/AppStream) ─────────────────────────────────────────────

export function generateAppstreamMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const desired = randInt(5, 500);
  const actual = Math.max(0, desired - (Math.random() < er ? randInt(1, 40) : 0));
  return [
    metricDoc(
      ts,
      "appstream",
      dataset("appstream"),
      region,
      account,
      { FleetName: `fleet-${randId(8).toLowerCase()}` },
      {
        ActualCapacity: counter(actual),
        AvailableCapacity: counter(randInt(0, actual)),
        DesiredCapacity: counter(desired),
        InsufficientCapacityErrorCount: counter(
          Math.random() < er ? randInt(1, 800) : randInt(0, 5)
        ),
      }
    ),
  ];
}

// ─── Aurora DSQL (AWS/AuroraDSQL) ─────────────────────────────────────────────

export function generateAuroradsqlMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const ok = randInt(10_000, 5_000_000);
  return [
    metricDoc(
      ts,
      "auroradsql",
      dataset("auroradsql"),
      region,
      account,
      { ClusterId: `adsql-${randId(12).toLowerCase()}` },
      {
        QueriesSucceeded: counter(ok),
        QueriesFailed: counter(isErr ? randInt(1, 8_000) : randInt(0, 120)),
        QueryDuration: stat(dp(jitter(12, 8, 1, 900))),
        ActiveConnections: counter(randInt(2, 8_000)),
      }
    ),
  ];
}

// ─── Bedrock Data Automation (AWS/BedrockDataAutomation) ──────────────────────

export function generateBedrockdataautomationMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  return [
    metricDoc(
      ts,
      "bedrockdataautomation",
      dataset("bedrockdataautomation"),
      region,
      account,
      { BlueprintArn: `arn:aws:bedrock:${region}:${account.id}:blueprint/${randId(10)}` },
      {
        ExtractionJobsStarted: counter(randInt(5, 50_000)),
        ExtractionJobsSucceeded: counter(randInt(4, 48_000)),
        ExtractionJobsFailed: counter(isErr ? randInt(1, 2_000) : randInt(0, 40)),
        DocumentsProcessed: counter(randInt(1_000, 120_000_000)),
        ExtractionLatency: stat(dp(jitter(3_500, 2_000, 200, 600_000))),
      }
    ),
  ];
}

// ─── CloudHSM (AWS/CloudHSM) ───────────────────────────────────────────────────

export function generateCloudhsmMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const unhealthy = Math.random() < er ? randInt(1, 4) : 0;
  return [
    metricDoc(
      ts,
      "cloudhsm",
      dataset("cloudhsm"),
      region,
      account,
      { ClusterId: `cluster-${randId(16).toLowerCase()}` },
      {
        HsmKeysSessionCount: counter(randInt(10, 500_000)),
        UserCryptoOperations: counter(randInt(50_000, 50_000_000)),
        HsmUnhealthy: counter(unhealthy),
      }
    ),
  ];
}

// ─── CloudWatch RUM (AWS/RUM) ─────────────────────────────────────────────────

export function generateCloudwatchrumMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const sessions = randInt(1_000, 4_000_000);
  const errs = Math.random() < er ? randInt(50, 200_000) : randInt(0, 5_000);
  return [
    metricDoc(
      ts,
      "cloudwatchrum",
      dataset("cloudwatchrum"),
      region,
      account,
      { ApplicationId: `${randId(8).toLowerCase()}-rum-app` },
      {
        SessionCount: counter(sessions),
        PageViews: counter(randInt(sessions, sessions * 40)),
        JavaScriptErrors: counter(errs),
        LCP: stat(dp(jitter(2_400, 800, 800, 12_000))),
      }
    ),
  ];
}

// ─── End User Messaging (SMS / voice) ─────────────────────────────────────────

export function generateEndusermessagingMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const sent = randInt(5_000, 12_000_000);
  return [
    metricDoc(
      ts,
      "endusermessaging",
      dataset("endusermessaging"),
      region,
      account,
      { ConfigurationSetName: rand(["marketing", "otp", "alerts", "support"]) },
      {
        MessageSendAttempts: counter(sent),
        MessageDeliverySuccess: counter(isErr ? Math.floor(sent * 0.92) : Math.floor(sent * 0.987)),
        MessageDeliveryFailures: counter(isErr ? randInt(800, 500_000) : randInt(0, 8_000)),
        OptOuts: counter(randInt(0, 12_000)),
      }
    ),
  ];
}

// ─── Entity Resolution ────────────────────────────────────────────────────────

export function generateEntityresolutionMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const processed = randInt(10_000, 80_000_000);
  return [
    metricDoc(
      ts,
      "entityresolution",
      dataset("entityresolution"),
      region,
      account,
      { WorkflowName: `wf-${rand(["pii", "mdm", "crm-merge"] as const)}-${randInt(1, 99)}` },
      {
        RecordsProcessed: counter(processed),
        MatchGroupsFound: counter(randInt(1_000, processed / 2)),
        JobRunsSucceeded: counter(randInt(2, 8_000)),
        JobRunsFailed: counter(isErr ? randInt(1, 400) : randInt(0, 15)),
      }
    ),
  ];
}

// ─── Elastic VS (environment virtualization) ─────────────────────────────────

export function generateEvsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  return [
    metricDoc(
      ts,
      "evs",
      dataset("evs"),
      region,
      account,
      { EnvironmentId: `evs-${randId(14).toLowerCase()}` },
      {
        EnvironmentStatusHealthy: counter(isErr ? randInt(0, 1) : 1),
        ActiveSessionCount: counter(randInt(0, 25_000)),
        ApiRequestCount: counter(randInt(5_000, 50_000_000)),
        ThrottledRequests: counter(Math.random() < er * 0.3 ? randInt(1, 50_000) : randInt(0, 200)),
      }
    ),
  ];
}

// ─── Mainframe Modernization (AWS/M2) ──────────────────────────────────────────

export function generateMainframemodernizationMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const ok = randInt(20, 12_000);
  return [
    metricDoc(
      ts,
      "mainframemodernization",
      dataset("mainframemodernization"),
      region,
      account,
      { ApplicationId: `m2-app-${randId(10).toLowerCase()}` },
      {
        BatchJobSucceeded: counter(ok),
        BatchJobFailed: counter(isErr ? randInt(1, 800) : randInt(0, 25)),
        BatchJobDuration: stat(dp(jitter(420, 280, 30, 86_400))),
        DataSetImportBytes: counter(randInt(1_000_000, 50_000_000_000)),
      }
    ),
  ];
}

// ─── Payment Cryptography ───────────────────────────────────────────────────────

export function generatePaymentcryptographyMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const ops = randInt(50_000, 900_000_000);
  return [
    metricDoc(
      ts,
      "paymentcryptography",
      dataset("paymentcryptography"),
      region,
      account,
      { KeyArn: `arn:aws:payment-cryptography:${region}:${account.id}:key/${randId(12)}` },
      {
        ApiCallCount: counter(ops),
        CryptographicOperationSuccess: counter(
          isErr ? Math.floor(ops * 0.985) : Math.floor(ops * 0.999)
        ),
        CryptographicOperationFailure: counter(isErr ? randInt(500, 80_000) : randInt(0, 2_000)),
      }
    ),
  ];
}

// ─── Device Farm ─────────────────────────────────────────────────────────────

export function generateDevicefarmMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const runs = randInt(5, 8_000);
  return [
    metricDoc(
      ts,
      "devicefarm",
      dataset("devicefarm"),
      region,
      account,
      {
        ProjectArn: `arn:aws:devicefarm:${region}:${account.id}:project:${randId(32).toLowerCase()}`,
      },
      {
        TestRunCount: counter(runs),
        DeviceMinutes: counter(randInt(runs * 3, runs * 9_000)),
        FailedTests: counter(isErr ? randInt(10, 120_000) : randInt(0, 4_000)),
        PassedTests: counter(isErr ? randInt(5_000, 500_000) : randInt(20_000, 2_000_000)),
      }
    ),
  ];
}

// ─── Amazon Q Developer ───────────────────────────────────────────────────────

export function generateQdeveloperMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const suggestions = randInt(10_000, 8_000_000);
  return [
    metricDoc(
      ts,
      "qdeveloper",
      dataset("qdeveloper"),
      region,
      account,
      { ClientId: `qdev-${randId(12).toLowerCase()}` },
      {
        SuggestionsGenerated: counter(suggestions),
        SuggestionsAccepted: counter(Math.floor(suggestions * jitter(0.42, 0.15, 0.12, 0.78))),
        InlineCompletionLatency: stat(dp(jitter(85, 45, 12, 2_400))),
        InvocationErrors: counter(isErr ? randInt(50, 40_000) : randInt(0, 800)),
      }
    ),
  ];
}

// ─── Network Access Analyzer ──────────────────────────────────────────────────

export function generateNetworkaccessanalyzerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const analyzerArn = `arn:aws:access-analyzer:${region}:${account.id}:analyzer/${randId(28)}`;
  return [
    metricDoc(
      ts,
      "networkaccessanalyzer",
      dataset("networkaccessanalyzer"),
      region,
      account,
      { AnalyzerArn: analyzerArn },
      {
        FindingCount: counter(stressed ? randInt(800, 220_000) : randInt(0, 50_000)),
        NewFindings: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 800)),
        ActiveFindings: counter(stressed ? randInt(5_000, 400_000) : randInt(0, 120_000)),
        ArchiveRuleMatches: counter(Math.random() < er ? randInt(800, 80_000) : randInt(0, 25_000)),
        EvaluationLatencyMilliseconds: stat(
          dp(stressed ? randFloat(800, 9800) : randFloat(90, 1200))
        ),
      }
    ),
    metricDoc(
      ts,
      "networkaccessanalyzer",
      dataset("networkaccessanalyzer"),
      region,
      account,
      {
        AnalyzerArn: analyzerArn,
        ResourceType: rand(["AWS::IAM::Role", "AWS::EC2::SecurityGroup"]),
      },
      {
        InternalEvaluationErrors: counter(Math.random() < er ? randInt(5, 100) : randInt(0, 2)),
        ThrottledAPICalls: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
    metricDoc(
      ts,
      "networkaccessanalyzer",
      dataset("networkaccessanalyzer"),
      region,
      account,
      { AnalyzerArn: analyzerArn, ResourceArn: `arn:aws:iam::${account.id}:role/svc-role` },
      {
        PublicAccessIndicators: counter(
          Math.random() < er ? randInt(200, 50_000) : randInt(0, 3000)
        ),
        CrossAccountPathsFlagged: counter(
          Math.random() < er ? randInt(100, 18_000) : randInt(0, 800)
        ),
      }
    ),
  ];
}

// ─── WorkMail ──────────────────────────────────────────────────────────────────

export function generateWorkmailMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  return [
    metricDoc(
      ts,
      "workmail",
      dataset("workmail"),
      region,
      account,
      { OrganizationId: `m-${randId(34).toLowerCase()}` },
      {
        MessageSendCount: counter(randInt(5_000, 40_000_000)),
        MessageDeliveryFailed: counter(isErr ? randInt(50, 80_000) : randInt(0, 2_000)),
        ActiveUsers: counter(randInt(20, 50_000)),
        CaldavSyncRequests: counter(randInt(1_000, 12_000_000)),
      }
    ),
  ];
}

// ─── Fault Injection Simulator (AWS/FIS) ──────────────────────────────────────

export function generateFisMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const started = randInt(1, 4_000);
  return [
    metricDoc(
      ts,
      "fis",
      dataset("fis"),
      region,
      account,
      { ExperimentTemplateId: `EXTemplate${randId(16).toLowerCase()}` },
      {
        ExperimentsStarted: counter(started),
        ActionsCompleted: counter(isErr ? randInt(1, started * 4) : randInt(started, started * 12)),
        ActionsFailed: counter(isErr ? randInt(1, 600) : randInt(0, 15)),
        ExperimentDuration: stat(dp(jitter(240, 180, 30, 7200))),
      }
    ),
  ];
}

// ─── ARC — Application Recovery Controller (AWS/ARC) ─────────────────────────

export function generateArcMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "arc",
      dataset("arc"),
      region,
      account,
      { RoutingControlName: `rc-${rand(["payments", "auth", "catalog"] as const)}` },
      {
        RoutingControlStateChecks: counter(randInt(50_000, 120_000_000)),
        RoutingControlStateChangeAttempts: counter(randInt(10, 8_000)),
        RoutingControlRejectedCount: counter(Math.random() < er ? randInt(1, 400) : randInt(0, 8)),
        ClusterEndpointHealthy: stat(
          dp(Math.random() < er ? jitter(0.94, 0.04, 0.5, 1) : jitter(0.998, 0.002, 0.95, 1))
        ),
      }
    ),
  ];
}
