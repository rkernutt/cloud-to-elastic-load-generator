/**
 * Shared ingest-pipeline processor factories for AWS, GCP, and Azure registries.
 *
 * Each pipeline gets:
 *   1. JSON parse (message → {ns}.parsed)
 *   2. Service-specific field extraction (rename from parsed → proper namespace)
 *   3. Group-aware ECS normalisation (event.category, event.type, event.kind)
 *   4. Log-level normalisation
 *   5. Duration → nanosecond conversion
 *   6. GeoIP enrichment on source.ip / client.ip
 *   7. User-agent parsing
 *   8. related.ip / related.user / related.hosts population
 *   9. Cleanup of intermediate fields
 *  10. on_failure error tagging
 */

// ─── 1. JSON parse ──────────────────────────────────────────────────────────

export function jsonParse(ns) {
  return { json: { field: "message", target_field: `${ns}.parsed`, ignore_failure: true } };
}

// ─── 2. Rename helpers ──────────────────────────────────────────────────────

export function rename(src, dst) {
  return { rename: { field: src, target_field: dst, ignore_missing: true, ignore_failure: true } };
}

// ─── 3. Group-aware ECS normalisation ───────────────────────────────────────

const GROUP_ECS = {
  // AWS groups
  analytics: { kind: "event", category: ["database"], type: ["info"] },
  ml: { kind: "event", category: ["process"], type: ["info"] },
  aiml: { kind: "event", category: ["process"], type: ["info"] },
  serverless: { kind: "event", category: ["process"], type: ["info"] },
  compute: { kind: "event", category: ["host", "process"], type: ["info"] },
  databases: { kind: "event", category: ["database"], type: ["info"] },
  storage: { kind: "event", category: ["file"], type: ["info"] },
  security: { kind: "event", category: ["security"], type: ["info"] },
  networking: { kind: "event", category: ["network"], type: ["info"] },
  streaming: { kind: "event", category: ["process"], type: ["info"] },
  iot: { kind: "event", category: ["host"], type: ["info"] },
  management: { kind: "event", category: ["configuration"], type: ["info"] },
  devtools: { kind: "event", category: ["process"], type: ["info"] },
  enduser: { kind: "event", category: ["session"], type: ["info"] },
  media: { kind: "event", category: ["process"], type: ["info"] },
  // GCP groups
  datawarehouse: { kind: "event", category: ["database"], type: ["info"] },
  containers: { kind: "event", category: ["process"], type: ["info"] },
  integration: { kind: "event", category: ["process"], type: ["info"] },
  // Azure groups
  "data-ai": { kind: "event", category: ["database"], type: ["info"] },
  "serverless-apps": { kind: "event", category: ["process"], type: ["info"] },
  platform: { kind: "event", category: ["configuration"], type: ["info"] },
  misc: { kind: "event", category: ["process"], type: ["info"] },
};

function ecsNorm(group) {
  const ecs = GROUP_ECS[group] || GROUP_ECS.misc;
  return [
    { set: { field: "event.kind", value: ecs.kind, override: false, ignore_failure: true } },
    {
      set: { field: "event.category", value: ecs.category, override: false, ignore_failure: true },
    },
    { set: { field: "event.type", value: ecs.type, override: false, ignore_failure: true } },
  ];
}

// ─── 4. Log-level normalisation ─────────────────────────────────────────────

function logLevelNorm(ns) {
  return [
    rename(`${ns}.parsed.level`, "log.level"),
    rename(`${ns}.parsed.logLevel`, "log.level"),
    rename(`${ns}.parsed.severity`, "log.level"),
    { lowercase: { field: "log.level", ignore_missing: true, ignore_failure: true } },
  ];
}

// ─── 5. Duration normalisation ──────────────────────────────────────────────
// Many generators set event.duration in various units. The script processor
// normalises anything that looks like seconds or milliseconds → nanoseconds.

