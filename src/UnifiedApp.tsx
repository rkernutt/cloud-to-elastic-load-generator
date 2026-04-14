import { lazy, Suspense, useState, useEffect } from "react";
import type { CloudAppConfig } from "./cloud/types";
import type { CloudId } from "./cloud/types";

const LoadGeneratorApp = lazy(() => import("./App").then((m) => ({ default: m.LoadGeneratorApp })));

const LS_VENDOR_KEY = "unifiedCloudVendor";

const CLOUD_IDS = new Set<CloudId>(["aws", "gcp", "azure"]);

async function loadCloudConfig(id: CloudId): Promise<CloudAppConfig> {
  switch (id) {
    case "aws":
      return (await import("./cloud/awsConfig")).AWS_CONFIG;
    case "gcp":
      return (await import("./cloud/gcpConfig")).GCP_CONFIG;
    case "azure":
      return (await import("./cloud/azureConfig")).AZURE_CONFIG;
  }
}

function readInitialVendor(): CloudId {
  if (typeof localStorage === "undefined") return "aws";
  const raw = localStorage.getItem(LS_VENDOR_KEY) as CloudId | null;
  return raw && CLOUD_IDS.has(raw) ? raw : "aws";
}

/**
 * Single UI for AWS, GCP, and Azure (including Microsoft 365 audit + Graph metrics). Vendor is
 * chosen on **Start**; changing vendor swaps config in-place so the current page (e.g. Start)
 * is preserved while cloud-specific selections reset.
 */
const suspenseFallback = (
  <div
    style={{
      padding: "2rem",
      textAlign: "center",
      color: "var(--euiColorSubdued, #69707d)",
    }}
  >
    Loading…
  </div>
);

export function UnifiedApp() {
  const [vendor, setVendor] = useState<CloudId>(readInitialVendor);
  const [config, setConfig] = useState<CloudAppConfig | null>(null);

  useEffect(() => {
    localStorage.setItem(LS_VENDOR_KEY, vendor);
  }, [vendor]);

  useEffect(() => {
    let cancelled = false;
    setConfig(null);
    void (async () => {
      const next = await loadCloudConfig(vendor);
      if (!cancelled) setConfig(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [vendor]);

  if (!config) {
    return suspenseFallback;
  }

  return (
    <Suspense fallback={suspenseFallback}>
      <LoadGeneratorApp
        config={config}
        unifiedMode={{ cloudVendor: vendor, onCloudVendorChange: setVendor }}
      />
    </Suspense>
  );
}
