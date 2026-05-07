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

export function generateOrganizationsMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "organizations",
      "aws.organizations",
      region,
      account,
      { OrganizationId: `o-${randId(10).toLowerCase()}` },
      {
        AccountCount: counter(randInt(5, 2_000)),
        PolicyAttachmentCount: counter(randInt(10, 15_000)),
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

export function generateServicequotasMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "servicequotas",
      "aws.servicequotas",
      region,
      account,
      { ServiceCode: rand(["ec2", "s3", "lambda", "vpc"]) },
      {
        QuotaRequestCount: counter(randInt(0, 500)),
        QuotaIncreaseApproved: counter(randInt(0, 80)),
      }
    ),
  ];
}

// ─── Compute Optimizer (AWS/ComputeOptimizer) ───────────────────────────────────

export function generateComputeoptimizerMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "computeoptimizer",
      "aws.computeoptimizer",
      region,
      account,
      {
        ResourceType: rand([
          "Ec2Instance",
          "AutoScalingGroup",
          "EbsVolume",
          "LambdaFunction",
          "RdsDatabase",
        ]),
      },
      {
        RecommendationCount: counter(randInt(100, 500_000)),
        OptimizedResourceCount: counter(randInt(50, 80_000)),
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

export function generateDetectiveMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "detective",
      "aws.detective",
      region,
      account,
      { GraphArn: `arn:aws:detective:${region}:${account.id}:graph:${randId(32).toLowerCase()}` },
      {
        MemberAccountCount: counter(randInt(1, 120)),
        GraphBytesIngested: counter(randInt(1_000_000, 80_000_000_000)),
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

export function generateAuditmanagerMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "auditmanager",
      "aws.auditmanager",
      region,
      account,
      { AssessmentId: `assess-${randId(12).toLowerCase()}` },
      {
        AssessmentCount: counter(randInt(1, 200)),
        ControlComplianceCount: counter(randInt(50, 12_000)),
      }
    ),
  ];
}

// ─── License Manager (AWS/LicenseManager) ─────────────────────────────────────

export function generateLicensemanagerMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "licensemanager",
      "aws.licensemanager",
      region,
      account,
      {
        ResourceArn: `arn:aws:license-manager:${region}:${account.id}:license-configuration:lic-${randId(8)}`,
      },
      {
        LicenseCount: counter(randInt(5, 5_000)),
        LicenseUsage: stat(dp(jitter(65, 25, 5, 100))),
      }
    ),
  ];
}

// ─── CloudShell (AWS/CloudShell) ───────────────────────────────────────────────

export function generateCloudshellMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  return [
    metricDoc(
      ts,
      "cloudshell",
      "aws.cloudshell",
      region,
      account,
      { UserArn: `arn:aws:iam::${account.id}:user/${rand(["build", "dba", "secops"])}` },
      {
        SessionCount: counter(randInt(10, 8_000)),
        SessionDuration: stat(dp(jitter(420, 280, 30, 7200))),
      }
    ),
  ];
}

// ─── Cloud9 (AWS/Cloud9) ─────────────────────────────────────────────────────────

export function generateCloud9Metrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const total = randInt(2, 400);
  const active = randInt(0, Math.min(total, 150));
  return [
    metricDoc(
      ts,
      "cloud9",
      "aws.cloud9",
      region,
      account,
      { EnvironmentId: `${randId(16).toLowerCase()}` },
      {
        EnvironmentCount: counter(total),
        ActiveEnvironments: counter(active),
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

export function generateCodeguruMetrics(ts: string, _er: number): EcsDocument[] {
  const { region, account } = pickCloudContext(REGIONS, ACCOUNTS);
  const lines = randInt(50_000, 50_000_000);
  return [
    metricDoc(
      ts,
      "codeguru",
      "aws.codeguru",
      region,
      account,
      { RepositoryName: rand(["api-gateway", "billing-svc", "data-pipeline", "authz-lib"]) },
      {
        RecommendationCount: counter(randInt(10, 25_000)),
        LinesOfCodeScanned: counter(lines),
      }
    ),
  ];
}
