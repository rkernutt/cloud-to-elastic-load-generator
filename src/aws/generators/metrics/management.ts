/**
 * Dimensional metric generators for AWS management, security operations,
 * governance, and developer tools (Control Tower, Organizations, budgets,
 * Identity Center, Incident Manager, CodeCatalyst, CodeGuru, etc.).
 * Metric names follow CloudWatch namespaces (AWS/…).
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
import type { EcsDocument } from "../types.js";

// ─── Control Tower (AWS/ControlTower) ───────────────────────────────────────────

export function generateControltowerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const succeeded = randInt(5, 2_000);
  return [
    metricDoc(
      ts,
      "controltower",
      "aws.controltower",
      region,
      account,
      { LandingZoneId: `lz-${randId(10).toLowerCase()}` },
      {
        LandingZoneOperationSucceeded: counter(succeeded),
        LandingZoneOperationFailed: counter(isErr ? randInt(1, 120) : randInt(0, 5)),
        ManagedAccountCount: counter(randInt(3, 500)),
      }
    ),
  ];
}

// ─── Organizations (AWS/Organizations) ────────────────────────────────────────

export function generateOrganizationsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const org = `o-${randId(10).toLowerCase()}`;
  return [
    metricDoc(
      ts,
      "organizations",
      "aws.organizations",
      region,
      account,
      { OrganizationId: org },
      {
        AccountCount: counter(randInt(5, 2_000)),
        PolicyAttachmentCount: counter(randInt(10, 15_000)),
        ApiErrorCount: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        HandshakeFailures: counter(Math.random() < er ? randInt(10, 9000) : randInt(0, 120)),
      }
    ),
    metricDoc(
      ts,
      "organizations",
      "aws.organizations",
      region,
      account,
      { OrganizationId: org, PolicyType: rand(["SERVICE_CONTROL_POLICY", "BACKUP_POLICY"]) },
      {
        PolicyMutationLatencyMilliseconds: stat(
          dp(stressed ? randFloat(800, 9200) : randFloat(45, 980))
        ),
        ThrottledInvocations: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── Service Catalog (AWS/ServiceCatalog) ───────────────────────────────────────

export function generateServicecatalogMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const ok = randInt(50, 8_000);
  return [
    metricDoc(
      ts,
      "servicecatalog",
      "aws.servicecatalog",
      region,
      account,
      { PortfolioId: `port-${randId(8).toLowerCase()}`, ProductId: `prod-${randInt(1000, 9999)}` },
      {
        ProvisionedProductCount: counter(randInt(20, 50_000)),
        ProvisionProductSucceeded: counter(ok),
        ProvisionProductFailed: counter(isErr ? randInt(1, 400) : randInt(0, 15)),
      }
    ),
  ];
}

// ─── Service Quotas (AWS/ServiceQuotas) ─────────────────────────────────────────

export function generateServicequotasMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const svc = rand(["ec2", "s3", "lambda", "vpc"]);
  return [
    metricDoc(
      ts,
      "servicequotas",
      "aws.servicequotas",
      region,
      account,
      { ServiceCode: svc },
      {
        QuotaRequestCount: counter(randInt(0, 500)),
        QuotaIncreaseApproved: counter(randInt(0, 80)),
        QuotaIncreaseDenied: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        RequestProcessingLatencyMilliseconds: stat(
          dp(stressed ? randFloat(600, 8500) : randFloat(30, 720))
        ),
      }
    ),
    metricDoc(
      ts,
      "servicequotas",
      "aws.servicequotas",
      region,
      account,
      { ServiceCode: svc, QuotaCode: `q-${randId(8)}` },
      {
        QuotaExceededEvents: counter(Math.random() < er ? randInt(50, 18_000) : randInt(0, 400)),
        ThrottledAPICalls: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── Compute Optimizer (AWS/ComputeOptimizer) ───────────────────────────────────

export function generateComputeoptimizerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const resType = rand([
    "Ec2Instance",
    "AutoScalingGroup",
    "EbsVolume",
    "LambdaFunction",
    "RdsDatabase",
  ]);
  return [
    metricDoc(
      ts,
      "computeoptimizer",
      "aws.computeoptimizer",
      region,
      account,
      {
        ResourceType: resType,
      },
      {
        RecommendationCount: counter(randInt(100, 500_000)),
        OptimizedResourceCount: counter(stressed ? randInt(5_000, 45_000) : randInt(50, 80_000)),
        ExportFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        DiscoveryJobLatencySeconds: stat(
          dp(stressed ? randFloat(800, 14_000) : randFloat(45, 1800))
        ),
      }
    ),
    metricDoc(
      ts,
      "computeoptimizer",
      "aws.computeoptimizer",
      region,
      account,
      { ResourceType: resType, AccountId: account.id },
      {
        APIThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
        UtilizationDataGaps: counter(Math.random() < er ? randInt(200, 80_000) : randInt(0, 9000)),
      }
    ),
  ];
}

// ─── Budgets (AWS/Budgets) ──────────────────────────────────────────────────────

export function generateBudgetsMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const limit = jitter(50_000, 20_000, 5_000, 500_000);
  const actual = limit * jitter(0.75, 0.2, 0.1, Math.random() < er ? 1.15 : 1.0);
  const forecast = limit * jitter(0.82, 0.15, 0.15, 1.05);
  return [
    metricDoc(
      ts,
      "budgets",
      "aws.budgets",
      region,
      account,
      { BudgetName: rand(["monthly-infra", "data-pipeline", "security-tools", "r-and-d"]) },
      {
        ActualSpend: stat(dp(actual)),
        ForecastedSpend: stat(dp(forecast)),
        BudgetLimit: stat(dp(limit)),
      }
    ),
  ];
}

// ─── Resilience Hub (AWS/ResilienceHub) ─────────────────────────────────────────

export function generateResiliencehubMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const score = Math.random() < er ? jitter(45, 15, 20, 75) : jitter(78, 12, 55, 98);
  return [
    metricDoc(
      ts,
      "resiliencehub",
      "aws.resiliencehub",
      region,
      account,
      { AppArn: `arn:aws:resiliencehub:${region}:${account.id}:app/${randId(8)}` },
      {
        AppComplianceStatus: stat(dp(Math.random() < er ? 0 : 1)),
        ResiliencyScore: stat(dp(score)),
      }
    ),
  ];
}

// ─── Migration Hub (AWS/MigrationHub) ─────────────────────────────────────────

export function generateMigrationhubMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const ok = randInt(20, 5_000);
  return [
    metricDoc(
      ts,
      "migrationhub",
      "aws.migrationhub",
      region,
      account,
      { ApplicationId: `mwn-app-${randId(12).toLowerCase()}` },
      {
        ServersDiscovered: counter(randInt(50, 25_000)),
        MigrationTasksSucceeded: counter(ok),
        MigrationTasksFailed: counter(isErr ? randInt(1, 300) : randInt(0, 12)),
      }
    ),
  ];
}

// ─── IAM Identity Center (AWS/IdentityCenter) ─────────────────────────────────

export function generateIdentitycenterMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const ok = randInt(1_000, 200_000);
  return [
    metricDoc(
      ts,
      "identitycenter",
      "aws.identitycenter",
      region,
      account,
      { InstanceArn: `arn:aws:sso:::instance/ssoins-${randId(16).toLowerCase()}` },
      {
        SignInSucceeded: counter(ok),
        SignInFailed: counter(isErr ? randInt(1, 3_000) : randInt(0, 80)),
        ActiveSessions: counter(randInt(10, 15_000)),
      }
    ),
  ];
}

// ─── Detective (AWS/Detective) ─────────────────────────────────────────────────

export function generateDetectiveMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const graphArn = `arn:aws:detective:${region}:${account.id}:graph:${randId(32).toLowerCase()}`;
  return [
    metricDoc(
      ts,
      "detective",
      "aws.detective",
      region,
      account,
      { GraphArn: graphArn },
      {
        MemberAccountCount: counter(randInt(1, 120)),
        GraphBytesIngested: counter(randInt(1_000_000, 80_000_000_000)),
        FindingGenerationFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        InvestigationLatencyMilliseconds: stat(
          dp(stressed ? randFloat(900, 18_000) : randFloat(120, 2200))
        ),
      }
    ),
    metricDoc(
      ts,
      "detective",
      "aws.detective",
      region,
      account,
      { GraphArn: graphArn, InvestigationId: `inv-${randId(12)}` },
      {
        AthenaQueryErrors: counter(Math.random() < er ? randInt(50, 12_000) : randInt(0, 400)),
        ThrottledAPICalls: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── Verified Access (AWS/VerifiedAccess) ───────────────────────────────────────

export function generateVerifiedaccessMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const total = randInt(10_000, 5_000_000);
  const denied = isErr ? randInt(100, 80_000) : randInt(0, 2_000);
  const allowed = Math.max(0, total - denied);
  return [
    metricDoc(
      ts,
      "verifiedaccess",
      "aws.verifiedaccess",
      region,
      account,
      { EndpointId: `eid-${randId(12).toLowerCase()}` },
      {
        RequestCount: counter(total),
        AllowedRequests: counter(allowed),
        DeniedRequests: counter(denied),
      }
    ),
  ];
}

// ─── Security Lake (AWS/SecurityLake) ───────────────────────────────────────────

export function generateSecuritylakeMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const sources = randInt(3, 80);
  return [
    metricDoc(
      ts,
      "securitylake",
      "aws.securitylake",
      region,
      account,
      { SourceName: rand(["cloudtrail_mgmt", "guardduty", "vpc_flow", "identity"]) },
      {
        SourcesIngested: counter(sources),
        BytesIngested: counter(randInt(50_000_000, 12_000_000_000_000)),
        FailedSources: counter(isErr ? randInt(1, 8) : randInt(0, 1)),
      }
    ),
  ];
}

// ─── Security IR (AWS/SecurityIR) ───────────────────────────────────────────────

export function generateSecurityirMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const incidents = Math.random() < er ? randInt(2, 25) : randInt(0, 5);
  return [
    metricDoc(
      ts,
      "securityir",
      "aws.securityir",
      region,
      account,
      { IncidentId: `sir-${randId(18).toLowerCase()}` },
      {
        IncidentCount: counter(incidents),
        ResponseTime: stat(dp(jitter(120, 90, 15, 3600))),
      }
    ),
  ];
}

// ─── Incident Manager (AWS/IncidentManager) ─────────────────────────────────────

export function generateIncidentmanagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const n = Math.random() < er ? randInt(2, 40) : randInt(0, 8);
  return [
    metricDoc(
      ts,
      "incidentmanager",
      "aws.incidentmanager",
      region,
      account,
      {
        ResponsePlanArn: `arn:aws:ssm-incidents:${region}:${account.id}:response-plan/${randId(8)}`,
      },
      {
        IncidentCount: counter(n),
        ResponsePlanExecutions: counter(randInt(1, 2_000)),
      }
    ),
  ];
}

// ─── Audit Manager (AWS/AuditManager) ───────────────────────────────────────────

export function generateAuditmanagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const assessId = `assess-${randId(12).toLowerCase()}`;
  return [
    metricDoc(
      ts,
      "auditmanager",
      "aws.auditmanager",
      region,
      account,
      { AssessmentId: assessId },
      {
        AssessmentCount: counter(randInt(1, 200)),
        ControlComplianceCount: counter(randInt(50, 12_000)),
        NonCompliantControls: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        EvidenceCollectionLatencyMilliseconds: stat(
          dp(stressed ? randFloat(800, 16_000) : randFloat(55, 1200))
        ),
      }
    ),
    metricDoc(
      ts,
      "auditmanager",
      "aws.auditmanager",
      region,
      account,
      { AssessmentId: assessId, ControlDomain: rand(["IAM", "Logging", "Network"]) },
      {
        AssessmentReportFailures: counter(Math.random() < er ? randInt(50, 4000) : randInt(0, 180)),
        ThrottledAPICalls: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── License Manager (AWS/LicenseManager) ─────────────────────────────────────

export function generateLicensemanagerMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const licArn = `arn:aws:license-manager:${region}:${account.id}:license-configuration:lic-${randId(8)}`;
  return [
    metricDoc(
      ts,
      "licensemanager",
      "aws.licensemanager",
      region,
      account,
      {
        ResourceArn: licArn,
      },
      {
        LicenseCount: counter(randInt(5, 5_000)),
        LicenseUsage: stat(dp(stressed ? jitter(92, 6, 70, 100) : jitter(65, 25, 5, 100))),
        EntitlementFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        InventorySyncLatencyMilliseconds: stat(
          dp(stressed ? randFloat(600, 12_000) : randFloat(40, 900))
        ),
      }
    ),
    metricDoc(
      ts,
      "licensemanager",
      "aws.licensemanager",
      region,
      account,
      { ResourceArn: licArn, InventoryType: rand(["RDS", "EC2", "ECS"]) },
      {
        DiscoveryErrors: counter(Math.random() < er ? randInt(50, 18_000) : randInt(0, 500)),
        ThrottledAPICalls: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── Cloud9 (AWS/Cloud9) ─────────────────────────────────────────────────────────

export function generateCloud9Metrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const total = randInt(2, 400);
  const active = stressed ? randInt(0, Math.min(total, 40)) : randInt(0, Math.min(total, 150));
  const envId = `${randId(16).toLowerCase()}`;
  return [
    metricDoc(
      ts,
      "cloud9",
      "aws.cloud9",
      region,
      account,
      { EnvironmentId: envId },
      {
        EnvironmentCount: counter(total),
        ActiveEnvironments: counter(active),
        EnvironmentProvisioningFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
      }
    ),
    metricDoc(
      ts,
      "cloud9",
      "aws.cloud9",
      region,
      account,
      { EnvironmentId: envId, RunnerType: "ec2" },
      {
        HealthCheckFailures: counter(Math.random() < er ? randInt(50, 9000) : randInt(0, 200)),
        ThrottledAPICalls: counter(Math.random() < er ? randInt(10, 500) : 0),
      }
    ),
  ];
}

// ─── CodeCatalyst (AWS/CodeCatalyst) ───────────────────────────────────────────

export function generateCodecatalystMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const isErr = Math.random() < er;
  const ok = randInt(50, 12_000);
  return [
    metricDoc(
      ts,
      "codecatalyst",
      "aws.codecatalyst",
      region,
      account,
      {
        SpaceName: rand(["platform-team", "product-alpha", "internal-tools"]),
        ProjectName: `proj-${randInt(1, 99)}`,
      },
      {
        WorkflowRunSucceeded: counter(ok),
        WorkflowRunFailed: counter(isErr ? randInt(1, 400) : randInt(0, 20)),
      }
    ),
  ];
}

// ─── CodeGuru Reviewer (AWS/CodeGuruReviewer) ───────────────────────────────────

export function generateCodeguruMetrics(ts: string, er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const stressed = Math.random() < er;
  const repo = rand(["api-gateway", "billing-svc", "data-pipeline", "authz-lib"]);
  const lines = randInt(50_000, 50_000_000);
  return [
    metricDoc(
      ts,
      "codeguru",
      "aws.codeguru",
      region,
      account,
      { RepositoryName: repo },
      {
        RecommendationCount: counter(randInt(10, 25_000)),
        LinesOfCodeScanned: counter(lines),
        ScanFailures: counter(stressed ? randInt(5, 100) : randInt(0, 2)),
        ScanDurationSeconds: stat(dp(stressed ? randFloat(600, 22_000) : randFloat(45, 4200))),
      }
    ),
    metricDoc(
      ts,
      "codeguru",
      "aws.codeguru",
      region,
      account,
      { RepositoryName: repo, Branch: rand(["main", "develop"]) },
      {
        ReviewerThrottles: counter(Math.random() < er ? randInt(10, 500) : 0),
        SecurityScanErrors: counter(Math.random() < er ? randInt(50, 12_000) : randInt(0, 400)),
      }
    ),
  ];
}
