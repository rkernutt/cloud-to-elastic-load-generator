/**
 * ServiceNow CMDB log generator.
 *
 * Produces realistic ServiceNow records across key CMDB and ITSM tables:
 *   cmdb_ci, cmdb_ci_service, cmdb_rel_ci, incident, change_request,
 *   sys_user, sys_user_group, cmn_department, cmn_location
 *
 * Records are designed to correlate with the cloud data pipeline chain
 * generators so that CMDB lookups can enrich alerts (e.g. "who owns
 * the EMR cluster that failed?", "what support group handles it?").
 *
 * Each document uses `__dataset: "servicenow.event"` to route to the
 * correct `logs-servicenow.event-*` index and follows the integration's
 * `.value` / `.display_value` field convention.
 */

import { rand, randInt, randId } from "../../helpers/index.js";
import { DATA_ENGINEERING_USERS, type PipelineUser } from "../../helpers/identity.js";
import type { EcsDocument } from "../../aws/generators/types.js";

// ── Stable reference IDs ────────────────────────────────────────────────────
// Lazy-initialized to avoid module-order issues in the production bundle.

const sysId = () => randId(32).toLowerCase();

let _supportGroups: { id: string; name: string }[] | null = null;
function getSupportGroups() {
  if (!_supportGroups)
    _supportGroups = [
      { id: sysId(), name: "Data Engineering Team" },
      { id: sysId(), name: "Analytics Platform Team" },
      { id: sysId(), name: "Data Platform Operations" },
      { id: sysId(), name: "ML Engineering Team" },
      { id: sysId(), name: "Cloud Infrastructure Team" },
      { id: sysId(), name: "DevOps Team" },
    ];
  return _supportGroups;
}

let _departments: { id: string; name: string; head: string }[] | null = null;
function getDepartments() {
  if (!_departments)
    _departments = [
      { id: sysId(), name: "Data Engineering", head: "jordan.chen" },
      { id: sysId(), name: "Analytics", head: "alex.rodriguez" },
      { id: sysId(), name: "Data Platform", head: "sam.wilson" },
      { id: sysId(), name: "ML Engineering", head: "maya.patel" },
      { id: sysId(), name: "Data Operations", head: "liam.murphy" },
      { id: sysId(), name: "DevOps", head: "priya.sharma" },
    ];
  return _departments;
}

let _locations:
  | { id: string; name: string; city: string; state: string; country: string }[]
  | null = null;
function getLocations() {
  if (!_locations)
    _locations = [
      { id: sysId(), name: "US-East HQ", city: "Ashburn", state: "Virginia", country: "US" },
      {
        id: sysId(),
        name: "US-West Office",
        city: "San Francisco",
        state: "California",
        country: "US",
      },
      { id: sysId(), name: "EU-West Office", city: "London", state: "England", country: "GB" },
      { id: sysId(), name: "EU-Central DC", city: "Frankfurt", state: "Hesse", country: "DE" },
      {
        id: sysId(),
        name: "AP-South Office",
        city: "Bangalore",
        state: "Karnataka",
        country: "IN",
      },
    ];
  return _locations;
}

// Cloud infrastructure CIs that mirror the data pipeline chain generators
const AWS_CIS = [
  {
    name: "mwaa-globex-prod",
    class: "cmdb_ci_cloud_service_account",
    cat: "Cloud Service",
    env: "Production",
    desc: "Amazon MWAA (Airflow) orchestration environment for production data pipelines",
  },
  {
    name: "analytics-raw-ingest",
    class: "cmdb_ci_storage_volume",
    cat: "Storage",
    env: "Production",
    desc: "S3 bucket for raw data ingestion (Avro/Parquet landing zone)",
  },
  {
    name: "analytics-processed",
    class: "cmdb_ci_storage_volume",
    cat: "Storage",
    env: "Production",
    desc: "S3 bucket for processed/curated data output",
  },
  {
    name: "emr-analytics-cluster",
    class: "cmdb_ci_cluster",
    cat: "Compute",
    env: "Production",
    desc: "EMR Spark cluster for data transformation and analytics workloads",
  },
  {
    name: "glue-catalog-updater",
    class: "cmdb_ci_cloud_service_account",
    cat: "Cloud Service",
    env: "Production",
    desc: "AWS Glue Crawler for automated data catalog updates",
  },
  {
    name: "athena-analytics-wg",
    class: "cmdb_ci_cloud_service_account",
    cat: "Cloud Service",
    env: "Production",
    desc: "Athena workgroup for SQL analytics queries on processed data",
  },
  {
    name: "data-lake-landing",
    class: "cmdb_ci_storage_volume",
    cat: "Storage",
    env: "Production",
    desc: "S3 bucket for multi-source data lake landing zone",
  },
  {
    name: "event-collector-output",
    class: "cmdb_ci_storage_volume",
    cat: "Storage",
    env: "Production",
    desc: "S3 bucket for clickstream and event collector output",
  },
];

