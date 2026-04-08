import type { CloudId } from "./types";
import { publicUrl } from "../utils/publicUrl";

/** Vendor artwork under `public/icons/` (replace with your brand files as needed). */
export const UNIFIED_VENDOR_CARDS: {
  id: CloudId;
  label: string;
  shortLabel: string;
  logoSrc: string;
  logoAlt: string;
}[] = [
  {
    id: "aws",
    label: "Amazon Web Services",
    shortLabel: "AWS",
    logoSrc: publicUrl("icons/aws-header.svg"),
    logoAlt: "AWS",
  },
  {
    id: "gcp",
    label: "Google Cloud Platform",
    shortLabel: "GCP",
    logoSrc: publicUrl("icons/gcp-header.svg"),
    logoAlt: "Google Cloud",
  },
  {
    id: "azure",
    label: "Microsoft Azure",
    shortLabel: "Azure",
    logoSrc: publicUrl("icons/azure-header.svg"),
    logoAlt: "Microsoft Azure",
  },
];

export function unifiedVendorCard(id: CloudId) {
  const found = UNIFIED_VENDOR_CARDS.find((v) => v.id === id);
  if (!found) throw new Error(`Unknown cloud id: ${id}`);
  return found;
}

/** Neutral cloud (header, left of pipeline). */
export const UNIFIED_HEADER_CLOUD_MARK_SRC = publicUrl("icons/cloud-mark.svg");

/** Official Elastic horizontal wordmark (color-reverse for dark `EuiHeader`). */
export const UNIFIED_HEADER_WORDMARK_SRC = publicUrl("elastic-logo.svg");
