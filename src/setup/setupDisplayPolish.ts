import type { CloudId } from "../cloud/types";

/**
 * Single-token fixes for AWS dashboard title fragments (after "AWS"/"Amazon", before em dash).
 * Keys are lowercase.
 */
const AWS_FRAGMENT_TOKEN: Record<string, string> = {
  evs: "EVS",
  ecs: "ECS",
  ebs: "EBS",
  rds: "RDS",
  sns: "SNS",
  sqs: "SQS",
  msk: "MSK",
  dynamodb: "DynamoDB",
  vpcipam: "VPC IPAM",
  vpn: "VPN",
  simspaceweaver: "SimSpace Weaver",
  endusermessaging: "End User Messaging",
  parallelcomputing: "Parallel Computing",
  workmail: "WorkMail",
  transitgateway: "Transit Gateway",
  storagelens: "Storage Lens",
  neptuneanalytics: "Neptune Analytics",
  groundstation: "Ground Station",
  bedrockdataautomation: "Bedrock Data Automation",
  auroradsql: "Aurora DSQL",
  mainframemodernization: "Mainframe Modernization",
  healthomics: "HealthOmics",
  qdeveloper: "Q Developer",
  natgateway: "NAT Gateway",
  bedrockagent: "Bedrock Agent",
  freertos: "FreeRTOS",
  private5g: "Private 5G",
};

/**
 * Token fixes for GCP / Azure dashboard fragments (after cloud prefix, before em dash).
 * Keys are lowercase. Used for full-title polish and first-word group keys (Gke → GKE).
 */
const CLOUD_WORD_POLISH: Record<string, string> = {
  gke: "GKE",
  gce: "GCE",
  aks: "AKS",
  sql: "SQL",
  iam: "IAM",
  api: "API",
  vpn: "VPN",
  vpc: "VPC",
  kms: "KMS",
  cdn: "CDN",
  dns: "DNS",
  tpu: "TPU",
  ids: "IDS",
  nat: "NAT",
  dr: "DR",
  db: "DB",
  ai: "AI",
  ml: "ML",
  iot: "IoT",
  ad: "AD",
  vm: "VM",
  automl: "AutoML",
  vmware: "VMware",
  alloydb: "AlloyDB",
  dlp: "DLP",
  beyondcorp: "BeyondCorp",
  dataprep: "Dataprep",
  recaptcha: "reCAPTCHA",
  pubsub: "Pub/Sub",
  postgresql: "PostgreSQL",
  mysql: "MySQL",
  bigquery: "BigQuery",
  bigtable: "Bigtable",
  firestore: "Firestore",
  datastore: "Datastore",
  dataproc: "Dataproc",
  dataplex: "Dataplex",
  dataflow: "Dataflow",
  datastream: "Datastream",
  dialogflow: "Dialogflow",
  openai: "OpenAI",
  devops: "DevOps",
  expressroute: "ExpressRoute",
  netapp: "NetApp",
  kusto: "Kusto",
  acr: "ACR",
  hdinsight: "HDInsight",
  sap: "SAP",
  signalr: "SignalR",
  waf: "WAF",
  hpc: "HPC",
  ddos: "DDoS",
};

function polishAwsTitleMiddle(middle: string): string {
  const t = middle.trim().replace(/\s+/g, " ");
  const exact = AWS_FRAGMENT_TOKEN[t.toLowerCase()];
  if (exact) return exact;
  return t
    .split(" ")
    .map((w) => {
      const lower = w.toLowerCase();
      if (AWS_FRAGMENT_TOKEN[lower]) return AWS_FRAGMENT_TOKEN[lower];
      if (/^[A-Z]{2,}$/.test(w) && w.length <= 6) return w;
      return w;
    })
    .join(" ");
}

function polishCloudTitleToken(word: string): string {
  const lower = word.toLowerCase();
  if (CLOUD_WORD_POLISH[lower]) return CLOUD_WORD_POLISH[lower];
  if (/^[A-Z]{2,}$/.test(word) && word.length <= 8) return word;
  return word;
}

function polishGcpAzureTitleMiddle(middle: string): string {
  return middle.trim().replace(/\s+/g, " ").split(" ").map(polishCloudTitleToken).join(" ");
}

