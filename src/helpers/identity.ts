/**
 * Shared user identity pools and helpers for chained event generators.
 *
 * Provides realistic human user personas, service accounts, IP addresses,
 * and user-agent strings that can be attached to operational logs and
 * companion audit trail events (CloudTrail, GCP Cloud Audit, Azure Activity Log).
 */

import { rand, randInt, randId, randUUID } from "./index.js";

// ── Human user personas ─────────────────────────────────────────────────────

export interface PipelineUser {
  name: string;
  email: string;
  department: string;
}

export const DATA_ENGINEERING_USERS: PipelineUser[] = [
  { name: "jordan.chen", email: "jordan.chen@globex.example.com", department: "data-engineering" },
  {
    name: "priya.sharma",
    email: "priya.sharma@globex.example.com",
    department: "data-engineering",
  },
  {
    name: "alex.rodriguez",
    email: "alex.rodriguez@globex.example.com",
    department: "analytics",
  },
  { name: "sam.wilson", email: "sam.wilson@globex.example.com", department: "data-platform" },
  { name: "maya.patel", email: "maya.patel@globex.example.com", department: "ml-engineering" },
  { name: "liam.murphy", email: "liam.murphy@globex.example.com", department: "data-ops" },
];

export const SERVICE_USERS: PipelineUser[] = [
  {
    name: "etl-scheduler",
    email: "etl-scheduler@globex.example.com",
    department: "automation",
  },
  {
    name: "ci-deploy-bot",
    email: "ci-deploy-bot@globex.example.com",
    department: "devops",
  },
];

export const ALL_PIPELINE_USERS = [...DATA_ENGINEERING_USERS, ...SERVICE_USERS];

export const randPipelineUser = (): PipelineUser => rand(ALL_PIPELINE_USERS);
export const randHumanUser = (): PipelineUser => rand(DATA_ENGINEERING_USERS);

// ── User-agent strings ──────────────────────────────────────────────────────

export const PIPELINE_USER_AGENTS = [
  "aws-cli/2.15.30 md/awscrt#0.19.19 ua/2.0 os/linux#5.15.0-1058-aws exec-env/CloudShell",
  "Boto3/1.34.84 md/Botocore#1.34.84 ua/2.0 os/linux#5.15.0",
  "Terraform/1.8.2 (+https://www.terraform.io)",
  "python-requests/2.31.0",
  "apache-airflow/2.8.1",
  "Google-API-Java-Client/2.2.0 Google-HTTP-Java-Client/1.43.3",
  "gcloud/472.0.0 command/gcloud.composer.environments.run",
  "azsdk-python-azure-mgmt-datafactory/5.0.0 Python/3.11.8",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0.0.0",
];

export const randPipelineUserAgent = (): string => rand(PIPELINE_USER_AGENTS);

// ── Source IP pools ─────────────────────────────────────────────────────────

const OFFICE_IP_RANGES = [
  "203.0.113", // TEST-NET-3 (documentation)
  "198.51.100", // TEST-NET-2
  "192.0.2", // TEST-NET-1
];

const VPN_IP_RANGES = ["100.64.0", "100.64.1", "100.64.2"];

export function randOfficeIp(): string {
  return `${rand(OFFICE_IP_RANGES)}.${randInt(1, 254)}`;
}

export function randVpnIp(): string {
  return `${rand(VPN_IP_RANGES)}.${randInt(1, 254)}`;
}

export function randSourceIp(): string {
  return Math.random() < 0.6 ? randOfficeIp() : randVpnIp();
}

// ── Source geo data ─────────────────────────────────────────────────────────

const GEO_DATA = [
  { country_iso_code: "US", city_name: "Ashburn", region_name: "Virginia" },
  { country_iso_code: "US", city_name: "San Francisco", region_name: "California" },
  { country_iso_code: "US", city_name: "Seattle", region_name: "Washington" },
  { country_iso_code: "GB", city_name: "London", region_name: "England" },
  { country_iso_code: "DE", city_name: "Frankfurt", region_name: "Hesse" },
  { country_iso_code: "IN", city_name: "Bangalore", region_name: "Karnataka" },
];

export function randSourceGeo() {
  return rand(GEO_DATA);
}

// ── ECS user block builder ──────────────────────────────────────────────────

export function ecsUserBlock(u: PipelineUser) {
  return {
    user: { name: u.name, email: u.email },
  };
}

export function ecsSourceBlock(ip?: string) {
  const sourceIp = ip ?? randSourceIp();
  return {
    source: { ip: sourceIp, geo: randSourceGeo() },
  };
}