const GCP_CIS = [
  {
    name: "composer-globex-prod",
    class: "cmdb_ci_cloud_service_account",
    cat: "Cloud Service",
    env: "Production",
    desc: "GCP Cloud Composer (Airflow) environment for production pipelines",
  },
  {
    name: "dataproc-etl",
    class: "cmdb_ci_cluster",
    cat: "Compute",
    env: "Production",
    desc: "Dataproc Spark cluster for ETL processing",
  },
  {
    name: "bigquery-analytics",
    class: "cmdb_ci_db_instance",
    cat: "Database",
    env: "Production",
    desc: "BigQuery dataset for analytics and reporting queries",
  },
  {
    name: "gcs-analytics-raw-ingest",
    class: "cmdb_ci_storage_volume",
    cat: "Storage",
    env: "Production",
    desc: "GCS bucket for raw data ingestion",
  },
  {
    name: "gcs-analytics-processed",
    class: "cmdb_ci_storage_volume",
    cat: "Storage",
    env: "Production",
    desc: "GCS bucket for processed data output",
  },
];

const AZURE_CIS = [
  {
    name: "adf-globex-prod",
    class: "cmdb_ci_cloud_service_account",
    cat: "Cloud Service",
    env: "Production",
    desc: "Azure Data Factory pipeline orchestration",
  },
  {
    name: "dbw-analytics-workspace",
    class: "cmdb_ci_cluster",
    cat: "Compute",
    env: "Production",
    desc: "Azure Databricks workspace for Spark analytics",
  },
  {
    name: "syn-analytics-pool",
    class: "cmdb_ci_db_instance",
    cat: "Database",
    env: "Production",
    desc: "Synapse Analytics SQL pool for data warehouse queries",
  },
  {
    name: "st-analytics-raw",
    class: "cmdb_ci_storage_volume",
    cat: "Storage",
    env: "Production",
    desc: "Azure Blob Storage for raw data ingestion",
  },
  {
    name: "st-analytics-processed",
    class: "cmdb_ci_storage_volume",
    cat: "Storage",
    env: "Production",
    desc: "Azure Blob Storage for processed data",
  },
  {
    name: "purview-globex",
    class: "cmdb_ci_cloud_service_account",
    cat: "Cloud Service",
    env: "Production",
    desc: "Azure Purview data catalog and governance",
  },
];

const ALL_CIS = [...AWS_CIS, ...GCP_CIS, ...AZURE_CIS];

const BUSINESS_SERVICES = [
  {
    name: "Data Pipeline Service",
    desc: "End-to-end data pipeline orchestration and processing",
    criticality: "1 - Most Critical",
  },
  {
    name: "Analytics Platform",
    desc: "Self-service analytics and BI platform",
    criticality: "2 - Somewhat Critical",
  },
  {
    name: "Data Warehouse Service",
    desc: "Enterprise data warehouse for reporting",
    criticality: "2 - Somewhat Critical",
  },
  {
    name: "ML Feature Store",
    desc: "Feature engineering and serving for ML models",
    criticality: "3 - Less Critical",
  },
  {
    name: "Data Governance Platform",
    desc: "Data cataloging, lineage, and quality monitoring",
    criticality: "2 - Somewhat Critical",
  },
];

