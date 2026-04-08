import type { CloudId } from "./types";
import { publicUrl } from "../utils/publicUrl";

/** Vendor artwork under `public/icons/` — path-based SVGs (light vs dark header). */
export const UNIFIED_VENDOR_CARDS: {
  id: CloudId;
  label: string;
  shortLabel: string;
  logoSrcLightBg: string;
  logoSrcDarkBg: string;
  logoAlt: string;
}[] = [
  {
    id: "aws",
    label: "Amazon Web Services",
    shortLabel: "AWS",
    logoSrcLightBg: publicUrl("icons/aws-on-light.svg"),
    logoSrcDarkBg: publicUrl("icons/aws-on-dark.svg"),
    logoAlt: "AWS",
  },
  {
    id: "gcp",
    label: "Google Cloud Platform",
    shortLabel: "GCP",
    logoSrcLightBg: publicUrl("icons/gcp-vendor.svg"),
    logoSrcDarkBg: publicUrl("icons/gcp-vendor.svg"),
    logoAlt: "Google Cloud",
  },
  {
    id: "azure",
    label: "Microsoft Azure",
    shortLabel: "Azure",
    logoSrcLightBg: publicUrl("icons/azure-vendor.svg"),
    logoSrcDarkBg: publicUrl("icons/azure-vendor.svg"),
    logoAlt: "Microsoft Azure",
  },
];

export function unifiedVendorCard(id: CloudId) {
  const found = UNIFIED_VENDOR_CARDS.find((v) => v.id === id);
  if (!found) throw new Error(`Unknown cloud id: ${id}`);
  return found;
}

/** Neutral cloud (header, left of pipeline) — `public/cloud-svgrepo-com.svg`. */
export const UNIFIED_HEADER_CLOUD_MARK_SRC = publicUrl("cloud-svgrepo-com.svg");

/** Official Elastic horizontal wordmark (color-reverse for dark `EuiHeader`). */
export const UNIFIED_HEADER_WORDMARK_SRC = publicUrl("elastic-logo.svg");