function durationNorm(ns) {
  return [
    {
      script: {
        lang: "painless",
        description: "Normalise duration fields to event.duration (nanoseconds)",
        source: `
          long nanos = 0L;
          // Check parsed duration_ms, durationMs, durationSeconds, latency_ms, execution_time_ms
          def p = ctx['${ns}']?.parsed;
          if (p != null) {
            if (p.containsKey('duration_ms'))        { nanos = (long)(p.duration_ms * 1000000L); }
            else if (p.containsKey('durationMs'))     { nanos = (long)(p.durationMs * 1000000L); }
            else if (p.containsKey('durationSeconds')){ nanos = (long)(p.durationSeconds * 1000000000L); }
            else if (p.containsKey('latency_ms'))     { nanos = (long)(p.latency_ms * 1000000L); }
            else if (p.containsKey('execution_time_ms')) { nanos = (long)(p.execution_time_ms * 1000000L); }
            else if (p.containsKey('elapsed_ms'))     { nanos = (long)(p.elapsed_ms * 1000000L); }
          }
          if (nanos > 0 && ctx.event?.duration == null) {
            if (ctx.event == null) { ctx.event = new HashMap(); }
            ctx.event.duration = nanos;
          }
        `.trim(),
        ignore_failure: true,
      },
    },
  ];
}

// ─── 6. GeoIP enrichment ────────────────────────────────────────────────────

function geoip() {
  return [
    {
      geoip: {
        field: "source.ip",
        target_field: "source.geo",
        ignore_missing: true,
        ignore_failure: true,
      },
    },
    {
      geoip: {
        field: "client.ip",
        target_field: "client.geo",
        ignore_missing: true,
        ignore_failure: true,
      },
    },
    {
      geoip: {
        field: "destination.ip",
        target_field: "destination.geo",
        ignore_missing: true,
        ignore_failure: true,
      },
    },
  ];
}

// ─── 7. User-agent parsing ──────────────────────────────────────────────────

function userAgentParse() {
  return [
    {
      user_agent: {
        field: "user_agent.original",
        target_field: "user_agent",
        ignore_missing: true,
        ignore_failure: true,
      },
    },
  ];
}

// ─── 8. Related-field population ────────────────────────────────────────────

function relatedFields() {
  return [
    {
      append: {
        field: "related.ip",
        value: ["{{{source.ip}}}"],
        allow_duplicates: false,
        if: "ctx.source?.ip != null",
        ignore_failure: true,
      },
    },
    {
      append: {
        field: "related.ip",
        value: ["{{{destination.ip}}}"],
        allow_duplicates: false,
        if: "ctx.destination?.ip != null",
        ignore_failure: true,
      },
    },
    {
      append: {
        field: "related.ip",
        value: ["{{{client.ip}}}"],
        allow_duplicates: false,
        if: "ctx.client?.ip != null",
        ignore_failure: true,
      },
    },
    {
      append: {
        field: "related.user",
        value: ["{{{user.name}}}"],
        allow_duplicates: false,
        if: "ctx.user?.name != null",
        ignore_failure: true,
      },
    },
    {
      append: {
        field: "related.user",
        value: ["{{{user.email}}}"],
        allow_duplicates: false,
        if: "ctx.user?.email != null",
        ignore_failure: true,
      },
    },
    {
      append: {
        field: "related.user",
        value: ["{{{user.id}}}"],
        allow_duplicates: false,
        if: "ctx.user?.id != null",
        ignore_failure: true,
      },
    },
    {
      append: {
        field: "related.hosts",
        value: ["{{{host.name}}}"],
        allow_duplicates: false,
        if: "ctx.host?.name != null",
        ignore_failure: true,
      },
    },
    {
      append: {
        field: "related.hosts",
        value: ["{{{host.hostname}}}"],
        allow_duplicates: false,
        if: "ctx.host?.hostname != null",
        ignore_failure: true,
      },
    },
  ];
}

// ─── 9. Outcome-driven event.type override ──────────────────────────────────

function outcomeType() {
  return [
    {
      set: {
        field: "event.type",
        value: ["error"],
        override: true,
        if: "ctx.event?.outcome == 'failure'",
        ignore_failure: true,
      },
    },
  ];
}

// ─── 10. Cleanup & on_failure ───────────────────────────────────────────────

function cleanup(ns) {
  return [{ remove: { field: `${ns}.parsed`, ignore_missing: true, ignore_failure: true } }];
}

function onFailure(pipelineId) {
  return [
    { set: { field: "error.message", value: "{{ _ingest.on_failure_message }}" } },
    { append: { field: "tags", value: ["_ingest_pipeline_failure"] } },
    { append: { field: "tags", value: [`_${pipelineId}_failure`] } },
  ];
}

