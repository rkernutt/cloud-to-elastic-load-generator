/**
 * Global ingestion overrides vs per-service natural paths — validity, clamping, and UI helpers.
 */

import type { CloudId } from "../cloud/types";
import { SERVICE_INGESTION_DEFAULTS } from "../data/ingestion";
import { GCP_SERVICE_INGESTION_DEFAULTS } from "../gcp/data/ingestion";
import { isOtelPipelineSource } from "./otelPipeline";

/** Subset passed when clamping GCP/Azure ingestion (kept standalone to avoid circular imports). */
export type IngestionClampGcpAzureCtx = {
  serviceIngestionDefaults: Record<string, string>;
  defaultIngestion: string;
  ingestionUiFallback?: string;
};

/** IDs that use the Microsoft 365 CEL metrics integration by default. */
const AZURE_O365_CEL_SERVICES = new Set([
  "active-users-services",
  "teams-user-activity",
  "outlook-activity",
  "onedrive-usage-storage",
]);

const AZURE_SPECIALTY_NATURAL = new Set(["entra", "m365", "o365-cel"]);

const AZURE_BROAD_OVERRIDES = new Set([
  "default",
  "azure-monitor",
  "event-hubs",
  "api",
  "blob-storage",
]);

function buildServicesByNatural<T extends Record<string, string>>(
  defaults: T
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const [svc, nat] of Object.entries(defaults)) {
    if (!map.has(nat)) map.set(nat, new Set());
    map.get(nat)!.add(svc);
  }
  return map;
}

const AWS_SERVICES_BY_NATURAL = buildServicesByNatural(
  SERVICE_INGESTION_DEFAULTS as Record<string, string>
);
const GCP_SERVICES_BY_NATURAL = buildServicesByNatural(
  GCP_SERVICE_INGESTION_DEFAULTS as Record<string, string>
);

export function naturalAwsIngestion(serviceId: string): string {
  return (SERVICE_INGESTION_DEFAULTS as Record<string, string>)[serviceId] ?? "cloudwatch";
}

export function naturalGcpIngestion(serviceId: string): string {
  return (GCP_SERVICE_INGESTION_DEFAULTS as Record<string, string>)[serviceId] ?? "cloud-logging";
}

/** Single-id shortcut (UI service selection): flavor and UI are the same. */
export function naturalAzureIngestion(
  serviceId: string,
  serviceDefaults: Record<string, string>,
  defaultIngestion: string,
  ingestionUiFallback?: string
): string {
  return naturalAzureIngestionResolved(
    serviceId,
    serviceId,
    serviceDefaults,
    defaultIngestion,
    ingestionUiFallback
  );
}

/** Matches enrichGcpAzure: defaults for flavor block, then UI service id. */
export function naturalAzureIngestionResolved(
  flavorId: string,
  uiServiceId: string,
  serviceDefaults: Record<string, string>,
  defaultIngestion: string,
  ingestionUiFallback?: string
): string {
  return (
    serviceDefaults[flavorId] ??
    serviceDefaults[uiServiceId] ??
    ingestionUiFallback ??
    defaultIngestion
  );
}

function isValidAwsOverride(serviceId: string, override: string, natural: string): boolean {
  if (override === natural) return true;
  if (isOtelPipelineSource(override) || override === "agent") return true;
  const bucket = AWS_SERVICES_BY_NATURAL.get(override);
  return !!bucket?.has(serviceId);
}

function isValidGcpOverride(serviceId: string, override: string, natural: string): boolean {
  if (override === natural) return true;
  if (isOtelPipelineSource(override) || override === "agent") return true;
  const bucket = GCP_SERVICES_BY_NATURAL.get(override);
  return !!bucket?.has(serviceId);
}

function isValidAzureOverride(serviceId: string, override: string, natural: string): boolean {
  if (override === natural) return true;
  if (isOtelPipelineSource(override) || override === "agent") return true;
  if (override === "entra") return serviceId === "entra-id";
  if (override === "m365") return serviceId === "m365";
  if (override === "o365-cel") return AZURE_O365_CEL_SERVICES.has(serviceId);
  if (AZURE_SPECIALTY_NATURAL.has(natural) && override !== natural) return false;
  return AZURE_BROAD_OVERRIDES.has(override);
}

