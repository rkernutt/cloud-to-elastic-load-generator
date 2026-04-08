import {
  type EcsDocument,
  rand,
  randInt,
  randId,
  randFloat,
  gcpCloud,
  makeGcpSetup,
  randLatencyMs,
  randZone,
  randBigQueryDataset,
} from "./helpers.js";

export function generateDataprocLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const zone = randZone(region);
  const clusterName = rand(["etl-cluster", "spark-analytics", "adhoc-research", "ml-prep"]);
  const clusterUuid = randId(8).toLowerCase();
  const jobId = `job-${randId(10).toLowerCase()}`;
  const jobType = rand(["SPARK", "HADOOP", "HIVE", "PIG", "PRESTO"]);
  const status = isErr ? "ERROR" : rand(["PENDING", "RUNNING", "DONE"]);
  const masterMachineType = rand(["n1-standard-4", "n2-highmem-8", "e2-standard-8"]);
  const workerCount = isErr ? randInt(0, 2) : randInt(3, 50);
  const autoscalingEvent = !isErr && Math.random() > 0.75;
  const durationNs = randLatencyMs(120_000, isErr) * 1e6;
  return {
    "@timestamp": ts,
    cloud: gcpCloud(region, project, "dataproc"),
    gcp: {
      dataproc: {
        cluster_name: clusterName,
        cluster_uuid: clusterUuid,
        job_id: jobId,
        job_type: jobType,
        status,
        master_machine_type: masterMachineType,
        worker_count: workerCount,
        zone,
        autoscaling_event: autoscalingEvent,
      },
    },
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Dataproc ${jobType} job ${jobId} on ${clusterName} failed in ${zone}: YARN rejected containers`
      : `Dataproc cluster ${clusterName}: ${jobType} job ${jobId} ${status}${autoscalingEvent ? " (autoscaled)" : ""}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "JobFailed",
            message: "Spark driver exited with non-zero status",
          },
        }
      : {}),
  };
}

export function generateDataFusionLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instanceName = rand(["df-prod-1", "df-staging", "pipeline-hub"]);
  const pipelineName = rand(["ingest-users", "cdc-orders", "flatten-events"]);
  const namespace = rand(["default", "production", "data-engineering"]);
  const status = isErr ? "FAILED" : rand(["STARTING", "RUNNING", "SUCCEEDED"]);
  const pluginType = rand(["source", "transform", "sink"]);
  const recordsIn = isErr ? randInt(0, 500) : randInt(10_000, 50_000_000);
  const recordsOut = isErr ? randInt(0, 100) : Math.round(recordsIn * randFloat(0.92, 1.0));
  const durationNs = randLatencyMs(3000, isErr) * 1e6;
  return {
    "@timestamp": ts,
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
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Data Fusion pipeline ${pipelineName} failed on ${instanceName}: ${pluginType} plugin error`
      : `Data Fusion ${pipelineName} (${namespace}): ${status} — ${recordsOut.toLocaleString()} records out`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "PipelineFailure",
            message: `Stage using ${pluginType} plugin threw unhandled exception`,
          },
        }
      : {}),
  };
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
  const state = isErr ? "failed" : rand(["running", "success", "up_for_retry"]);
  const tryNumber = isErr ? randInt(2, 5) : randInt(1, 2);
  const operator = rand([
    "BashOperator",
    "PythonOperator",
    "BigQueryInsertJobOperator",
    "KubernetesPodOperator",
  ]);
  const durationSeconds = isErr ? randInt(5, 120) : randInt(30, 3600);
  const durationNs = durationSeconds * 1e9;
  return {
    "@timestamp": ts,
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
      outcome: state === "success" && !isErr ? "success" : "failure",
      duration: durationNs,
    },
    message: isErr
      ? `Airflow task ${dagId}.${taskId} failed (try ${tryNumber}/${operator}) in ${environmentName}`
      : `Composer ${environmentName}: ${dagId}.${taskId} ${state} in ${durationSeconds}s`,
    log: { level: isErr || state === "failed" ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "TaskFailed",
            message: `Operator ${operator} exited with non-zero code`,
          },
        }
      : {}),
  };
}

export function generateLookerLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const instanceName = rand(["globex.cloud.looker.com", "analytics.globex.looker.app"]);
  const queryId = `query_${randId(12)}`;
  const model = rand(["sales", "marketing", "operations", "finance"]);
  const explore = rand(["orders", "users", "campaigns", "inventory"]);
  const userEmail = rand(["analyst@globex.example.com", "exec@globex.example.com"]);
  const status = isErr ? "error" : rand(["complete", "killed"]);
  const queryRuntimeSeconds = isErr ? randFloat(0.5, 30) : randFloat(0.1, 45);
  const rowsReturned = isErr ? 0 : randInt(1, 500_000);
  const cacheHit = !isErr && Math.random() > 0.55;
  const sqlQueryTruncated = !isErr && rowsReturned > 100_000;
  const durationNs = Math.round(queryRuntimeSeconds * 1000) * 1e6;
  return {
    "@timestamp": ts,
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
    message: isErr
      ? `Looker query ${queryId} on ${model}/${explore} failed for ${userEmail}: warehouse timeout`
      : `Looker ${userEmail}: ${explore} query ${cacheHit ? "(cache hit)" : ""} returned ${rowsReturned} rows`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "QueryError",
            message: "BigQuery job exceeded maximum bytes billed",
          },
        }
      : {}),
  };
}

export function generateDataplexLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const lakeName = rand(["bronze-lake", "silver-lake", "curated-lake"]);
  const zoneName = rand(["raw", "trusted", "restricted"]);
  const assetName = rand(["bq-orders", "gcs-clickstream", "pubsub-events"]);
  const actionType = rand(["DISCOVER", "PROFILE", "QUALITY", "LIFECYCLE"]);
  const status = isErr ? "FAILED" : rand(["SUCCEEDED", "RUNNING"]);
  const discoveredEntities = isErr ? randInt(0, 5) : randInt(12, 5000);
  const qualityScorePct = isErr ? randFloat(0, 40) : randFloat(85, 100);
  const durationNs = randLatencyMs(6000, isErr) * 1e6;
  return {
    "@timestamp": ts,
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
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Dataplex ${actionType} job failed for asset ${assetName} in ${lakeName}/${zoneName}`
      : `Dataplex ${actionType}: ${discoveredEntities} entities in ${lakeName}, quality ${qualityScorePct.toFixed(1)}%`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "JobFailed",
            message: "Data profiling worker could not read underlying BigQuery table",
          },
        }
      : {}),
  };
}