// ─── Cloud-specific identity extraction ─────────────────────────────────────
// For Azure Activity Logs: map identity.claims → user.* if not already set.
// For GCP audit logs: map protoPayload.authenticationInfo → user.*

function azureIdentityExtract() {
  return [
    {
      set: {
        field: "user.email",
        value: "{{{identity.claims.http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn}}}",
        override: false,
        if: "ctx.identity?.claims != null && ctx.identity.claims.containsKey('http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn')",
        ignore_failure: true,
      },
    },
    {
      set: {
        field: "source.ip",
        value: "{{{callerIpAddress}}}",
        override: false,
        if: "ctx.callerIpAddress != null && ctx.source?.ip == null",
        ignore_failure: true,
      },
    },
  ];
}

function gcpIdentityExtract() {
  return [
    {
      set: {
        field: "user.email",
        value: "{{{gcp.parsed.protoPayload.authenticationInfo.principalEmail}}}",
        override: false,
        if: "ctx.gcp?.parsed?.protoPayload?.authenticationInfo?.principalEmail != null",
        ignore_failure: true,
      },
    },
    {
      set: {
        field: "source.ip",
        value: "{{{gcp.parsed.protoPayload.requestMetadata.callerIp}}}",
        override: false,
        if: "ctx.gcp?.parsed?.protoPayload?.requestMetadata?.callerIp != null && ctx.source?.ip == null",
        ignore_failure: true,
      },
    },
  ];
}

// ─── Group-specific extraction for common parsed fields ─────────────────────

