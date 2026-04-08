/**
 * Azure-specific helpers for generators.
 */

export {
  rand,
  randInt,
  randFloat,
  randId,
  randIp,
  randTs,
  randUUID,
  stripNulls,
  HTTP_METHODS,
  HTTP_PATHS,
  USER_AGENTS,
} from "../../helpers";
import { rand, randId } from "../../helpers";

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
  { id: "8f6b5c4d-3e2a-1098-7654-3210fedcba98", name: "Contoso-Platform" },
  { id: "1a2b3c4d-5e6f-7890-abcd-ef1234567890", name: "Fabrikam-Prod" },
  { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", name: "Northwind-Dev" },
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