const INCIDENT_TEMPLATES = [
  {
    short: "Pipeline failure — null/empty data detected in source files",
    cat: "Data Processing",
    subcat: "Pipeline Failure",
    impact: 2,
    urgency: 2,
  },
  {
    short: "EMR Spark job failed — AvroParseException on source data",
    cat: "Data Processing",
    subcat: "Job Failure",
    impact: 2,
    urgency: 3,
  },
  {
    short: "Pipeline degraded — zero records processed in latest run",
    cat: "Data Processing",
    subcat: "Data Quality",
    impact: 3,
    urgency: 2,
  },
  {
    short: "S3 source file format error — expected Avro, found CSV",
    cat: "Data Processing",
    subcat: "Data Quality",
    impact: 2,
    urgency: 2,
  },
  {
    short: "Athena query returned 0 rows — possible data gap",
    cat: "Data Processing",
    subcat: "Data Quality",
    impact: 3,
    urgency: 3,
  },
  {
    short: "Pipeline SLA breach — daily ETL exceeded 60-minute threshold",
    cat: "Data Processing",
    subcat: "SLA Violation",
    impact: 1,
    urgency: 1,
  },
  {
    short: "Glue Crawler failed to update catalog after pipeline run",
    cat: "Data Processing",
    subcat: "Catalog Failure",
    impact: 3,
    urgency: 3,
  },
  {
    short: "Data pipeline halted — special characters in S3 key path",
    cat: "Data Processing",
    subcat: "Pipeline Failure",
    impact: 2,
    urgency: 2,
  },
  {
    short: "BigQuery query timeout — excessive slot usage detected",
    cat: "Data Processing",
    subcat: "Performance",
    impact: 2,
    urgency: 2,
  },
  {
    short: "Databricks cluster auto-terminated during active job",
    cat: "Data Processing",
    subcat: "Infrastructure",
    impact: 2,
    urgency: 1,
  },
];

const CHANGE_TEMPLATES = [
  { short: "Update pipeline schedule from hourly to every 15 minutes", type: "Standard", risk: 3 },
  { short: "Upgrade EMR cluster to emr-7.1.0 release", type: "Normal", risk: 2 },
  { short: "Add new Avro schema validation step to pipeline", type: "Normal", risk: 2 },
  { short: "Migrate S3 landing zone to new bucket with encryption", type: "Normal", risk: 1 },
  {
    short: "Increase Databricks cluster autoscale max from 8 to 16 nodes",
    type: "Standard",
    risk: 3,
  },
  { short: "Deploy Airflow DAG v2.3.0 with retry logic improvements", type: "Standard", risk: 3 },
  { short: "Update Athena workgroup query result encryption settings", type: "Standard", risk: 3 },
  { short: "Add new data quality checks to pipeline post-processing", type: "Normal", risk: 2 },
];

let _relTypes: { parent: string; type_id: string }[] | null = null;
function getRelTypes() {
  if (!_relTypes)
    _relTypes = [
      { parent: "Depends on::Used by", type_id: sysId() },
      { parent: "Runs on::Hosts", type_id: sysId() },
      { parent: "Contains::Contained by", type_id: sysId() },
      { parent: "Sends data to::Receives data from", type_id: sysId() },
    ];
  return _relTypes;
}

// ── ServiceNow field helpers ────────────────────────────────────────────────

function snField(value: unknown, displayValue?: string) {
  const v = value === null || value === undefined ? "" : String(value);
  return { value: v, display_value: displayValue ?? v };
}

function snRefField(id: string, displayValue: string) {
  return { value: id, display_value: displayValue };
}

function snDateField(ts: string, offsetHours = -7) {
  const d = new Date(ts);
  const local = new Date(d.getTime() + offsetHours * 3600 * 1000);
  const fmtLocal = local.toISOString().replace("T", " ").replace("Z", "");
  return { value: ts, display_value: fmtLocal };
}

// ── Table generators ────────────────────────────────────────────────────────