function groupExtraction(group, ns) {
  const procs = [];
  switch (group) {
    case "security":
      procs.push(
        rename(`${ns}.parsed.severity`, `${ns}.severity`),
        rename(`${ns}.parsed.finding_type`, "rule.name"),
        rename(`${ns}.parsed.rule_id`, "rule.id"),
        rename(`${ns}.parsed.threat_type`, "threat.technique.name"),
        rename(`${ns}.parsed.action`, "event.action")
      );
      break;
    case "analytics":
    case "datawarehouse":
    case "data-ai":
      procs.push(
        rename(`${ns}.parsed.jobId`, `${ns}.job_id`),
        rename(`${ns}.parsed.job_id`, `${ns}.job_id`),
        rename(`${ns}.parsed.jobName`, `${ns}.job_name`),
        rename(`${ns}.parsed.job_name`, `${ns}.job_name`),
        rename(`${ns}.parsed.state`, `${ns}.state`),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.query`, `${ns}.query`),
        rename(`${ns}.parsed.records_processed`, `${ns}.records_processed`),
        rename(`${ns}.parsed.bytes_scanned`, `${ns}.bytes_scanned`)
      );
      break;
    case "compute":
      procs.push(
        rename(`${ns}.parsed.instance_id`, "host.id"),
        rename(`${ns}.parsed.instanceId`, "host.id"),
        rename(`${ns}.parsed.state`, `${ns}.state`),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.cpu_utilization`, `${ns}.cpu_utilization`),
        rename(`${ns}.parsed.memory_utilization`, `${ns}.memory_utilization`)
      );
      break;
    case "databases":
      procs.push(
        rename(`${ns}.parsed.db_instance`, `${ns}.instance`),
        rename(`${ns}.parsed.instance_id`, `${ns}.instance`),
        rename(`${ns}.parsed.query`, `${ns}.query`),
        rename(`${ns}.parsed.operation`, `${ns}.operation`),
        rename(`${ns}.parsed.latency`, `${ns}.latency_ms`),
        rename(`${ns}.parsed.connections`, `${ns}.connections`),
        rename(`${ns}.parsed.user`, "db.user.name"),
        rename(`${ns}.parsed.statement`, `${ns}.statement`)
      );
      break;
    case "networking":
      procs.push(
        rename(`${ns}.parsed.src_addr`, "source.ip"),
        rename(`${ns}.parsed.dst_addr`, "destination.ip"),
        rename(`${ns}.parsed.src_port`, "source.port"),
        rename(`${ns}.parsed.dst_port`, "destination.port"),
        rename(`${ns}.parsed.protocol`, "network.transport"),
        rename(`${ns}.parsed.bytes_in`, "source.bytes"),
        rename(`${ns}.parsed.bytes_out`, "destination.bytes"),
        rename(`${ns}.parsed.action`, "event.action"),
        rename(`${ns}.parsed.rule_id`, "rule.id")
      );
      break;
    case "serverless":
    case "serverless-apps":
      procs.push(
        rename(`${ns}.parsed.function_name`, `${ns}.function_name`),
        rename(`${ns}.parsed.functionName`, `${ns}.function_name`),
        rename(`${ns}.parsed.request_id`, `${ns}.request_id`),
        rename(`${ns}.parsed.requestId`, `${ns}.request_id`),
        rename(`${ns}.parsed.cold_start`, `${ns}.cold_start`),
        rename(`${ns}.parsed.memory_used`, `${ns}.memory_used_mb`),
        rename(`${ns}.parsed.billed_duration_ms`, `${ns}.billed_duration_ms`)
      );
      break;
    case "storage":
      procs.push(
        rename(`${ns}.parsed.bucket`, `${ns}.bucket`),
        rename(`${ns}.parsed.bucket_name`, `${ns}.bucket`),
        rename(`${ns}.parsed.key`, `${ns}.object_key`),
        rename(`${ns}.parsed.object_key`, `${ns}.object_key`),
        rename(`${ns}.parsed.operation`, "event.action"),
        rename(`${ns}.parsed.bytes`, `${ns}.bytes`),
        rename(`${ns}.parsed.size`, `${ns}.bytes`)
      );
      break;
    case "streaming":
      procs.push(
        rename(`${ns}.parsed.stream_name`, `${ns}.stream_name`),
        rename(`${ns}.parsed.shard_id`, `${ns}.shard_id`),
        rename(`${ns}.parsed.records`, `${ns}.records`),
        rename(`${ns}.parsed.bytes`, `${ns}.bytes`),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.error_code`, "error.code")
      );
      break;
    case "ml":
    case "aiml":
      procs.push(
        rename(`${ns}.parsed.model_id`, `${ns}.model_id`),
        rename(`${ns}.parsed.modelId`, `${ns}.model_id`),
        rename(`${ns}.parsed.endpoint_name`, `${ns}.endpoint_name`),
        rename(`${ns}.parsed.input_tokens`, `${ns}.input_tokens`),
        rename(`${ns}.parsed.output_tokens`, `${ns}.output_tokens`),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.inference_latency_ms`, `${ns}.inference_latency_ms`)
      );
      break;
    case "iot":
      procs.push(
        rename(`${ns}.parsed.device_id`, `${ns}.device_id`),
        rename(`${ns}.parsed.deviceId`, `${ns}.device_id`),
        rename(`${ns}.parsed.clientId`, `${ns}.client_id`),
        rename(`${ns}.parsed.topic`, `${ns}.topic`),
        rename(`${ns}.parsed.action`, "event.action"),
        rename(`${ns}.parsed.protocol`, "network.protocol"),
        rename(`${ns}.parsed.payload_size`, `${ns}.payload_bytes`)
      );
      break;
    case "management":
    case "platform":
      procs.push(
        rename(`${ns}.parsed.action`, "event.action"),
        rename(`${ns}.parsed.resource_type`, `${ns}.resource_type`),
        rename(`${ns}.parsed.resource_id`, `${ns}.resource_id`),
        rename(`${ns}.parsed.stackName`, `${ns}.stack_name`),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.principal`, "user.name")
      );
      break;
    case "devtools":
      procs.push(
        rename(`${ns}.parsed.build_id`, `${ns}.build_id`),
        rename(`${ns}.parsed.buildId`, `${ns}.build_id`),
        rename(`${ns}.parsed.project`, `${ns}.project`),
        rename(`${ns}.parsed.pipeline`, `${ns}.pipeline`),
        rename(`${ns}.parsed.stage`, `${ns}.stage`),
        rename(`${ns}.parsed.phase`, `${ns}.phase`),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.state`, `${ns}.state`)
      );
      break;
    case "enduser":
      procs.push(
        rename(`${ns}.parsed.session_id`, `${ns}.session_id`),
        rename(`${ns}.parsed.sessionId`, `${ns}.session_id`),
        rename(`${ns}.parsed.user_id`, "user.id"),
        rename(`${ns}.parsed.userId`, "user.id"),
        rename(`${ns}.parsed.action`, "event.action"),
        rename(`${ns}.parsed.status`, `${ns}.status`)
      );
      break;
    case "media":
      procs.push(
        rename(`${ns}.parsed.job_id`, `${ns}.job_id`),
        rename(`${ns}.parsed.jobId`, `${ns}.job_id`),
        rename(`${ns}.parsed.channel`, `${ns}.channel`),
        rename(`${ns}.parsed.format`, `${ns}.format`),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.bitrate`, `${ns}.bitrate`)
      );
      break;
    case "containers":
      procs.push(
        rename(`${ns}.parsed.pod_name`, "kubernetes.pod.name"),
        rename(`${ns}.parsed.namespace`, "kubernetes.namespace"),
        rename(`${ns}.parsed.container_name`, "container.name"),
        rename(`${ns}.parsed.image`, "container.image.name"),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.node`, "host.name")
      );
      break;
    case "integration":
      procs.push(
        rename(`${ns}.parsed.connector_id`, `${ns}.connector_id`),
        rename(`${ns}.parsed.flow_name`, `${ns}.flow_name`),
        rename(`${ns}.parsed.status`, `${ns}.status`),
        rename(`${ns}.parsed.records`, `${ns}.records`),
        rename(`${ns}.parsed.error_code`, "error.code")
      );
      break;
  }
  return procs;
}

