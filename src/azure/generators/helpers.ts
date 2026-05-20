/**
 * Azure-specific helpers for generators.
 */

export {
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randPublicIp,
  randPrivateIp,
  ec2PrivateDns,
  randTs,
  randUUID,
  stripNulls,
  HTTP_METHODS,
  HTTP_PATHS,
  USER_AGENTS,
  FIRST_NAMES,
  LAST_NAMES,
  IAM_USERS,
  EMAIL_DOMAINS,
  randPersonEmail,
  randEmail,
  randIamUser,
} from "../../helpers";
import { rand, randId, FIRST_NAMES, LAST_NAMES } from "../../helpers";
export { randSourceIp } from "../../helpers/identity.js";

/** Fictional org slugs (not Microsoft tutorial names). */
export const AZURE_ORG_SLUGS = ["meridiantech", "cascadeops", "northpeak"] as const;

export const AZURE_EMAIL_DOMAINS = [
  "meridiantech.io",
  "cascadeops.onmicrosoft.com",
  "northpeak.dev",
] as const;

export const AZURE_ONMICROSOFT_TENANTS = [
  "meridiantech.onmicrosoft.com",
  "cascadeops.onmicrosoft.com",
] as const;

export const randAzureEmailDomain = () => rand(AZURE_EMAIL_DOMAINS);
export const randAzureOrgSlug = () => rand(AZURE_ORG_SLUGS);

/** first.last@meridiantech.io style UPN for Azure org domains. */
export const randAzurePersonEmail = () =>
  `${rand(FIRST_NAMES)}.${rand(LAST_NAMES)}@${rand(AZURE_EMAIL_DOMAINS)}`;

/** first.last@tenant.onmicrosoft.com for Entra / M365 style logs. */
export const randAzureOnMicrosoftEmail = () =>
  `${rand(FIRST_NAMES)}.${rand(LAST_NAMES)}@${rand(AZURE_ONMICROSOFT_TENANTS)}`;

/** first.last@meridiantech.com legacy corporate domain pattern. */
export const randAzureOrgEmail = () =>
  `${rand(FIRST_NAMES)}.${rand(LAST_NAMES)}@${rand(AZURE_ORG_SLUGS)}.com`;

export type {
  EcsDocument,
  LogGenerator,
  MetricGenerator,
  TraceGenerator,
} from "../../aws/generators/types";

export const AZURE_REGIONS = [
  "eastus",
  "eastus2",
  "westus2",
  "westus3",
  "centralus",
  "southcentralus",
  "northcentralus",
  "centralindia",
  "southeastasia",
  "eastasia",
  "australiaeast",
  "uksouth",
  "ukwest",
  "northeurope",
  "westeurope",
  "swedencentral",
  "francecentral",
  "germanywestcentral",
  "switzerlandnorth",
  "canadacentral",
  "brazilsouth",
  "mexicocentral",
  "qatarcentral",
  "uaenorth",
] as const;

export interface AzureSubscription {
  id: string;
  name: string;
}

export const AZURE_SUBSCRIPTIONS: AzureSubscription[] = [
  { id: "a3f8c2e1-7b4d-4f9a-8e2c-1d5f6a7b8c9d", name: "Meridian-Platform" },
  { id: "e7d94b23-1f68-42a5-9c3e-8f2d1a6b5c7e", name: "Cascade-Prod" },
  { id: "c4a2d8f6-3b91-4e7c-a5d2-9e1f0c8b7a6d", name: "Northpeak-Dev" },
];

export const randSubscription = (): AzureSubscription => rand(AZURE_SUBSCRIPTIONS);

export function randResourceGroup(): string {
  const prefixes = ["rg-prod", "rg-shared", "rg-data", "rg-network", "rg-app", "rg-analytics"];
  return `${rand(prefixes)}-${randId(6).toLowerCase()}`;
}

export function azureCloud(
  region: string,
  subscription: AzureSubscription,
  serviceName: string
): Record<string, unknown> {
  return {
    provider: "azure",
    region,
    account: { id: subscription.id, name: subscription.name },
    service: { name: serviceName },
  };
}

export function makeAzureSetup(er: number) {
  const clamped = Math.min(1, Math.max(0, er));
  return {
    region: rand(AZURE_REGIONS),
    subscription: randSubscription(),
    resourceGroup: randResourceGroup(),
    isErr: Math.random() < clamped,
  };
}

export function randCorrelationId(): string {
  return randId(32).toLowerCase();
}

export function randTraceId(): string {
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export function randSpanId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
}

export type AzureEventCategory =
  | "api"
  | "authentication"
  | "configuration"
  | "database"
  | "file"
  | "host"
  | "iam"
  | "network"
  | "process"
  | "web";

export type AzureEventType =
  | "access"
  | "admin"
  | "change"
  | "connection"
  | "creation"
  | "deletion"
  | "error"
  | "info"
  | "start"
  | "end";

/** ECS event block for Azure diagnostic / activity log generators. */
export function azureLogEvent(
  failed: boolean,
  durationNs: number,
  action: string,
  category: readonly AzureEventCategory[],
  type?: readonly AzureEventType[]
) {
  return {
    kind: "event" as const,
    category,
    type: type ?? (failed ? (["error"] as const) : (["change"] as const)),
    action: String(action),
    outcome: failed ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}