function genCmdbCi(ts: string, user: PipelineUser): EcsDocument {
  const ci = rand(ALL_CIS);
  const group = rand(getSupportGroups());
  const dept = rand(getDepartments());
  const loc = rand(getLocations());
  const id = sysId();
  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["configuration"],
      type: ["info"],
      dataset: "servicenow.event",
    },
    tags: ["cmdb_ci", "servicenow-event"],
    user: { name: ci.name },
    servicenow: {
      event: {
        table_name: "cmdb_ci",
        sys_id: snField(id),
        sys_class_name: snField(ci.class),
        name: snField(ci.name),
        short_description: snField(ci.desc),
        category: snField(ci.cat),
        operational_status: snField("1", "Operational"),
        install_status: snField("1", "Installed"),
        environment: snField(ci.env),
        managed_by: snRefField(sysId(), user.name),
        owned_by: snRefField(sysId(), user.name),
        support_group: snRefField(group.id, group.name),
        department: snRefField(dept.id, dept.name),
        location: snRefField(loc.id, loc.name),
        company: snField("Globex Corporation"),
        busines_criticality: snField("1", "1 - Most Critical"),
        sys_created_on: snDateField(ts),
        sys_updated_on: snDateField(ts),
        sys_created_by: snField(user.name),
        sys_updated_by: snField(user.name),
        sys_domain: snField("global", "global"),
        sys_domain_path: snField("/", "/"),
        monitor: snField("true", "true"),
        discovery_source: snField("ServiceWatch"),
        first_discovered: snDateField(new Date(Date.now() - 90 * 86400000).toISOString()),
        last_discovered: snDateField(ts),
        ip_address: snField(`10.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`),
        fqdn: snField(`${ci.name}.internal.globex.example.com`),
      },
    },
    message: `CMDB CI: ${ci.name} [${ci.class}] — ${ci.desc}`,
    log: { level: "info" },
  };
}

function genCmdbCiService(ts: string, user: PipelineUser): EcsDocument {
  const svc = rand(BUSINESS_SERVICES);
  const group = rand(getSupportGroups());
  const id = sysId();
  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["configuration"],
      type: ["info"],
      dataset: "servicenow.event",
    },
    tags: ["cmdb_ci_service", "servicenow-event"],
    user: { name: user.name },
    servicenow: {
      event: {
        table_name: "cmdb_ci_service",
        sys_id: snField(id),
        sys_class_name: snField("cmdb_ci_service"),
        name: snField(svc.name),
        short_description: snField(svc.desc),
        operational_status: snField("1", "Operational"),
        busines_criticality: snField(svc.criticality.charAt(0), svc.criticality),
        owned_by: snRefField(sysId(), user.name),
        support_group: snRefField(group.id, group.name),
        service_classification: snField("Business Service"),
        service_status: snField("operational", "Operational"),
        used_for: snField("Production"),
        company: snField("Globex Corporation"),
        sys_created_on: snDateField(ts),
        sys_updated_on: snDateField(ts),
        sys_created_by: snField(user.name),
        sys_updated_by: snField(user.name),
        sys_domain: snField("global", "global"),
      },
    },
    message: `CMDB Service: ${svc.name} — ${svc.criticality}`,
    log: { level: "info" },
  };
}

function genCmdbRelCi(ts: string): EcsDocument {
  const parent = rand(ALL_CIS);
  const child = rand(ALL_CIS.filter((c) => c.name !== parent.name));
  const rel = rand(getRelTypes());
  const id = sysId();
  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["configuration"],
      type: ["info"],
      dataset: "servicenow.event",
    },
    tags: ["cmdb_rel_ci", "servicenow-event"],
    servicenow: {
      event: {
        table_name: "cmdb_rel_ci",
        sys_id: snField(id),
        sys_class_name: snField("cmdb_rel_ci"),
        parent: snRefField(sysId(), parent.name),
        child: snRefField(sysId(), child.name),
        type: snRefField(rel.type_id, rel.parent),
        sys_created_on: snDateField(ts),
        sys_updated_on: snDateField(ts),
        sys_domain: snField("global", "global"),
      },
    },
    message: `CMDB Relationship: ${parent.name} [${rel.parent}] ${child.name}`,
    log: { level: "info" },
  };
}

