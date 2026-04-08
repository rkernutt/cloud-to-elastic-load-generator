/**
 * Registry of GCP OTel / APM trace generators.
 * Each generator returns an array of documents (root transaction first, then child spans).
 */

export { GCP_TRACE_SERVICES } from "./services.js";

import { generateCloudFunctionsTrace } from "./cloudfunctions.js";
import { generateCloudRunTrace } from "./cloudrun.js";
import { generateGkeTrace } from "./gke.js";
import { generateAppEngineTrace } from "./appengine.js";
import { generateCloudSpannerTrace } from "./cloudspanner.js";
import { generatePubSubTrace } from "./pubsub.js";
import { generateBigQueryTrace } from "./bigquery.js";
import {
  generateEcommerceOrderTrace,
  generateMlInferenceTrace,
  generateDataPipelineTrace,
} from "./workflow.js";
import { generateCloudSqlTrace } from "./cloudsql.js";
import { generateDataflowTrace } from "./dataflow.js";
import { generateVertexAiTrace } from "./vertexai.js";
import { generateFirestoreTrace } from "./firestore.js";
import { generateCascadingFailureTrace } from "./workflow-cascading.js";

const GCP_TRACE_GENERATORS: Record<string, (ts: string, er: number) => Record<string, unknown>[]> = {
  "cloud-functions": generateCloudFunctionsTrace,
  "cloud-run": generateCloudRunTrace,
  gke: generateGkeTrace,
  "app-engine": generateAppEngineTrace,
  "cloud-spanner": generateCloudSpannerTrace,
  pubsub: generatePubSubTrace,
  bigquery: generateBigQueryTrace,
  "workflow-ecommerce": generateEcommerceOrderTrace,
  "workflow-ml": generateMlInferenceTrace,
  "workflow-data": generateDataPipelineTrace,
  "cloud-sql": generateCloudSqlTrace,
  dataflow: generateDataflowTrace,
  "vertex-ai": generateVertexAiTrace,
  firestore: generateFirestoreTrace,
  "workflow-cascading": generateCascadingFailureTrace,
};

export { GCP_TRACE_GENERATORS };
