import {
  type EcsDocument,
  rand,
  randInt,
  randFloat,
  randId,
  gcpCloud,
  makeGcpSetup,
  randLatencyMs,
  randZone,
  randBigQueryDataset,
  randBigQueryTable,
  randSeverity,
  randPrincipal,
  randOperationId,
} from "./helpers.js";

function isoPlusMs(baseIso: string, deltaMs: number): string {
  const t = Date.parse(baseIso);
  if (Number.isNaN(t)) return baseIso;
  return new Date(t + deltaMs).toISOString();
}

function eventOutcome(isErr: boolean, durationNs: number) {
  return {
    outcome: isErr ? ("failure" as const) : ("success" as const),
    duration: durationNs,
  };
}

export function generateBigQueryLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const jobId = `${project.id}:${region}.${randId(8).toLowerCase()}`;
  const jobType = rand(["QUERY", "LOAD", "EXTRACT", "COPY"] as const);
  const dataset = randBigQueryDataset();
  const table = randBigQueryTable();
  const statementType = rand(["SELECT", "INSERT", "CREATE_TABLE", "MERGE"] as const);
  const totalBytesProcessed = isErr
    ? randInt(0, 1_000_000)
    : randInt(50_000_000, 50_000_000_000_000);
  const totalBytesBilled = isErr ? 0 : Math.round(totalBytesProcessed * randFloat(0.85, 1.0));
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

  const variant = isErr
    ? rand(["job_done", "audit", "error", "reservation"] as const)
    : rand(["job_done", "audit", "query_stats", "reservation", "job_done"] as const);

  let message = "";
  let severity = randSeverity(isErr);

  const jobStatistics = {
    creationTime,
    startTime,
    endTime,
    totalBytesProcessed: String(totalBytesProcessed),
    totalBytesBilled: String(totalBytesBilled),
    totalSlotMs,
    reservationId: reservationName,
    cacheHit,
    query: {
      totalBytesProcessed: totalBytesProcessed,
      totalSlotMs,
      cacheHit,
      statementType,
      referencedTables: Array.from({ length: Math.min(referencedTablesCount, 5) }, (_, i) => ({
        projectId: project.id,
        datasetId: dataset,
        tableId: `${table}_${i}`,
      })),
      queryPlan: {
        estimatedBytesProcessed: String(Math.floor(totalBytesProcessed * 0.95)),
        stages: [
          {
            name: "S00: Output",
            waitMsAvg: randInt(1, 80),
            recordsRead: String(randInt(1e6, 1e9)),
          },
          {
            name: "S01: Aggregate",
            waitMsAvg: randInt(10, 4000),
            recordsRead: String(randInt(1e5, 1e8)),
          },
        ],
      },
      schema: { fields: [{ name: "id", type: "INTEGER" }] },
    },
    completionRatio: isErr ? randFloat(0.0, 0.4) : 1.0,
  };

  let jsonPayload: Record<string, unknown> = {};

  if (variant === "job_done") {
    severity = isErr ? "ERROR" : "INFO";
    message = isErr
      ? `bigquery.googleapis.com/projects/${project.id}/jobs/${jobId}: jobCompleted state=FAILED errorReason=invalidQuery`
      : `bigquery.googleapis.com/projects/${project.id}/jobs/${jobId}: jobCompleted jobType=${jobType} totalBytesProcessed=${totalBytesProcessed} totalSlotMs=${totalSlotMs} billingTier=${billingTier} cacheHit=${cacheHit}`;
    jsonPayload = {
      eventName: "jobCompleted",
      job: {
        jobName: `projects/${project.id}/jobs/${jobId}`,
        ...(isErr
          ? {
              status: {
                state: "DONE",
                errorResult: {
                  reason: "invalidQuery",
                  message: "Syntax error: Expected end of input but got keyword TABLE",
                },
              },
            }
          : { jobStatistics }),
      },
    };
  } else if (variant === "audit") {
    severity = "NOTICE";
    const methodName = rand([
      "jobservice.insert",
      "tabledata.list",
      "datasetservice.update",
    ] as const);
    const serviceMap: Record<string, string> = {
      "jobservice.insert": "bigquery.jobs.create",
      "tabledata.list": "bigquery.tables.getData",
      "datasetservice.update": "bigquery.datasets.update",
    };
    message = `protoPayload.methodName="${serviceMap[methodName]}" protoPayload.serviceName="bigquery.googleapis.com" resourceName="projects/${project.id}/datasets/${dataset}/tables/${table}"`;
    jsonPayload = {
      "@type": "type.googleapis.com/google.cloud.audit.AuditLog",
      authenticationInfo: { principalEmail: randPrincipal(project) },
      requestMetadata: {
        callerIp: `203.0.${randInt(1, 255)}.${randInt(1, 255)}`,
        callerSuppliedUserAgent: "google-cloud-sdk gcloud/…",
      },
      serviceName: "bigquery.googleapis.com",
      methodName,
      resourceName: `projects/${project.id}/datasets/${dataset}/tables/${table}`,
      metadata: {
        "@type": "type.googleapis.com/google.cloud.bigquery.logging.v1.AuditData",
        tableDataRead: methodName === "tabledata.list" ? { fields: ["id", "email"] } : undefined,
        jobInsertion:
          methodName === "jobservice.insert"
            ? {
                job: {
                  jobName: jobId,
                  jobConfiguration: {
                    query: {
                      query: `SELECT * FROM \`${project.id}.${dataset}.${table}\` LIMIT 1000`,
                    },
                  },
                },
              }
            : undefined,
      },
    };
  } else if (variant === "query_stats") {
    severity = "INFO";
    message = `insertId=${randId(12)} jsonPayload.job.jobStatistics.query.queryPlan.stages=${jobStatistics.query.queryPlan.stages.length} totalBytesProcessed=${totalBytesProcessed}`;
    jsonPayload = { job: { jobName: jobId, jobStatistics } };
  } else if (variant === "reservation") {
    severity = "INFO";
    message = rand([
      `bigqueryreservation.googleapis.com/${reservationName}: slot_capacity=${randInt(100, 4000)} slot_utilization=${randFloat(0.2, 0.95).toFixed(3)}`,
      `bigqueryreservation.googleapis.com/${reservationName}: commitment plan FLEX updated slot_ms=${totalSlotMs}`,
    ]);
    jsonPayload = {
      eventName: "reservationUtilization",
      reservation: {
        name: reservationName,
        slotCapacity: randInt(100, 4000),
        slotUtilization: randFloat(0.1, 0.99),
      },
    };
  } else {
    severity = "ERROR";
    message = rand([
      `Error: 403 Access Denied: BigQuery BigQuery: Permission denied while getting Drive credentials. Job ID: ${jobId}`,
      `Not found: Table ${project.id}:${dataset}.${table}_missing was not found in location ${region}`,
      `Resources exceeded during query execution: The query could not be completed in the allotted memory. Job ID: ${jobId}`,
    ]);
    jsonPayload = {
      eventName: "jobCompleted",
      job: {
        jobName: `projects/${project.id}/jobs/${jobId}`,
        status: {
          errorResult: { reason: "invalidQuery", message: "Query exceeded limit for bytes billed" },
        },
      },
    };
  }

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: {
      dataset_id: dataset,
      table_id: table,
      job_id: jobId,
    },
    jsonPayload,
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
        total_bytes_billed: totalBytesBilled,
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
        completion_ratio: jobStatistics.completionRatio,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr && variant !== "audit") {
    doc.error = {
      type: "BigQueryError",
      message: "Job failed — resource limits or access denied",
    };
  }

  return doc;
}

