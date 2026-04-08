/**
 * Data pipeline trace generators — re-exported from workflow-pipelines.ts.
 *
 * Thin entry point for tests and call sites that prefer a dedicated import path.
 */
export {
  generatePipelineS3SqsChainedTrace,
  generatePipelineStepFunctionsOrchestratedTrace,
} from "./workflow-pipelines.js";