function genIncident(ts: string, user: PipelineUser): EcsDocument {
  const tpl = rand(INCIDENT_TEMPLATES);
  const ci = rand(ALL_CIS);
  const group = rand(getSupportGroups());
  const assignee = rand(DATA_ENGINEERING_USERS);
  const incNumber = `INC${String(randInt(1000000, 9999999)).padStart(7, "0")}`;
  const id = sysId();
  const isResolved = Math.random() < 0.4;
  const stateVal = isResolved ? "6" : rand(["1", "2", "3"]);
  const stateDisp = isResolved
    ? "Resolved"
    : ({ "1": "New", "2": "In Progress", "3": "On Hold" }[stateVal] ?? "New");

  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["configuration"],
      type: ["info"],
      dataset: "servicenow.event",
      severity: tpl.impact,
      created: ts,
    },
    tags: ["incident", "servicenow-event"],
    user: { name: user.name },
    servicenow: {
      event: {
        table_name: "incident",
        sys_id: snField(id),
        sys_class_name: snField("incident"),
        number: snField(incNumber),
        short_description: snField(tpl.short),
        description: snField(
          `Automated alert from CloudLoadGen monitoring. Affected CI: ${ci.name}. ${tpl.short}`
        ),
        state: snField(stateVal, stateDisp),
        impact: snField(
          String(tpl.impact),
          `${tpl.impact} - ${["High", "Medium", "Low"][tpl.impact - 1]}`
        ),
        urgency: snField(
          String(tpl.urgency),
          `${tpl.urgency} - ${["High", "Medium", "Low"][tpl.urgency - 1]}`
        ),
        priority: snField(
          String(Math.ceil((tpl.impact + tpl.urgency) / 2)),
          `${Math.ceil((tpl.impact + tpl.urgency) / 2)} - ${["Critical", "High", "Moderate", "Low"][Math.ceil((tpl.impact + tpl.urgency) / 2) - 1]}`
        ),
        category: snField(tpl.cat),
        subcategory: snField(tpl.subcat),
        cmdb_ci: snRefField(sysId(), ci.name),
        assigned_to: snRefField(sysId(), assignee.name),
        assignment_group: snRefField(group.id, group.name),
        opened_by: snRefField(sysId(), user.name),
        opened_at: snDateField(ts),
        caller_id: snRefField(sysId(), user.name),
        contact_type: snField("Monitoring"),
        company: snField("Globex Corporation"),
        business_service: snRefField(sysId(), rand(BUSINESS_SERVICES).name),
        ...(isResolved
          ? {
              resolved_at: snDateField(
                new Date(new Date(ts).getTime() + randInt(1800, 14400) * 1000).toISOString()
              ),
              resolved_by: snRefField(sysId(), assignee.name),
              close_code: snField("Solved (Permanently)"),
              close_notes: snField(
                `Root cause identified and remediated. ${ci.name} restored to operational status.`
              ),
            }
          : {}),
        sys_created_on: snDateField(ts),
        sys_updated_on: snDateField(ts),
        sys_created_by: snField("monitoring-integration"),
        sys_updated_by: snField(isResolved ? assignee.name : "monitoring-integration"),
        sys_domain: snField("global", "global"),
        made_sla: snField(
          String(!isResolved || Math.random() < 0.8),
          isResolved ? "true" : "false"
        ),
        knowledge: snField("false", "false"),
        escalation: snField("0", "0 - Normal"),
        reassignment_count: snField(String(randInt(0, 3))),
        reopen_count: snField(String(randInt(0, 1))),
      },
    },
    message: `Incident ${incNumber}: ${tpl.short} [${stateDisp}]`,
    log: { level: tpl.impact <= 2 ? "warn" : "info" },
  };
}

function genChangeRequest(ts: string, user: PipelineUser): EcsDocument {
  const tpl = rand(CHANGE_TEMPLATES);
  const ci = rand(ALL_CIS);
  const group = rand(getSupportGroups());
  const chgNumber = `CHG${String(randInt(1000000, 9999999)).padStart(7, "0")}`;
  const id = sysId();
  const stateVal = rand(["1", "-5", "-1", "3", "0"]);
  const stateMap: Record<string, string> = {
    "1": "Open",
    "-5": "New",
    "-1": "Assess",
    "3": "Closed",
    "0": "Review",
  };

  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["configuration"],
      type: ["change"],
      dataset: "servicenow.event",
    },
    tags: ["change_request", "servicenow-event"],
    user: { name: user.name },
    servicenow: {
      event: {
        table_name: "change_request",
        sys_id: snField(id),
        sys_class_name: snField("change_request"),
        number: snField(chgNumber),
        short_description: snField(tpl.short),
        description: snField(
          `Change request for ${ci.name}: ${tpl.short}. Requested by ${user.name}.`
        ),
        state: snField(stateVal, stateMap[stateVal] ?? "Open"),
        type: snField(tpl.type),
        risk: snField(
          String(tpl.risk),
          `${tpl.risk} - ${["High", "Moderate", "Low"][tpl.risk - 1]}`
        ),
        impact: snField("2", "2 - Medium"),
        priority: snField("3", "3 - Moderate"),
        category: snField("Data Processing"),
        cmdb_ci: snRefField(sysId(), ci.name),
        assigned_to: snRefField(sysId(), user.name),
        assignment_group: snRefField(group.id, group.name),
        requested_by: snRefField(sysId(), user.name),
        opened_by: snRefField(sysId(), user.name),
        opened_at: snDateField(ts),
        planned_start_date: snDateField(
          new Date(new Date(ts).getTime() + randInt(86400, 604800) * 1000).toISOString()
        ),
        planned_end_date: snDateField(
          new Date(new Date(ts).getTime() + randInt(604800, 2592000) * 1000).toISOString()
        ),
        approval: snField(stateVal === "3" ? "approved" : "not yet requested"),
        company: snField("Globex Corporation"),
        business_service: snRefField(sysId(), rand(BUSINESS_SERVICES).name),
        implementation_plan: snField(
          `1. Backup current ${ci.name} configuration\n2. Apply changes per RFC\n3. Validate pipeline execution\n4. Monitor for 24 hours`
        ),
        backout_plan: snField(
          `1. Revert to previous configuration\n2. Restart affected services\n3. Validate pipeline health`
        ),
        test_plan: snField(
          `1. Run pipeline with test data\n2. Verify output matches expected schema\n3. Check monitoring dashboards`
        ),
        sys_created_on: snDateField(ts),
        sys_updated_on: snDateField(ts),
        sys_created_by: snField(user.name),
        sys_updated_by: snField(user.name),
        sys_domain: snField("global", "global"),
      },
    },
    message: `Change ${chgNumber}: ${tpl.short} [${stateMap[stateVal] ?? "Open"}]`,
    log: { level: "info" },
  };
}