// ─── Error-field extraction ─────────────────────────────────────────────────

function errorExtraction(ns) {
  return [
    rename(`${ns}.parsed.errorCode`, "error.code"),
    rename(`${ns}.parsed.error_code`, "error.code"),
    rename(`${ns}.parsed.errorMessage`, "error.message"),
    rename(`${ns}.parsed.error_message`, "error.message"),
    rename(`${ns}.parsed.errorType`, "error.type"),
    rename(`${ns}.parsed.error_type`, "error.type"),
  ];
}

// ─── Master pipeline builder ────────────────────────────────────────────────

/**
 * Build a production-quality processor chain for a pipeline.
 *
 * @param {object} opts
 * @param {string} opts.cloud       - "aws" | "gcp" | "azure"
 * @param {string} opts.ns          - namespace prefix inside parsed (e.g. "glue", "gcp", "azure")
 * @param {string} opts.group       - service group (e.g. "analytics", "security")
 * @param {string} opts.pipelineId  - full pipeline id for on_failure tagging
 * @param {object[]} [opts.custom]  - optional additional processors inserted after json parse
 * @returns {{ processors: object[], on_failure: object[] }}
 */
export function buildPipeline({ cloud, ns, group, pipelineId, custom = [] }) {
  const processors = [
    // 1. JSON parse
    jsonParse(ns),

    // 2. Cloud-specific identity extraction
    ...(cloud === "azure" ? azureIdentityExtract() : []),
    ...(cloud === "gcp" ? gcpIdentityExtract() : []),

    // 3. Custom service-specific processors
    ...custom,

    // 4. Group-aware field extraction from parsed JSON
    ...groupExtraction(group, ns),

    // 5. Error field extraction
    ...errorExtraction(ns),

    // 6. Log-level normalisation
    ...logLevelNorm(ns),

    // 7. ECS normalisation (fallback values, won't override existing)
    ...ecsNorm(group),

    // 8. Outcome-driven event.type override
    ...outcomeType(),

    // 9. Duration normalisation
    ...durationNorm(ns),

    // 10. GeoIP enrichment
    ...geoip(),

    // 11. User-agent parsing
    ...userAgentParse(),

    // 12. Related-field population
    ...relatedFields(),

    // 13. Cleanup
    ...cleanup(ns),
  ];

  return { processors, on_failure: onFailure(pipelineId) };
}

// ─── Convenience for registries that define entries as { id, dataset, group, description } ──

/**
 * Return the processors + on_failure arrays for a simple pipeline entry.
 * Intended for GCP and Azure auto-generated registries.
 */
export function simpleEnhanced(cloud, ns, group, pipelineId) {
  return buildPipeline({ cloud, ns, group, pipelineId });
}