export function generateDataprocLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const zone = randZone(region);
  const clusterName = rand(["etl-cluster", "spark-analytics", "adhoc-research", "ml-prep"]);
  const clusterUuid = randId(8).toLowerCase();
  const jobId = `job-${randId(10).toLowerCase()}`;
  const jobType = rand(["spark", "hive", "pig"] as const);
  const durationNs = randLatencyMs(120_000, isErr) * 1e6;
  const variant = isErr
    ? rand(["cluster", "spark", "yarn", "audit", "error"] as const)
    : rand(["cluster", "spark", "yarn", "audit", "spark"] as const);

  let message = "";
  let severity = randSeverity(isErr);

  if (variant === "cluster") {
    message = isErr
      ? `dataproc.googleapis.com/projects/${project.id}/regions/${region}/clusters/${clusterName}: Cluster error state ERROR diagnostics=master unreachable`
      : rand([
          `dataproc.googleapis.com/.../clusters/${clusterName}: Cluster created uuid=${clusterUuid}`,
          `Cluster ${clusterName} starting provisioning workers in ${zone}`,
        ]);
    severity = isErr ? "ERROR" : "INFO";
  } else if (variant === "spark") {
    message = isErr
      ? `org.apache.spark.SparkException: Job aborted due to stage failure: Task ${randInt(0, 199)} in stage ${randInt(0, 20)}.${randInt(0, 5)} failed 4 times`
      : rand([
          `INFO org.apache.spark.SparkContext: Running Spark version 3.5.1`,
          `INFO TaskSetManager: Finished task ${randInt(0, 500)}.0 in stage ${randInt(1, 40)}.0 (${randInt(100, 800)} ms)`,
        ]);
    severity = isErr ? "ERROR" : "INFO";
  } else if (variant === "yarn") {
    message = isErr
      ? `org.apache.hadoop.yarn.exceptions.YarnException: Failed to allocate container — RM rejected appattempt_${randId(6)}`
      : `INFO org.apache.hadoop.yarn.server.resourcemanager.RMAuditLogger: USER=${randPrincipal(project)} OPERATION=Allocated Container APPID=application_${randInt(1000000, 9999999)}`;
    severity = isErr ? "ERROR" : "INFO";
  } else if (variant === "audit") {
    const method = rand(["dataproc.clusters.create", "dataproc.jobs.submit"] as const);
    message = `protoPayload.methodName="${method}" resourceName="projects/${project.id}/regions/${region}/clusters/${clusterName}" operation.id=${randOperationId()}`;
    severity = "NOTICE";
  } else {
    message = `dataproc job ${jobId} (${jobType}) on ${clusterName}: shuffle service io.grpc.StatusRuntimeException: UNAVAILABLE`;
    severity = "ERROR";
  }

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { cluster_name: clusterName, cluster_uuid: clusterUuid },
    cloud: gcpCloud(region, project, "dataproc"),
    gcp: {
      dataproc: {
        cluster_name: clusterName,
        cluster_uuid: clusterUuid,
        job_id: jobId,
        job_type: jobType,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = { type: "JobFailed", message: "Spark driver exited with non-zero status" };
  }

  return doc;
}