export function ecsUserAgentBlock(ua?: string) {
  return {
    user_agent: { original: ua ?? randPipelineUserAgent() },
  };
}

/**
 * Returns all three ECS identity blocks (user, source, user_agent) as a
 * flat object that can be spread into a document.
 */
export function ecsIdentityFields(u: PipelineUser, ip?: string, ua?: string) {
  return {
    ...ecsUserBlock(u),
    ...ecsSourceBlock(ip),
    ...ecsUserAgentBlock(ua),
  };
}

// ── AWS CloudTrail identity builder ─────────────────────────────────────────

export interface AwsCloudTrailIdentity {
  userIdentity: Record<string, unknown>;
  sourceIPAddress: string;
  userAgent: string;
  ecsUser: { name: string; email: string };
}

export function awsCloudTrailIdentity(
  accountId: string,
  user: PipelineUser,
  ip: string,
  ua: string,
  isServiceRole = false
): AwsCloudTrailIdentity {
  const accessKeyId = `AKIA${randId(16).toUpperCase()}`;
  const principalId = isServiceRole
    ? `AROA${randId(16).toUpperCase()}:${user.name}-session`
    : `${accountId}:${user.name}`;

  return {
    userIdentity: {
      type: isServiceRole ? "AssumedRole" : "IAMUser",
      principal_id: principalId,
      arn: isServiceRole
        ? `arn:aws:sts::${accountId}:assumed-role/${user.name}-role/${user.name}-session`
        : `arn:aws:iam::${accountId}:user/${user.name}`,
      account_id: accountId,
      access_key_id: accessKeyId,
      ...(isServiceRole
        ? {
            session_context: {
              session_issuer: {
                type: "Role",
                principal_id: `AROA${randId(16).toUpperCase()}`,
                arn: `arn:aws:iam::${accountId}:role/${user.name}-role`,
                account_id: accountId,
                user_name: `${user.name}-role`,
              },
              attributes: {
                creation_date: new Date().toISOString(),
                mfa_authenticated: "false",
              },
            },
          }
        : {
            session_context: {
              attributes: {
                creation_date: new Date().toISOString(),
                mfa_authenticated: String(Math.random() < 0.7),
              },
            },
          }),
    },
    sourceIPAddress: ip,
    userAgent: ua,
    ecsUser: { name: user.name, email: user.email },
  };
}

/**
 * Build a full CloudTrail event document.
 */
export function awsCloudTrailEvent(
  ts: string,
  region: string,
  acct: { id: string; name: string },
  identity: AwsCloudTrailIdentity,
  eventName: string,
  eventSource: string,
  requestParameters: Record<string, unknown> | null,
  responseElements: Record<string, unknown> | null,
  outcome: "success" | "failure",
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const requestId = randUUID();
  const eventId = randUUID();
  const readOnly =
    eventName.startsWith("Describe") || eventName.startsWith("Get") || eventName.startsWith("List");
  const errorCode =
    outcome === "failure"
      ? rand(["AccessDeniedException", "ServiceException", "ValidationException"])
      : undefined;

  return {
    __dataset: "aws.cloudtrail",
    "@timestamp": ts,
    cloud: {
      provider: "aws",
      region,
      account: { id: acct.id, name: acct.name },
      service: { name: "cloudtrail" },
    },
    aws: {
      dimensions: { EventName: eventName, EventSource: eventSource },
      cloudtrail: {
        event_version: "1.09",
        event_category: "Management",
        event_type: "AwsApiCall",
        request_id: requestId,
        event_id: eventId,
        management_event: true,
        read_only: readOnly,
        recipient_account_id: acct.id,
        aws_region: region,
        user_identity: identity.userIdentity,
        ...(requestParameters ? { request_parameters: JSON.stringify(requestParameters) } : {}),
        ...(responseElements ? { response_elements: JSON.stringify(responseElements) } : {}),
        ...(errorCode
          ? {
              error_code: errorCode,
              error_message: `User is not authorized to perform: ${eventName}`,
            }
          : {}),
        ...extra,
      },
    },
    user: identity.ecsUser,
    source: { ip: identity.sourceIPAddress, geo: randSourceGeo() },
    user_agent: { original: identity.userAgent },
    event: {
      kind: "event",
      action: eventName,
      outcome,
      category: ["configuration"],
      type: readOnly ? ["access", "info"] : ["change"],
      dataset: "aws.cloudtrail",
      provider: eventSource,
    },
    message: `CloudTrail: ${eventName} by ${identity.ecsUser.name} via ${eventSource}`,
    log: { level: outcome === "failure" ? "warn" : "info" },
    ...(outcome === "failure"
      ? { error: { code: errorCode, message: `Failed to execute ${eventName}`, type: "access" } }
      : {}),
  };
}