function genSysUser(ts: string, user: PipelineUser): EcsDocument {
  const dept = rand(getDepartments());
  const loc = rand(getLocations());
  const id = sysId();
  const nameParts = user.name.split(".");
  const firstName = nameParts[0]
    ? nameParts[0].charAt(0).toUpperCase() + nameParts[0].slice(1)
    : user.name;
  const lastName = nameParts[1] ? nameParts[1].charAt(0).toUpperCase() + nameParts[1].slice(1) : "";

  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["iam"],
      type: ["user", "info"],
      dataset: "servicenow.event",
    },
    tags: ["sys_user", "servicenow-event"],
    user: { name: user.name, email: user.email },
    related: { user: [user.name, `${firstName} ${lastName}`.trim()] },
    servicenow: {
      event: {
        table_name: "sys_user",
        sys_id: snField(id),
        sys_class_name: snField("sys_user"),
        user_name: snField(user.name),
        first_name: snField(firstName),
        last_name: snField(lastName),
        name: snField(`${firstName} ${lastName}`.trim()),
        email: snField(user.email),
        title: snField(
          user.department === "data-engineering"
            ? "Senior Data Engineer"
            : user.department === "analytics"
              ? "Analytics Engineer"
              : user.department === "data-platform"
                ? "Platform Engineer"
                : user.department === "ml-engineering"
                  ? "ML Engineer"
                  : user.department === "data-ops"
                    ? "Data Operations Lead"
                    : "Engineer"
        ),
        department: snRefField(dept.id, dept.name),
        location: snRefField(loc.id, loc.name),
        company: snField("Globex Corporation"),
        manager: snRefField(sysId(), dept.head),
        active: snField("true", "true"),
        locked_out: snField("false", "false"),
        vip: snField("false", "false"),
        phone: snField(`+1-${randInt(200, 999)}-${randInt(100, 999)}-${randInt(1000, 9999)}`),
        time_zone: snField("US/Eastern"),
        last_login_time: snDateField(ts),
        sys_created_on: snDateField(new Date(Date.now() - 365 * 86400000).toISOString()),
        sys_updated_on: snDateField(ts),
        sys_created_by: snField("admin"),
        sys_updated_by: snField("admin"),
        sys_domain: snField("global", "global"),
      },
    },
    message: `User: ${firstName} ${lastName} (${user.name}) — ${user.department}`,
    log: { level: "info" },
  };
}