/**
 * Full dashboard title fragment (between cloud prefix and em dash), polished — used for Setup
 * group headings so names stay unambiguous (e.g. "Cloud Map" not "Cloud", "Augmented AI" not "Augmented").
 */
export function polishDashboardFragmentForGrouping(fragment: string, cloudId: CloudId): string {
  const t = fragment.trim().replace(/\s+/g, " ");
  if (!t) return "Other";
  if (cloudId === "aws") return polishAwsTitleMiddle(t);
  if (cloudId === "gcp" || cloudId === "azure") return polishGcpAzureTitleMiddle(t);
  return t;
}

/**
 * Normalizes the first word of a dashboard title fragment (e.g. GCP "Gke" and "GKE" → "GKE").
 * Prefer {@link polishDashboardFragmentForGrouping} for Setup dashboard section headings.
 */
export function polishDashboardGroupKeyFirstWord(firstWord: string, cloudId: CloudId): string {
  const w = firstWord.trim();
  if (!w || w === "Other") return w || "Other";
  const lower = w.toLowerCase();
  if (cloudId === "aws") {
    if (AWS_FRAGMENT_TOKEN[lower]) return AWS_FRAGMENT_TOKEN[lower];
    return w;
  }
  if (cloudId === "gcp" || cloudId === "azure") {
    if (CLOUD_WORD_POLISH[lower]) return CLOUD_WORD_POLISH[lower];
    return w;
  }
  return w;
}

/** @deprecated Prefer polishDashboardGroupKeyFirstWord(w, "aws") */
export function polishAwsDashboardGroupHeading(firstWord: string): string {
  return polishDashboardGroupKeyFirstWord(firstWord, "aws");
}

/**
 * Human-friendly dashboard title for Setup checkboxes (vendor product casing).
 */
export function polishSetupDashboardTitle(title: string, cloudId: CloudId): string {
  const t = title.trim();
  if (cloudId === "aws") {
    const re = /^(AWS|Amazon)\s+(.+?)\s+([\u2014\u2013-])/u;
    const m = t.match(re);
    if (!m) return title;
    const polished = polishAwsTitleMiddle(m[2]);
    return `${m[1]} ${polished} ${m[3]}${t.slice(m[0].length)}`;
  }
  if (cloudId === "gcp") {
    const m = t.match(/^GCP\s+(.+?)\s+([\u2014\u2013-])/u);
    if (!m) return title;
    const polished = polishGcpAzureTitleMiddle(m[1]);
    return `GCP ${polished} ${m[2]}${t.slice(m[0].length)}`;
  }
  if (cloudId === "azure") {
    const m = t.match(/^Azure\s+(.+?)\s+([\u2014\u2013-])/u);
    if (!m) return title;
    const polished = polishGcpAzureTitleMiddle(m[1]);
    return `Azure ${polished} ${m[2]}${t.slice(m[0].length)}`;
  }
  return title;
}

const CATEGORY_ACRONYMS: Record<string, string> = {
  ml: "ML",
  ai: "AI",
  aiml: "AIML",
  apm: "APM",
  siem: "SIEM",
  iot: "IoT",
  aws: "AWS",
  gcp: "GCP",
  api: "API",
  sql: "SQL",
  vpc: "VPC",
  eks: "EKS",
  ecs: "ECS",
  rds: "RDS",
  kms: "KMS",
};

/** Whole slugs that are not hyphenated but should read as multiple words (e.g. GCP pipeline groups). */
const CATEGORY_FULL_LABEL_OVERRIDES: Record<string, string> = {
  datawarehouse: "Data Warehouse",
};

/**
 * Pipeline / ML file group ids like `compute-extended`, `aws-ml-data-ml-operations` → readable labels.
 */
export function polishSetupCategoryLabel(category: string): string {
  const s = category.trim();
  if (!s) return s;
  const full = CATEGORY_FULL_LABEL_OVERRIDES[s.toLowerCase()];
  if (full) return full;
  return s
    .split("-")
    .map((part) => {
      const lower = part.toLowerCase();
      if (CATEGORY_ACRONYMS[lower]) return CATEGORY_ACRONYMS[lower];
      if (/^v\d+(\.\d+)?$/i.test(part)) return part.toUpperCase();
      if (part.length <= 1) return part.toUpperCase();
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}