export function generateDataFusionLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instanceName = rand(["df-prod-1", "df-staging", "pipeline-hub"]);
  const pipelineName = rand(["ingest-users", "cdc-orders", "flatten-events"]);
  const namespace = rand(["default", "production", "data-engineering"]);
  const status = isErr ? "FAILED" : rand(["STARTING", "RUNNING", "SUCCEEDED"] as const);
  const pluginType = rand(["source", "transform", "sink"]);
  const recordsIn = isErr ? randInt(0, 500) : randInt(10_000, 50_000_000);
  const recordsOut = isErr ? randInt(0, 100) : Math.round(recordsIn * randFloat(0.92, 1.0));
  const durationNs = randLatencyMs(3000, isErr) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `datafusion.googleapis.com/${instanceName}/pipelines/${pipelineName}: Run ${status} — ${pluginType} stage IllegalArgumentException`
    : `datafusion.googleapis.com/${instanceName}: pipelineRun namespace=${namespace} pipeline=${pipelineName} status=${status} recordsOut=${recordsOut}`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { instance_name: instanceName, namespace },
    cloud: gcpCloud(region, project, "data-fusion"),
    gcp: {
      data_fusion: {
        instance_name: instanceName,
        pipeline_name: pipelineName,
        namespace,
        status,
        plugin_type: pluginType,
        records_in: recordsIn,
        records_out: recordsOut,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = {
      type: "PipelineFailure",
      message: `Stage using ${pluginType} plugin threw unhandled exception`,
    };
  }

  return doc;
}