function genSysUserGroup(ts: string): EcsDocument {
  const group = rand(getSupportGroups());
  const manager = rand(DATA_ENGINEERING_USERS);
  const id = group.id;
  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["iam"],
      type: ["group", "info"],
      dataset: "servicenow.event",
    },
    tags: ["sys_user_group", "servicenow-event"],
    servicenow: {
      event: {
        table_name: "sys_user_group",
        sys_id: snField(id),
        sys_class_name: snField("sys_user_group"),
        name: snField(group.name),
        description: snField(
          `Support group responsible for ${group.name.toLowerCase()} operations and incident response`
        ),
        manager: snRefField(sysId(), manager.name),
        email: snField(`${group.name.toLowerCase().replace(/\s+/g, "-")}@globex.example.com`),
        active: snField("true", "true"),
        type: snField(""),
        company: snField("Globex Corporation"),
        sys_created_on: snDateField(new Date(Date.now() - 365 * 86400000).toISOString()),
        sys_updated_on: snDateField(ts),
        sys_created_by: snField("admin"),
        sys_updated_by: snField("admin"),
        sys_domain: snField("global", "global"),
      },
    },
    message: `User Group: ${group.name}`,
    log: { level: "info" },
  };
}

function genDepartment(ts: string): EcsDocument {
  const dept = rand(getDepartments());
  const loc = rand(getLocations());
  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["configuration"],
      type: ["info"],
      dataset: "servicenow.event",
    },
    tags: ["cmn_department", "servicenow-event"],
    servicenow: {
      event: {
        table_name: "cmn_department",
        sys_id: snField(dept.id),
        sys_class_name: snField("cmn_department"),
        name: snField(dept.name),
        dept_head: snRefField(sysId(), dept.head),
        head_count: snField(String(randInt(5, 25))),
        primary_contact: snRefField(sysId(), dept.head),
        company: snField("Globex Corporation"),
        business_unit: snField("Technology"),
        location: snRefField(loc.id, loc.name),
        sys_created_on: snDateField(new Date(Date.now() - 365 * 86400000).toISOString()),
        sys_updated_on: snDateField(ts),
        sys_domain: snField("global", "global"),
      },
    },
    message: `Department: ${dept.name} — Head: ${dept.head}`,
    log: { level: "info" },
  };
}

function genLocation(ts: string): EcsDocument {
  const loc = rand(getLocations());
  return {
    __dataset: "servicenow.event",
    "@timestamp": ts,
    event: {
      kind: "event",
      category: ["configuration"],
      type: ["info"],
      dataset: "servicenow.event",
    },
    tags: ["cmn_location", "servicenow-event"],
    servicenow: {
      event: {
        table_name: "cmn_location",
        sys_id: snField(loc.id),
        sys_class_name: snField("cmn_location"),
        name: snField(loc.name),
        city: snField(loc.city),
        state: snField(loc.state),
        country: snField(loc.country),
        company: snField("Globex Corporation"),
        sys_created_on: snDateField(new Date(Date.now() - 365 * 86400000).toISOString()),
        sys_updated_on: snDateField(ts),
        sys_domain: snField("global", "global"),
      },
    },
    message: `Location: ${loc.name} — ${loc.city}, ${loc.country}`,
    log: { level: "info" },
  };
}

// ── Main generator ──────────────────────────────────────────────────────────

const TABLE_WEIGHTS = [
  { fn: genCmdbCi, weight: 25 },
  { fn: genCmdbCiService, weight: 8 },
  { fn: genCmdbRelCi, weight: 10 },
  { fn: genIncident, weight: 20 },
  { fn: genChangeRequest, weight: 12 },
  { fn: genSysUser, weight: 10 },
  { fn: genSysUserGroup, weight: 5 },
  { fn: genDepartment, weight: 5 },
  { fn: genLocation, weight: 5 },
];

const TOTAL_WEIGHT = TABLE_WEIGHTS.reduce((s, t) => s + t.weight, 0);

function pickTable(): (ts: string, user: PipelineUser) => EcsDocument {
  let r = randInt(0, TOTAL_WEIGHT - 1);
  for (const t of TABLE_WEIGHTS) {
    r -= t.weight;
    if (r < 0) return t.fn as (ts: string, user: PipelineUser) => EcsDocument;
  }
  return genCmdbCi;
}

/**
 * Generate a single ServiceNow CMDB/ITSM log record.
 * The table type is chosen randomly with weighted probabilities that
 * favor CMDB CIs and incidents (the most useful for alert enrichment).
 */
export function generateServiceNowCmdbLog(ts: string, _er: number): EcsDocument {
  const user = rand(DATA_ENGINEERING_USERS);
  return pickTable()(ts, user);
}
