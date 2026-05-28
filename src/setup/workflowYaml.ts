/**
 * Re-export the bundled workflow YAMLs as strings. Vite's `?raw` import
 * inlines the files at build time, so the wizard never needs a runtime fetch
 * to disk. The assets stay at their canonical paths under `workflows/` so
 * users can also copy/paste them into Stack Management → Workflows → Create.
 */
import bundledWorkflowYaml from "../../workflows/data-pipeline-alert-enrichment.yaml?raw";
import securityWorkflowYaml from "../../workflows/security-alert-enrichment.yaml?raw";

export const ALERT_ENRICHMENT_WORKFLOW_YAML: string = bundledWorkflowYaml;
export const SECURITY_ALERT_ENRICHMENT_WORKFLOW_YAML: string = securityWorkflowYaml;