export function generateComposerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const environmentName = rand(["composer-prod", "composer-data", "composer-dev"]);
  const dagId = rand(["daily_etl", "hourly_sync", "ml_feature_refresh"]);
  const taskId = rand(["extract", "transform_load", "validate", "notify_slack"]);
  const executionDate = new Date(Date.now() - randInt(0, 86400_000))
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
  const state = isErr ? "failed" : rand(["running", "success", "up_for_retry"] as const);
  const tryNumber = isErr ? randInt(2, 5) : randInt(1, 2);
  const operator = rand([
    "BashOperator",
    "PythonOperator",
    "BigQueryInsertJobOperator",
    "KubernetesPodOperator",
  ] as const);
  const durationSeconds = isErr ? randInt(5, 120) : randInt(30, 3600);
  const durationNs = durationSeconds * 1e9;
  const severity =
    isErr || state === "failed" ? "ERROR" : state === "up_for_retry" ? "WARNING" : "INFO";
  const message = isErr
    ? `[${ts}] {composer.googleapis.com} ERROR - Task failed: ${dagId}.${taskId} try=${tryNumber} operator=${operator}`
    : `[${ts}] {${environmentName}} INFO - Marking task as ${state}: ${dagId}.${taskId} duration=${durationSeconds}s`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { environment_name: environmentName, dag_id: dagId },
    cloud: gcpCloud(region, project, "composer"),
    gcp: {
      composer: {
        environment_name: environmentName,
        dag_id: dagId,
        task_id: taskId,
        execution_date: executionDate,
        state,
        try_number: tryNumber,
        operator,
        duration_seconds: durationSeconds,
      },
    },
    event: {
      outcome: state === "failed" || isErr ? "failure" : "success",
      duration: durationNs,
    },
    message,
  };

  if (isErr) {
    doc.error = {
      type: "TaskFailed",
      message: `Operator ${operator} exited with non-zero code`,
    };
  }

  return doc;
}

export function generateLookerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instanceName = rand(["globex.cloud.looker.com", "analytics.globex.looker.app"]);
  const queryId = `query_${randId(12)}`;
  const model = rand(["sales", "marketing", "operations", "finance"]);
  const explore = rand(["orders", "users", "campaigns", "inventory"]);
  const userEmail = rand(["analyst@globex.example.com", "exec@globex.example.com"]);
  const status = isErr ? "error" : rand(["complete", "killed"] as const);
  const queryRuntimeSeconds = isErr ? randFloat(0.5, 30) : randFloat(0.1, 45);
  const rowsReturned = isErr ? 0 : randInt(1, 500_000);
  const cacheHit = !isErr && Math.random() > 0.55;
  const sqlQueryTruncated = !isErr && rowsReturned > 100_000;
  const durationNs = Math.round(queryRuntimeSeconds * 1000) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `looker: query_id=${queryId} model=${model} explore=${explore} user=${userEmail} status=error warehouse_error="BigQuery job exceeded maximum bytes billed"`
    : `looker: query_id=${queryId} explore=${explore} status=complete rows=${rowsReturned} cache_hit=${cacheHit} runtime_s=${queryRuntimeSeconds.toFixed(3)}`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { instance: instanceName, model },
    cloud: gcpCloud(region, project, "looker"),
    gcp: {
      looker: {
        instance_name: instanceName,
        query_id: queryId,
        model,
        explore,
        user_email: userEmail,
        status,
        query_runtime_seconds: Math.round(queryRuntimeSeconds * 1000) / 1000,
        rows_returned: rowsReturned,
        cache_hit: cacheHit,
        sql_query_truncated: sqlQueryTruncated,
      },
    },
    event: {
      outcome: status === "complete" && !isErr ? "success" : "failure",
      duration: durationNs,
    },
    message,
  };

  if (isErr) {
    doc.error = { type: "QueryError", message: "BigQuery job exceeded maximum bytes billed" };
  }

  return doc;
}