// ── GCP Cloud Audit identity builder ────────────────────────────────────────

export function gcpCloudAuditEvent(
  ts: string,
  region: string,
  project: { id: string; name: string; number: string },
  user: PipelineUser,
  ip: string,
  ua: string,
  methodName: string,
  serviceName: string,
  resourceName: string,
  outcome: "success" | "failure",
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const severity = outcome === "failure" ? "ERROR" : "INFO";
  return {
    __dataset: "gcp.audit",
    "@timestamp": ts,
    cloud: {
      provider: "gcp",
      region,
      project: { id: project.id, name: project.name },
      account: { id: project.number, name: project.name },
      service: { name: serviceName.split(".")[0] },
    },
    gcp: {
      cloud_audit: {
        method_name: methodName,
        service_name: serviceName,
        resource_name: resourceName,
        authentication_info: { principal_email: user.email },
        request_metadata: {
          caller_ip: ip,
          caller_supplied_user_agent: ua,
        },
        authorization_info: [
          {
            permission: methodName.replace(/\./g, ".").toLowerCase(),
            granted: outcome === "success",
            resource: resourceName,
          },
        ],
        status: outcome === "failure" ? { code: 7, message: "PERMISSION_DENIED" } : { code: 0 },
        ...extra,
      },
    },
    user: { name: user.name, email: user.email },
    source: { ip, geo: randSourceGeo() },
    user_agent: { original: ua },
    event: {
      kind: "event",
      action: methodName,
      outcome,
      category: ["configuration"],
      type: outcome === "failure" ? ["denied"] : ["change"],
      dataset: "gcp.audit",
      provider: serviceName,
    },
    log: {
      level: severity.toLowerCase(),
      logger: `cloudaudit.googleapis.com/activity`,
    },
    message: `Cloud Audit: ${methodName} by ${user.email} on ${resourceName}`,
  };
}

// ── Azure Activity Log identity builder ─────────────────────────────────────

export function azureActivityLogEvent(
  ts: string,
  region: string,
  subscription: { id: string; name: string },
  resourceGroup: string,
  user: PipelineUser,
  ip: string,
  ua: string,
  operationName: string,
  resourceType: string,
  resourceName: string,
  outcome: "success" | "failure",
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  const objectId = randUUID();
  const tenantId = randUUID();
  const correlationId = randUUID();
  const resourceId = `/subscriptions/${subscription.id}/resourceGroups/${resourceGroup}/providers/${resourceType}/${resourceName}`;

  return {
    __dataset: "azure.activitylogs",
    "@timestamp": ts,
    time: ts,
    resourceId,
    cloud: {
      provider: "azure",
      region,
      account: { id: subscription.id, name: subscription.name },
      service: { name: resourceType.split("/")[0].replace("Microsoft.", "").toLowerCase() },
    },
    azure: {
      activity_log: {
        operation_name: operationName,
        category: "Administrative",
        result_type: outcome === "failure" ? "Failed" : "Succeeded",
        correlation_id: correlationId,
        caller: user.email,
        claims: {
          aud: `https://management.azure.com/`,
          iss: `https://sts.windows.net/${tenantId}/`,
          iat: String(Math.floor(Date.now() / 1000)),
          name: user.name,
          http_schemas_xmlsoap_org_ws_2005_05_identity_claims_upn: user.email,
          appid: randUUID(),
          objectidentifier: objectId,
          ipaddr: ip,
        },
        level: outcome === "failure" ? "Error" : "Informational",
        ...extra,
      },
    },
    user: { name: user.name, email: user.email, id: objectId },
    source: { ip, geo: randSourceGeo() },
    user_agent: { original: ua },
    event: {
      kind: "event",
      action: operationName,
      outcome,
      category: ["configuration"],
      type: outcome === "failure" ? ["denied"] : ["change"],
      dataset: "azure.activitylogs",
      provider: resourceType,
    },
    operationName,
    category: "Administrative",
    resultType: outcome === "failure" ? "Failed" : "Succeeded",
    message: `Activity Log: ${operationName} by ${user.email}`,
    log: { level: outcome === "failure" ? "error" : "info" },
    ...extra,
  };
}
