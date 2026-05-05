/**
 * Re-export the bundled workflow YAML as a string. Vite's `?raw` import
 * inlines the file at build time, so the wizard never needs a runtime fetch
 * to disk. The asset itself stays at the canonical path
 * `workflows/data-pipeline-alert-enrichment.yaml` so users can also copy/paste
 * the file directly into Stack Management → Workflows → Create.
 */
import bundledWorkflowYaml from "../../workflows/data-pipeline-alert-enrichment.yaml?raw";

export const ALERT_ENRICHMENT_WORKFLOW_YAML: string = bundledWorkflowYaml;