export function generateDataplexLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const lakeName = rand(["bronze-lake", "silver-lake", "curated-lake"]);
  const zoneName = rand(["raw", "trusted", "restricted"]);
  const assetName = rand(["bq-orders", "gcs-clickstream", "pubsub-events"]);
  const actionType = rand(["DISCOVER", "PROFILE", "QUALITY", "LIFECYCLE"] as const);
  const status = isErr ? "FAILED" : rand(["SUCCEEDED", "RUNNING"] as const);
  const discoveredEntities = isErr ? randInt(0, 5) : randInt(12, 5000);
  const qualityScorePct = isErr ? randFloat(0, 40) : randFloat(85, 100);
  const durationNs = randLatencyMs(6000, isErr) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `dataplex.googleapis.com/lakes/${lakeName}/zones/${zoneName}/assets/${assetName}: ${actionType} ${status} — profiling worker PERMISSION_DENIED`
    : `dataplex.googleapis.com/lakes/${lakeName}: ${actionType} task completed entities=${discoveredEntities} qualityScorePct=${qualityScorePct.toFixed(1)}`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { lake: lakeName, zone: zoneName },
    cloud: gcpCloud(region, project, "dataplex"),
    gcp: {
      dataplex: {
        lake_name: lakeName,
        zone_name: zoneName,
        asset_name: assetName,
        action_type: actionType,
        status,
        discovered_entities: discoveredEntities,
        quality_score_pct: Math.round(qualityScorePct * 10) / 10,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = {
      type: "JobFailed",
      message: "Data profiling worker could not read underlying BigQuery table",
    };
  }

  return doc;
}

export function generateDataCatalogLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const entryGroup = rand(["@bigquery", "@gcs", "governance"]);
  const entryName = `projects/${project.id}/locations/${region}/entryGroups/${entryGroup}/entries/${randId(10)}`;
  const resourceType = rand(["TABLE", "DATASET", "TOPIC", "VIEW"] as const);
  const action = rand(["SearchCatalog", "CreateTag", "LookupEntry", "CreateEntryGroup"] as const);
  const tagTemplate = rand(["pii_classification", "data_owner", "retention_policy"]);
  const searchResultsCount = action === "SearchCatalog" ? (isErr ? 0 : randInt(1, 500)) : 0;
  const durationNs = randLatencyMs(90, isErr) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `datacatalog.googleapis.com: ${action} on ${entryName} FAILED 7 PERMISSION_DENIED: Missing datacatalog.entries.get`
    : `datacatalog.googleapis.com: ${action} entryGroup=${entryGroup} tagTemplate=${tagTemplate} results=${searchResultsCount}`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { entry_group: entryGroup },
    cloud: gcpCloud(region, project, "data-catalog"),
    gcp: {
      data_catalog: {
        entry_group: entryGroup,
        entry_name: entryName,
        resource_type: resourceType,
        action,
        tag_template: tagTemplate,
        search_results_count: searchResultsCount,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = { type: "PermissionDenied", message: "Missing datacatalog.entries.get permission" };
  }

  return doc;
}

export function generateAnalyticsHubLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const exchangeName = `projects/${project.id}/locations/${region}/dataExchanges/${rand(["globex_share", "partner_feed"])}`;
  const listingName = `${exchangeName}/listings/${rand(["orders_daily", "customer_360"])}`;
  const action = rand(["SUBSCRIBE", "LIST", "GET", "CREATE_LISTING"] as const);
  const subscriberProject = rand(["subscriber-prod-aa", "analytics-partner-bb"]);
  const datasetShared = `${subscriberProject}.${randBigQueryDataset()}`;
  const sharedResourceType = "BIGQUERY_DATASET";
  const durationNs = randLatencyMs(250, isErr) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `analyticshub.googleapis.com: ${action} ${listingName} FAILED — subscriber linked dataset quota exceeded`
    : `analyticshub.googleapis.com: ${action} listing=${listingName} linkedDataset=${datasetShared} resourceType=${sharedResourceType}`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { exchange: exchangeName.split("/").pop() ?? "exchange" },
    cloud: gcpCloud(region, project, "analytics-hub"),
    gcp: {
      analytics_hub: {
        exchange_name: exchangeName,
        listing_name: listingName,
        action,
        subscriber_project: subscriberProject,
        dataset_shared: datasetShared,
        shared_resource_type: sharedResourceType,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = {
      type: "ResourceExhausted",
      message: "Subscriber project exceeded Analytics Hub listing subscriptions",
    };
  }

  return doc;
}

