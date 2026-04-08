/**
 * Registry of custom Elasticsearch ingest pipelines for GCP data streams
 * produced by the GCP load generator (logs-gcp.{suffix}-default).
 *
 * Processors: parse JSON from `message` into `gcp.parsed` when present.
 *
 * **Generated file** — edit src/gcp/data/elasticMaps.ts or serviceGroups.ts,
 * then run:  npx vite-node scripts/generate-gcp-pipeline-registry.mjs
 */

export const PIPELINE_REGISTRY = [
  {
    id: "logs-gcp.accesscontextmanager-default",
    dataset: "gcp.accesscontextmanager",
    group: "security",
    description: "Parse JSON from message field for gcp.accesscontextmanager (service access-context-manager)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.accesstransparency-default",
    dataset: "gcp.accesstransparency",
    group: "management",
    description: "Parse JSON from message field for gcp.accesstransparency (service access-transparency)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.activeassist-default",
    dataset: "gcp.activeassist",
    group: "management",
    description: "Parse JSON from message field for gcp.activeassist (service active-assist)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.alloydb-default",
    dataset: "gcp.alloydb",
    group: "databases",
    description: "Parse JSON from message field for gcp.alloydb (service alloydb)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.analyticshub-default",
    dataset: "gcp.analyticshub",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.analyticshub (service analytics-hub)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.anthos-default",
    dataset: "gcp.anthos",
    group: "containers",
    description: "Parse JSON from message field for gcp.anthos (service anthos)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.anthos_config-default",
    dataset: "gcp.anthos_config",
    group: "containers",
    description: "Parse JSON from message field for gcp.anthos_config (service anthos-config-mgmt)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.anthos_mesh-default",
    dataset: "gcp.anthos_mesh",
    group: "containers",
    description: "Parse JSON from message field for gcp.anthos_mesh (service anthos-service-mesh)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.apigateway-default",
    dataset: "gcp.apigateway",
    group: "devtools",
    description: "Parse JSON from message field for gcp.apigateway (service api-gateway)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.apigee-default",
    dataset: "gcp.apigee",
    group: "devtools",
    description: "Parse JSON from message field for gcp.apigee (service apigee)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.apihub-default",
    dataset: "gcp.apihub",
    group: "integration",
    description: "Parse JSON from message field for gcp.apihub (service api-hub)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.appengine-default",
    dataset: "gcp.appengine",
    group: "serverless",
    description: "Parse JSON from message field for gcp.appengine (service app-engine)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.appintegration-default",
    dataset: "gcp.appintegration",
    group: "integration",
    description: "Parse JSON from message field for gcp.appintegration (service application-integration)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.artifactregistry-default",
    dataset: "gcp.artifactregistry",
    group: "containers",
    description: "Parse JSON from message field for gcp.artifactregistry (service artifact-registry)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.assuredworkloads-default",
    dataset: "gcp.assuredworkloads",
    group: "security",
    description: "Parse JSON from message field for gcp.assuredworkloads (service assured-workloads)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.audit-default",
    dataset: "gcp.audit",
    group: "management",
    description: "Parse JSON from message field for gcp.audit (service cloud-audit-logs)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.automl-default",
    dataset: "gcp.automl",
    group: "aiml",
    description: "Parse JSON from message field for gcp.automl (service automl)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.backupdr-default",
    dataset: "gcp.backupdr",
    group: "storage",
    description: "Parse JSON from message field for gcp.backupdr (service backup-dr)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.baremetalsolution-default",
    dataset: "gcp.baremetalsolution",
    group: "compute",
    description: "Parse JSON from message field for gcp.baremetalsolution (service bare-metal)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.batch-default",
    dataset: "gcp.batch",
    group: "compute",
    description: "Parse JSON from message field for gcp.batch (service batch)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.beyondcorp-default",
    dataset: "gcp.beyondcorp",
    group: "security",
    description: "Parse JSON from message field for gcp.beyondcorp (service beyondcorp)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.bigquery-default",
    dataset: "gcp.bigquery",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.bigquery (service bigquery)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.bigtable-default",
    dataset: "gcp.bigtable",
    group: "databases",
    description: "Parse JSON from message field for gcp.bigtable (service bigtable)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.billing-default",
    dataset: "gcp.billing",
    group: "management",
    description: "Parse JSON from message field for gcp.billing (service billing)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.binaryauthorization-default",
    dataset: "gcp.binaryauthorization",
    group: "security",
    description: "Parse JSON from message field for gcp.binaryauthorization (service binary-authorization)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.bms_oracle-default",
    dataset: "gcp.bms_oracle",
    group: "databases",
    description: "Parse JSON from message field for gcp.bms_oracle (service bare-metal-oracle)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.carbon-default",
    dataset: "gcp.carbon",
    group: "management",
    description: "Parse JSON from message field for gcp.carbon (service carbon-footprint)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cas-default",
    dataset: "gcp.cas",
    group: "security",
    description: "Parse JSON from message field for gcp.cas (service certificate-authority)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.ccai-default",
    dataset: "gcp.ccai",
    group: "aiml",
    description: "Parse JSON from message field for gcp.ccai (service contact-center-ai)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cdn-default",
    dataset: "gcp.cdn",
    group: "networking",
    description: "Parse JSON from message field for gcp.cdn (service cloud-cdn)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.chronicle-default",
    dataset: "gcp.chronicle",
    group: "security",
    description: "Parse JSON from message field for gcp.chronicle (service chronicle)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloud_ids-default",
    dataset: "gcp.cloud_ids",
    group: "networking",
    description: "Parse JSON from message field for gcp.cloud_ids (service cloud-ids)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudarmor-default",
    dataset: "gcp.cloudarmor",
    group: "networking",
    description: "Parse JSON from message field for gcp.cloudarmor (service cloud-armor)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudasset-default",
    dataset: "gcp.cloudasset",
    group: "management",
    description: "Parse JSON from message field for gcp.cloudasset (service cloud-asset-inventory)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudbuild-default",
    dataset: "gcp.cloudbuild",
    group: "devtools",
    description: "Parse JSON from message field for gcp.cloudbuild (service cloud-build)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.clouddeploy-default",
    dataset: "gcp.clouddeploy",
    group: "devtools",
    description: "Parse JSON from message field for gcp.clouddeploy (service cloud-deploy)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudfunctions-default",
    dataset: "gcp.cloudfunctions",
    group: "serverless",
    description: "Parse JSON from message field for gcp.cloudfunctions (service cloud-functions)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudidentity-default",
    dataset: "gcp.cloudidentity",
    group: "security",
    description: "Parse JSON from message field for gcp.cloudidentity (service cloud-identity)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudrouter-default",
    dataset: "gcp.cloudrouter",
    group: "networking",
    description: "Parse JSON from message field for gcp.cloudrouter (service cloud-router)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudrun-default",
    dataset: "gcp.cloudrun",
    group: "serverless",
    description: "Parse JSON from message field for gcp.cloudrun (service cloud-run)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudrun_jobs-default",
    dataset: "gcp.cloudrun_jobs",
    group: "serverless",
    description: "Parse JSON from message field for gcp.cloudrun_jobs (service cloud-run-jobs)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudscheduler-default",
    dataset: "gcp.cloudscheduler",
    group: "serverless",
    description: "Parse JSON from message field for gcp.cloudscheduler (service cloud-scheduler)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudshell-default",
    dataset: "gcp.cloudshell",
    group: "devtools",
    description: "Parse JSON from message field for gcp.cloudshell (service cloud-shell)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudsql-default",
    dataset: "gcp.cloudsql",
    group: "databases",
    description: "Parse JSON from message field for gcp.cloudsql (service cloud-sql)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudtasks-default",
    dataset: "gcp.cloudtasks",
    group: "serverless",
    description: "Parse JSON from message field for gcp.cloudtasks (service cloud-tasks)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.cloudtrace-default",
    dataset: "gcp.cloudtrace",
    group: "operations",
    description: "Parse JSON from message field for gcp.cloudtrace (service cloud-trace)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.composer-default",
    dataset: "gcp.composer",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.composer (service composer)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.compute-default",
    dataset: "gcp.compute",
    group: "compute",
    description: "Parse JSON from message field for gcp.compute (service compute-engine)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.compute_sole_tenant-default",
    dataset: "gcp.compute_sole_tenant",
    group: "compute",
    description: "Parse JSON from message field for gcp.compute_sole_tenant (service sole-tenant-nodes)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.compute_spot-default",
    dataset: "gcp.compute_spot",
    group: "compute",
    description: "Parse JSON from message field for gcp.compute_spot (service spot-vms)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.confidential_computing-default",
    dataset: "gcp.confidential_computing",
    group: "compute",
    description: "Parse JSON from message field for gcp.confidential_computing (service confidential-computing)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.configconnector-default",
    dataset: "gcp.configconnector",
    group: "management",
    description: "Parse JSON from message field for gcp.configconnector (service config-connector)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.containerregistry-default",
    dataset: "gcp.containerregistry",
    group: "containers",
    description: "Parse JSON from message field for gcp.containerregistry (service container-registry)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.datacatalog-default",
    dataset: "gcp.datacatalog",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.datacatalog (service data-catalog)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.dataflow-default",
    dataset: "gcp.dataflow",
    group: "streaming",
    description: "Parse JSON from message field for gcp.dataflow (service dataflow)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.datafusion-default",
    dataset: "gcp.datafusion",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.datafusion (service data-fusion)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.dataplex-default",
    dataset: "gcp.dataplex",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.dataplex (service dataplex)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.dataprep-default",
    dataset: "gcp.dataprep",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.dataprep (service dataprep)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.dataproc-default",
    dataset: "gcp.dataproc",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.dataproc (service dataproc)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.datastream-default",
    dataset: "gcp.datastream",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.datastream (service datastream)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.deploymentmanager-default",
    dataset: "gcp.deploymentmanager",
    group: "management",
    description: "Parse JSON from message field for gcp.deploymentmanager (service deployment-manager)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.dialogflow-default",
    dataset: "gcp.dialogflow",
    group: "aiml",
    description: "Parse JSON from message field for gcp.dialogflow (service dialogflow)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.dlp-default",
    dataset: "gcp.dlp",
    group: "security",
    description: "Parse JSON from message field for gcp.dlp (service dlp)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.dms-default",
    dataset: "gcp.dms",
    group: "databases",
    description: "Parse JSON from message field for gcp.dms (service database-migration)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.dns-default",
    dataset: "gcp.dns",
    group: "networking",
    description: "Parse JSON from message field for gcp.dns (service cloud-dns)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.documentai-default",
    dataset: "gcp.documentai",
    group: "aiml",
    description: "Parse JSON from message field for gcp.documentai (service document-ai)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.domains-default",
    dataset: "gcp.domains",
    group: "networking",
    description: "Parse JSON from message field for gcp.domains (service cloud-domains)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.endpoints-default",
    dataset: "gcp.endpoints",
    group: "devtools",
    description: "Parse JSON from message field for gcp.endpoints (service cloud-endpoints)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.errorreporting-default",
    dataset: "gcp.errorreporting",
    group: "operations",
    description: "Parse JSON from message field for gcp.errorreporting (service error-reporting)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.essentialcontacts-default",
    dataset: "gcp.essentialcontacts",
    group: "management",
    description: "Parse JSON from message field for gcp.essentialcontacts (service essential-contacts)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.eventarc-default",
    dataset: "gcp.eventarc",
    group: "serverless",
    description: "Parse JSON from message field for gcp.eventarc (service eventarc)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.featurestore-default",
    dataset: "gcp.featurestore",
    group: "aiml",
    description: "Parse JSON from message field for gcp.featurestore (service vertex-ai-feature-store)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.filestore-default",
    dataset: "gcp.filestore",
    group: "storage",
    description: "Parse JSON from message field for gcp.filestore (service filestore)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.firebase-default",
    dataset: "gcp.firebase",
    group: "devtools",
    description: "Parse JSON from message field for gcp.firebase (service firebase)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.firebase_rtdb-default",
    dataset: "gcp.firebase_rtdb",
    group: "databases",
    description: "Parse JSON from message field for gcp.firebase_rtdb (service firebase-rtdb)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.firestore-default",
    dataset: "gcp.firestore",
    group: "databases",
    description: "Parse JSON from message field for gcp.firestore (service firestore)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.gcs-default",
    dataset: "gcp.gcs",
    group: "storage",
    description: "Parse JSON from message field for gcp.gcs (service cloud-storage)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.gemini-default",
    dataset: "gcp.gemini",
    group: "aiml",
    description: "Parse JSON from message field for gcp.gemini (service gemini)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.gemini_code_assist-default",
    dataset: "gcp.gemini_code_assist",
    group: "devtools",
    description: "Parse JSON from message field for gcp.gemini_code_assist (service gemini-code-assist)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.gke-default",
    dataset: "gcp.gke",
    group: "containers",
    description: "Parse JSON from message field for gcp.gke (service gke)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.gke_autopilot-default",
    dataset: "gcp.gke_autopilot",
    group: "containers",
    description: "Parse JSON from message field for gcp.gke_autopilot (service gke-autopilot)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.gke_enterprise-default",
    dataset: "gcp.gke_enterprise",
    group: "containers",
    description: "Parse JSON from message field for gcp.gke_enterprise (service gke-enterprise)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.healthcare-default",
    dataset: "gcp.healthcare",
    group: "aiml",
    description: "Parse JSON from message field for gcp.healthcare (service healthcare-api)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.iam-default",
    dataset: "gcp.iam",
    group: "security",
    description: "Parse JSON from message field for gcp.iam (service iam)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.iap-default",
    dataset: "gcp.iap",
    group: "security",
    description: "Parse JSON from message field for gcp.iap (service identity-aware-proxy)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.integration_connectors-default",
    dataset: "gcp.integration_connectors",
    group: "integration",
    description: "Parse JSON from message field for gcp.integration_connectors (service integration-connectors)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.interconnect-default",
    dataset: "gcp.interconnect",
    group: "networking",
    description: "Parse JSON from message field for gcp.interconnect (service cloud-interconnect)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.iot-default",
    dataset: "gcp.iot",
    group: "iot",
    description: "Parse JSON from message field for gcp.iot (service iot-core)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.kms-default",
    dataset: "gcp.kms",
    group: "security",
    description: "Parse JSON from message field for gcp.kms (service cloud-kms)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.language-default",
    dataset: "gcp.language",
    group: "aiml",
    description: "Parse JSON from message field for gcp.language (service natural-language)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.livestream-default",
    dataset: "gcp.livestream",
    group: "media",
    description: "Parse JSON from message field for gcp.livestream (service live-stream)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.loadbalancing-default",
    dataset: "gcp.loadbalancing",
    group: "networking",
    description: "Parse JSON from message field for gcp.loadbalancing (service cloud-lb)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.logging-default",
    dataset: "gcp.logging",
    group: "management",
    description: "Parse JSON from message field for gcp.logging (service cloud-logging)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.looker-default",
    dataset: "gcp.looker",
    group: "datawarehouse",
    description: "Parse JSON from message field for gcp.looker (service looker)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.managed_ad-default",
    dataset: "gcp.managed_ad",
    group: "security",
    description: "Parse JSON from message field for gcp.managed_ad (service managed-ad)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.matching_engine-default",
    dataset: "gcp.matching_engine",
    group: "aiml",
    description: "Parse JSON from message field for gcp.matching_engine (service vertex-ai-matching-engine)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.mediacdn-default",
    dataset: "gcp.mediacdn",
    group: "networking",
    description: "Parse JSON from message field for gcp.mediacdn (service media-cdn)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.memorystore-default",
    dataset: "gcp.memorystore",
    group: "databases",
    description: "Parse JSON from message field for gcp.memorystore (service memorystore)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.migrate_containers-default",
    dataset: "gcp.migrate_containers",
    group: "containers",
    description: "Parse JSON from message field for gcp.migrate_containers (service migrate-to-containers)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.migrate_vms-default",
    dataset: "gcp.migrate_vms",
    group: "compute",
    description: "Parse JSON from message field for gcp.migrate_vms (service migrate-to-vms)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.monitoring-default",
    dataset: "gcp.monitoring",
    group: "management",
    description: "Parse JSON from message field for gcp.monitoring (service cloud-monitoring)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.nat-default",
    dataset: "gcp.nat",
    group: "networking",
    description: "Parse JSON from message field for gcp.nat (service cloud-nat)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.ncc-default",
    dataset: "gcp.ncc",
    group: "networking",
    description: "Parse JSON from message field for gcp.ncc (service network-connectivity-center)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.nic-default",
    dataset: "gcp.nic",
    group: "networking",
    description: "Parse JSON from message field for gcp.nic (service network-intelligence-center)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.nst-default",
    dataset: "gcp.nst",
    group: "networking",
    description: "Parse JSON from message field for gcp.nst (service network-service-tiers)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.orgpolicy-default",
    dataset: "gcp.orgpolicy",
    group: "management",
    description: "Parse JSON from message field for gcp.orgpolicy (service org-policy)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.oslogin-default",
    dataset: "gcp.oslogin",
    group: "security",
    description: "Parse JSON from message field for gcp.oslogin (service os-login)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.packetmirroring-default",
    dataset: "gcp.packetmirroring",
    group: "networking",
    description: "Parse JSON from message field for gcp.packetmirroring (service packet-mirroring)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.persistentdisk-default",
    dataset: "gcp.persistentdisk",
    group: "storage",
    description: "Parse JSON from message field for gcp.persistentdisk (service persistent-disk)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.profiler-default",
    dataset: "gcp.profiler",
    group: "operations",
    description: "Parse JSON from message field for gcp.profiler (service cloud-profiler)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.psc-default",
    dataset: "gcp.psc",
    group: "networking",
    description: "Parse JSON from message field for gcp.psc (service private-service-connect)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.pubsub-default",
    dataset: "gcp.pubsub",
    group: "streaming",
    description: "Parse JSON from message field for gcp.pubsub (service pubsub)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.pubsublite-default",
    dataset: "gcp.pubsublite",
    group: "streaming",
    description: "Parse JSON from message field for gcp.pubsublite (service pubsub-lite)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.recaptcha-default",
    dataset: "gcp.recaptcha",
    group: "security",
    description: "Parse JSON from message field for gcp.recaptcha (service recaptcha-enterprise)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.recommendations-default",
    dataset: "gcp.recommendations",
    group: "aiml",
    description: "Parse JSON from message field for gcp.recommendations (service recommendations-ai)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.recommender-default",
    dataset: "gcp.recommender",
    group: "management",
    description: "Parse JSON from message field for gcp.recommender (service recommender)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.resourcemanager-default",
    dataset: "gcp.resourcemanager",
    group: "management",
    description: "Parse JSON from message field for gcp.resourcemanager (service resource-manager)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.retail-default",
    dataset: "gcp.retail",
    group: "aiml",
    description: "Parse JSON from message field for gcp.retail (service retail-api)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.scc-default",
    dataset: "gcp.scc",
    group: "security",
    description: "Parse JSON from message field for gcp.scc (service security-command-center)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.secops-default",
    dataset: "gcp.secops",
    group: "security",
    description: "Parse JSON from message field for gcp.secops (service security-operations)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.secretmanager-default",
    dataset: "gcp.secretmanager",
    group: "security",
    description: "Parse JSON from message field for gcp.secretmanager (service secret-manager)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.serverless_neg-default",
    dataset: "gcp.serverless_neg",
    group: "networking",
    description: "Parse JSON from message field for gcp.serverless_neg (service serverless-neg)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.servicedirectory-default",
    dataset: "gcp.servicedirectory",
    group: "management",
    description: "Parse JSON from message field for gcp.servicedirectory (service service-directory)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.shielded_vms-default",
    dataset: "gcp.shielded_vms",
    group: "compute",
    description: "Parse JSON from message field for gcp.shielded_vms (service shielded-vms)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.sourcerepo-default",
    dataset: "gcp.sourcerepo",
    group: "devtools",
    description: "Parse JSON from message field for gcp.sourcerepo (service source-repositories)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.spanner-default",
    dataset: "gcp.spanner",
    group: "databases",
    description: "Parse JSON from message field for gcp.spanner (service cloud-spanner)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.speech-default",
    dataset: "gcp.speech",
    group: "aiml",
    description: "Parse JSON from message field for gcp.speech (service speech-to-text)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.storagetransfer-default",
    dataset: "gcp.storagetransfer",
    group: "storage",
    description: "Parse JSON from message field for gcp.storagetransfer (service storage-transfer)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.tags-default",
    dataset: "gcp.tags",
    group: "management",
    description: "Parse JSON from message field for gcp.tags (service tags)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.tensorboard-default",
    dataset: "gcp.tensorboard",
    group: "aiml",
    description: "Parse JSON from message field for gcp.tensorboard (service vertex-ai-tensorboard)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.texttospeech-default",
    dataset: "gcp.texttospeech",
    group: "aiml",
    description: "Parse JSON from message field for gcp.texttospeech (service text-to-speech)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.tpu-default",
    dataset: "gcp.tpu",
    group: "compute",
    description: "Parse JSON from message field for gcp.tpu (service cloud-tpu)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.trafficdirector-default",
    dataset: "gcp.trafficdirector",
    group: "networking",
    description: "Parse JSON from message field for gcp.trafficdirector (service traffic-director)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.transcoder-default",
    dataset: "gcp.transcoder",
    group: "media",
    description: "Parse JSON from message field for gcp.transcoder (service transcoder)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.translate-default",
    dataset: "gcp.translate",
    group: "aiml",
    description: "Parse JSON from message field for gcp.translate (service translation)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vertexai-default",
    dataset: "gcp.vertexai",
    group: "aiml",
    description: "Parse JSON from message field for gcp.vertexai (service vertex-ai)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vertexai_pipelines-default",
    dataset: "gcp.vertexai_pipelines",
    group: "aiml",
    description: "Parse JSON from message field for gcp.vertexai_pipelines (service vertex-ai-pipelines)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vertexaisearch-default",
    dataset: "gcp.vertexaisearch",
    group: "aiml",
    description: "Parse JSON from message field for gcp.vertexaisearch (service vertex-ai-search)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.videointelligence-default",
    dataset: "gcp.videointelligence",
    group: "media",
    description: "Parse JSON from message field for gcp.videointelligence (service video-intelligence)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vision-default",
    dataset: "gcp.vision",
    group: "aiml",
    description: "Parse JSON from message field for gcp.vision (service vision-ai)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vmwareengine-default",
    dataset: "gcp.vmwareengine",
    group: "compute",
    description: "Parse JSON from message field for gcp.vmwareengine (service vmware-engine)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vpcaccess-default",
    dataset: "gcp.vpcaccess",
    group: "serverless",
    description: "Parse JSON from message field for gcp.vpcaccess (service serverless-vpc-access)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vpcflow-default",
    dataset: "gcp.vpcflow",
    group: "networking",
    description: "Parse JSON from message field for gcp.vpcflow (service vpc-flow)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vpcsc-default",
    dataset: "gcp.vpcsc",
    group: "security",
    description: "Parse JSON from message field for gcp.vpcsc (service vpc-service-controls)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.vpn-default",
    dataset: "gcp.vpn",
    group: "networking",
    description: "Parse JSON from message field for gcp.vpn (service cloud-vpn)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.webrisk-default",
    dataset: "gcp.webrisk",
    group: "security",
    description: "Parse JSON from message field for gcp.webrisk (service web-risk)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.websecurityscanner-default",
    dataset: "gcp.websecurityscanner",
    group: "security",
    description: "Parse JSON from message field for gcp.websecurityscanner (service web-security-scanner)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.workbench-default",
    dataset: "gcp.workbench",
    group: "aiml",
    description: "Parse JSON from message field for gcp.workbench (service vertex-ai-workbench)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.workflows-default",
    dataset: "gcp.workflows",
    group: "serverless",
    description: "Parse JSON from message field for gcp.workflows (service workflows)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-gcp.workstations-default",
    dataset: "gcp.workstations",
    group: "compute",
    description: "Parse JSON from message field for gcp.workstations (service cloud-workstations)",
    processors: [
      { json: { field: "message", target_field: "gcp.parsed", ignore_failure: true } },
    ],
  },
];
