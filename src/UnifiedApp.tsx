import { useState, useEffect } from "react";
import { LoadGeneratorApp } from "./App";
import { AWS_CONFIG } from "./cloud/awsConfig";
import { GCP_CONFIG } from "./cloud/gcpConfig";
import { AZURE_CONFIG } from "./cloud/azureConfig";
import type { CloudAppConfig } from "./cloud/types";
import type { CloudId } from "./cloud/types";

const CLOUD_CONFIG: Record<CloudId, CloudAppConfig> = {
  aws: AWS_CONFIG,
  gcp: GCP_CONFIG,
  azure: AZURE_CONFIG,
};

const LS_VENDOR_KEY = "unifiedCloudVendor";

function readInitialVendor(): CloudId {
  if (typeof localStorage === "undefined") return "aws";
  const raw = localStorage.getItem(LS_VENDOR_KEY) as CloudId | null;
  return raw && raw in CLOUD_CONFIG ? raw : "aws";
}

/**
 * Single UI for AWS, GCP, and Azure (including Microsoft 365 audit + Graph metrics). Vendor is
 * chosen on **Start**; changing vendor remounts the app.
 */
export function UnifiedApp() {
  const [vendor, setVendor] = useState<CloudId>(readInitialVendor);

  useEffect(() => {
    localStorage.setItem(LS_VENDOR_KEY, vendor);
  }, [vendor]);

  const config = CLOUD_CONFIG[vendor];

  return (
    <LoadGeneratorApp
      key={vendor}
      config={config}
      unifiedMode={{ cloudVendor: vendor, onCloudVendorChange: setVendor }}
    />
  );
}