export function generateDataprepLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const flowName = rand(["clean_user_events", "standardize_orders", "dedupe_leads"]);
  const jobId = `wrangle-${randId(8)}`;
  const recipeSteps = randInt(5, 40);
  const inputRows = isErr ? randInt(1000, 50_000) : randInt(100_000, 20_000_000);
  const outputRows = isErr
    ? randInt(0, Math.min(500, inputRows))
    : Math.round(inputRows * randFloat(0.95, 1.0));
  const status = isErr ? "Failed" : rand(["Completed", "Running", "Completed"] as const);
  const dataSource = rand(["BigQuery", "GCS", "Datastore"]);
  const profileColumnsCount = isErr ? randInt(0, 3) : randInt(8, 200);
  const durationNs = randLatencyMs(4000, isErr) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `dataprep.googleapis.com/jobs/${jobId}: flow=${flowName} status=${status} step=${randInt(1, recipeSteps)} Type mismatch casting to TIMESTAMP`
    : `dataprep.googleapis.com/jobs/${jobId}: flow=${flowName} status=${status} outputRows=${outputRows} source=${dataSource} recipeSteps=${recipeSteps}`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { flow_name: flowName, job_id: jobId },
    cloud: gcpCloud(region, project, "dataprep"),
    gcp: {
      dataprep: {
        flow_name: flowName,
        job_id: jobId,
        recipe_steps: recipeSteps,
        input_rows: inputRows,
        output_rows: outputRows,
        status,
        data_source: dataSource,
        profile_columns_count: profileColumnsCount,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = {
      type: "TransformError",
      message: "Column cast to TIMESTAMP failed on non-parseable values",
    };
  }

  return doc;
}

export function generateDatastreamLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const streamName = `projects/${project.id}/locations/${region}/streams/${rand(["mysql-cdc", "oracle-warehouse", "postgres-oltp"])}`;
  const sourceType = rand(["MYSQL", "POSTGRESQL", "ORACLE"] as const);
  const destinationType = rand(["BIGQUERY", "CLOUD_STORAGE"] as const);
  const status = isErr ? "FAILED" : rand(["RUNNING", "PAUSED"] as const);
  const throughputKbps = isErr ? randInt(0, 50) : randInt(200, 120_000);
  const eventsStreamed = isErr ? randInt(0, 500) : randInt(10_000, 50_000_000);
  const lagSeconds = isErr ? randInt(300, 7200) : randInt(0, 45);
  const durationNs = randLatencyMs(1000, isErr) * 1e6;
  const severity = randSeverity(isErr);
  const message = isErr
    ? `datastream.googleapis.com/${streamName}: status=${status} replication_lag_s=${lagSeconds} mysql_binlog_read_error="Connection reset by peer"`
    : `datastream.googleapis.com/${streamName}: status=${status} throughput_kbps=${throughputKbps} events_streamed=${eventsStreamed} lag_s=${lagSeconds} ${sourceType}->${destinationType}`;

  const doc: EcsDocument = {
    "@timestamp": ts,
    severity,
    labels: { stream: streamName.split("/").pop() ?? "stream" },
    cloud: gcpCloud(region, project, "datastream"),
    gcp: {
      datastream: {
        stream_name: streamName,
        source_type: sourceType,
        destination_type: destinationType,
        status,
        throughput_kbps: throughputKbps,
        events_streamed: eventsStreamed,
        lag_seconds: lagSeconds,
      },
    },
    event: eventOutcome(isErr, durationNs),
    message,
  };

  if (isErr) {
    doc.error = {
      type: "ReplicationError",
      message: "Unable to read binary log position; connection reset by peer",
    };
  }

  return doc;
}
