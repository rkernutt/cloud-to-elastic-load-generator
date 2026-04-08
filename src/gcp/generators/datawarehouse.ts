import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  gcpCloud,
  makeGcpSetup,
  randBigQueryDataset,
  randBigQueryTable,
} from "./helpers.js";

function isoPlusMs(baseIso: string, deltaMs: number): string {
  const t = Date.parse(baseIso);
  if (Number.isNaN(t)) return baseIso;
  return new Date(t + deltaMs).toISOString();
}

export function generateBigQueryLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobId = `${project.id}:${rand(["us", "eu"])}.${randId(8).toLowerCase()}`;
  const jobType = rand(["QUERY", "LOAD", "EXTRACT", "COPY"] as const);
  const dataset = randBigQueryDataset();
  const table = randBigQueryTable();
  const statementType = rand(["SELECT", "INSERT", "CREATE_TABLE", "MERGE"] as const);
  const totalBytesProcessed = isErr
    ? randInt(0, 1_000_000)
    : randInt(50_000_000, 50_000_000_000_000);
  const totalSlotMs = isErr ? randInt(0, 5000) : randInt(50_000, 900_000_000);
  const billingTier = rand(["STANDARD", "ENTERPRISE_PLUS"] as const);
  const cacheHit = !isErr && Math.random() > 0.55;
  const referencedTablesCount = randInt(1, 48);
  const outputRows = isErr ? randInt(0, 10) : randInt(100, 500_000_000);
  const endTime = ts;
  const startOffsetMs = -randInt(200, 900_000);
  const startTime = isoPlusMs(ts, startOffsetMs);
  const creationTime = isoPlusMs(startTime, -randInt(50, 5000));
  const priority = rand(["INTERACTIVE", "BATCH"] as const);
  const reservationName = `projects/${project.id}/locations/${region}/reservations/${rand(["prod-warehouse", "adhoc", "etl-pool"])}-${randId(4).toLowerCase()}`;
  const durationMs = Math.max(1, -startOffsetMs);
  const durationNs = durationMs * 1e6;

  const message = isErr
    ? `BigQuery job ${jobId} ${jobType} ${statementType} failed — bytes_processed=${totalBytesProcessed} quota or syntax error`
    : `BigQuery job ${jobId} ${jobType} ${statementType} OK rows=${outputRows} bytes=${totalBytesProcessed} cache=${cacheHit ? "hit" : "miss"}`;

  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "bigquery"),
    gcp: {
      bigquery: {
        job_id: jobId,
        job_type: jobType,
        project: project.id,
        dataset,
        table,
        statement_type: statementType,
        total_bytes_processed: totalBytesProcessed,
        total_slot_ms: totalSlotMs,
        billing_tier: billingTier,
        cache_hit: cacheHit,
        referenced_tables_count: referencedTablesCount,
        output_rows: outputRows,
        creation_time: creationTime,
        start_time: startTime,
        end_time: endTime,
        priority,
        reservation_name: reservationName,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message,
  };
}