export function isIngestionOverrideValidForService(
  cloudId: CloudId,
  serviceId: string,
  globalOverride: string,
  gcpAzureCtx?: IngestionClampGcpAzureCtx
): boolean {
  if (globalOverride === "default") return true;
  if (cloudId === "aws") {
    return isValidAwsOverride(serviceId, globalOverride, naturalAwsIngestion(serviceId));
  }
  if (cloudId === "gcp") {
    return isValidGcpOverride(serviceId, globalOverride, naturalGcpIngestion(serviceId));
  }
  if (!gcpAzureCtx) return true;
  const natural = naturalAzureIngestion(
    serviceId,
    gcpAzureCtx.serviceIngestionDefaults,
    gcpAzureCtx.defaultIngestion,
    gcpAzureCtx.ingestionUiFallback
  );
  return isValidAzureOverride(serviceId, globalOverride, natural);
}

/**
 * Resolve ingestion source with clamping when the global override does not fit the service.
 */
export function clampGlobalIngestionOverride(
  cloudId: CloudId,
  flavorId: string,
  uiServiceId: string,
  globalOverride: string | undefined,
  gcpAzureCtx: IngestionClampGcpAzureCtx | null
): { source: string; clampedFrom: string | null } {
  const primaryId = flavorId || uiServiceId;
  if (!globalOverride || globalOverride === "default") {
    if (cloudId === "aws") {
      return { source: naturalAwsIngestion(uiServiceId), clampedFrom: null };
    }
    if (cloudId === "gcp") {
      return { source: naturalGcpIngestion(uiServiceId), clampedFrom: null };
    }
    if (gcpAzureCtx) {
      return {
        source: naturalAzureIngestionResolved(
          flavorId,
          uiServiceId,
          gcpAzureCtx.serviceIngestionDefaults,
          gcpAzureCtx.defaultIngestion,
          gcpAzureCtx.ingestionUiFallback
        ),
        clampedFrom: null,
      };
    }
    return { source: "default", clampedFrom: null };
  }

  let ok = false;
  if (cloudId === "aws") {
    ok = isValidAwsOverride(primaryId, globalOverride, naturalAwsIngestion(primaryId));
  } else if (cloudId === "gcp") {
    ok = isValidGcpOverride(primaryId, globalOverride, naturalGcpIngestion(primaryId));
  } else if (gcpAzureCtx) {
    const natural = naturalAzureIngestionResolved(
      flavorId,
      uiServiceId,
      gcpAzureCtx.serviceIngestionDefaults,
      gcpAzureCtx.defaultIngestion,
      gcpAzureCtx.ingestionUiFallback
    );
    ok = isValidAzureOverride(flavorId, globalOverride, natural);
  } else {
    ok = true;
  }

  if (ok) return { source: globalOverride, clampedFrom: null };

  let naturalResolved = globalOverride;
  if (cloudId === "aws") {
    naturalResolved = naturalAwsIngestion(flavorId);
  } else if (cloudId === "gcp") {
    naturalResolved = naturalGcpIngestion(flavorId);
  } else if (gcpAzureCtx) {
    naturalResolved = naturalAzureIngestionResolved(
      flavorId,
      uiServiceId,
      gcpAzureCtx.serviceIngestionDefaults,
      gcpAzureCtx.defaultIngestion,
      gcpAzureCtx.ingestionUiFallback
    );
  }

  return { source: naturalResolved, clampedFrom: globalOverride };
}

export interface IngestionConflictAnalysis {
  /** Service ids that do not accept the current global override */
  incompatibleServiceIds: string[];
  /** True if any selected service disagrees with the override */
  hasConflict: boolean;
}

export function analyzeIngestionConflicts(
  cloudId: CloudId,
  globalOverride: string,
  selectedServiceIds: readonly string[],
  gcpAzureCtx: IngestionClampGcpAzureCtx | null
): IngestionConflictAnalysis {
  if (globalOverride === "default") {
    return { incompatibleServiceIds: [], hasConflict: false };
  }
  const incompatible: string[] = [];
  for (const id of selectedServiceIds) {
    if (
      !isIngestionOverrideValidForService(cloudId, id, globalOverride, gcpAzureCtx ?? undefined)
    ) {
      incompatible.push(id);
    }
  }
  return { incompatibleServiceIds: incompatible, hasConflict: incompatible.length > 0 };
}