export function generateDataCatalogLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const entryGroup = rand(["@bigquery", "@gcs", "governance"]);
  const entryName = `projects/${project.id}/locations/${region}/entryGroups/${entryGroup}/entries/${randId(10)}`;
  const resourceType = rand(["TABLE", "DATASET", "TOPIC", "VIEW"]);
  const action = rand(["SearchCatalog", "CreateTag", "LookupEntry", "CreateEntryGroup"]);
  const tagTemplate = rand(["pii_classification", "data_owner", "retention_policy"]);
  const searchResultsCount = action === "SearchCatalog" ? (isErr ? 0 : randInt(1, 500)) : 0;
  const durationNs = randLatencyMs(90, isErr) * 1e6;
  return {
    "@timestamp": ts,
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
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Data Catalog ${action} failed for ${entryName}: permission denied on entry group`
      : action === "SearchCatalog"
        ? `Data Catalog search returned ${searchResultsCount} entries (${resourceType})`
        : `Data Catalog ${action} on ${entryGroup} (${tagTemplate})`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "PermissionDenied",
            message: "Missing datacatalog.entries.get permission",
          },
        }
      : {}),
  };
}

export function generateAnalyticsHubLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const exchangeName = `projects/${project.id}/locations/${region}/dataExchanges/${rand(["globex_share", "partner_feed"])}`;
  const listingName = `${exchangeName}/listings/${rand(["orders_daily", "customer_360"])}`;
  const action = rand(["SUBSCRIBE", "LIST", "GET", "CREATE_LISTING"]);
  const subscriberProject = rand(["subscriber-prod-aa", "analytics-partner-bb"]);
  const datasetShared = `${subscriberProject}.${randBigQueryDataset()}`;
  const sharedResourceType = "BIGQUERY_DATASET";
  const durationNs = randLatencyMs(250, isErr) * 1e6;
  return {
    "@timestamp": ts,
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
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Analytics Hub ${action} failed for ${listingName}: subscriber lacks linked dataset quota`
      : `Analytics Hub ${action}: ${sharedResourceType} linked as ${datasetShared}`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "ResourceExhausted",
            message: "Subscriber project exceeded Analytics Hub listing subscriptions",
          },
        }
      : {}),
  };
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
  const status = isErr ? "Failed" : rand(["Completed", "Running", "Completed"]);
  const dataSource = rand(["BigQuery", "GCS", "Datastore"]);
  const profileColumnsCount = isErr ? randInt(0, 3) : randInt(8, 200);
  const durationNs = randLatencyMs(4000, isErr) * 1e6;
  return {
    "@timestamp": ts,
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
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Dataprep job ${jobId} on flow ${flowName} failed at step ${randInt(1, recipeSteps)}: type mismatch`
      : `Dataprep ${flowName}: ${outputRows.toLocaleString()} output rows from ${dataSource} (${recipeSteps} steps)`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "TransformError",
            message: "Column cast to TIMESTAMP failed on non-parseable values",
          },
        }
      : {}),
  };
}

export function generateDatastreamLog(ts: string, er: number): EcsDocument {
  const { region, project, isErr } = makeGcpSetup(er);
  const streamName = `projects/${project.id}/locations/${region}/streams/${rand(["mysql-cdc", "oracle-warehouse", "postgres-oltp"])}`;
  const sourceType = rand(["MYSQL", "POSTGRESQL", "ORACLE"]);
  const destinationType = rand(["BIGQUERY", "CLOUD_STORAGE"]);
  const status = isErr ? "FAILED" : rand(["RUNNING", "PAUSED"]);
  const throughputKbps = isErr ? randInt(0, 50) : randInt(200, 120_000);
  const eventsStreamed = isErr ? randInt(0, 500) : randInt(10_000, 50_000_000);
  const lagSeconds = isErr ? randInt(300, 7200) : randInt(0, 45);
  const durationNs = randLatencyMs(1000, isErr) * 1e6;
  return {
    "@timestamp": ts,
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
    event: {
      outcome: isErr ? "failure" : "success",
      duration: durationNs,
    },
    message: isErr
      ? `Datastream ${streamName} error: replication lag ${lagSeconds}s (${sourceType} → ${destinationType})`
      : `Datastream ${sourceType}→${destinationType}: ${(throughputKbps / 1024).toFixed(2)} MB/s, lag ${lagSeconds}s`,
    log: { level: isErr ? "error" : "info" },
    ...(isErr
      ? {
          error: {
            type: "ReplicationError",
            message: "Unable to read binary log position; connection reset by peer",
          },
        }
      : {}),
  };
}
