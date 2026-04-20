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
import {
  generatePubSubFanoutTrace,
  generateGcsObjectPipelineTrace,
  generateEventarcWorkflowOrchestrationTrace,
} from "./workflow-chains.js";
import { generateCloudStorageTrace } from "./cloudstorage.js";
import { generateComputeEngineTrace } from "./computeengine.js";
import { generateApigeeTrace } from "./apigee.js";
import { generateCloudBuildTrace } from "./cloudbuild.js";
import { generateGeminiTrace } from "./gemini.js";
import { generateAlloyDbTrace } from "./alloydb.js";
import { generateBigtableTrace } from "./bigtable.js";
import { generateMemorystoreTrace } from "./memorystore.js";
import { generateCloudTasksTrace } from "./cloud-tasks.js";
import { generateCloudSchedulerTrace } from "./cloud-scheduler.js";
import { generateComposerTrace } from "./composer.js";
import { generateDataprocTrace } from "./dataproc.js";
import { generateCloudRunJobsTrace } from "./cloud-run-jobs.js";
import { generateDialogflowTrace } from "./dialogflow.js";
import { generateCloudArmorTrace } from "./cloud-armor.js";
import { generateCloudLbTrace } from "./cloud-lb.js";
import { generateCloudDnsTrace } from "./cloud-dns.js";
import { generateCloudNatTrace } from "./cloud-nat.js";
import { generateCloudKmsTrace } from "./cloud-kms.js";
import { generateSecretManagerTrace } from "./secret-manager.js";
import { generateArtifactRegistryTrace } from "./artifact-registry.js";
import { generateWorkflowsTrace } from "./workflows.js";
import { generateEventarcTrace } from "./eventarc.js";
import { generateIamTrace } from "./iam.js";
import { generateLookerTrace } from "./looker.js";
import { generateDataFusionTrace } from "./data-fusion.js";
import { generateCloudVpnTrace } from "./cloud-vpn.js";
import { generateSecurityCommandCenterTrace } from "./security-command-center.js";
import { generateCloudIdsTrace } from "./cloud-ids.js";
import { generateBatchTrace } from "./batch.js";

const GCP_TRACE_GENERATORS: Record<string, (ts: string, er: number) => Record<string, unknown>[]> =
  {
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
    "workflow-pubsub-fanout": generatePubSubFanoutTrace,
    "workflow-gcs-pipeline": generateGcsObjectPipelineTrace,
    "workflow-eventarc-orchestration": generateEventarcWorkflowOrchestrationTrace,
    "cloud-storage": generateCloudStorageTrace,
    "compute-engine": generateComputeEngineTrace,
    apigee: generateApigeeTrace,
    "cloud-build": generateCloudBuildTrace,
    gemini: generateGeminiTrace,
    alloydb: generateAlloyDbTrace,
    bigtable: generateBigtableTrace,
    memorystore: generateMemorystoreTrace,
    "cloud-tasks": generateCloudTasksTrace,
    "cloud-scheduler": generateCloudSchedulerTrace,
    composer: generateComposerTrace,
    dataproc: generateDataprocTrace,
    "cloud-run-jobs": generateCloudRunJobsTrace,
    dialogflow: generateDialogflowTrace,
    "cloud-armor": generateCloudArmorTrace,
    "cloud-lb": generateCloudLbTrace,
    "cloud-dns": generateCloudDnsTrace,
    "cloud-nat": generateCloudNatTrace,
    "cloud-kms": generateCloudKmsTrace,
    "secret-manager": generateSecretManagerTrace,
    "artifact-registry": generateArtifactRegistryTrace,
    workflows: generateWorkflowsTrace,
    eventarc: generateEventarcTrace,
    iam: generateIamTrace,
    looker: generateLookerTrace,
    "data-fusion": generateDataFusionTrace,
    "cloud-vpn": generateCloudVpnTrace,
    "security-command-center": generateSecurityCommandCenterTrace,
    "cloud-ids": generateCloudIdsTrace,
    batch: generateBatchTrace,
  };

export { GCP_TRACE_GENERATORS };
