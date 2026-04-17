import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

function metric(uid, x, y, col, query) {
  return {
    type: "lens",
    uid,
    grid: { x, y, w: 12, h: 5 },
    config: {
      title: "",
      attributes: {
        type: "metric",
        dataset: { type: "esql", query },
        metrics: [{ type: "primary", operation: "value", column: col }],
      },
    },
  };
}

function donut(uid, x, title, query, metricCol, groupCol) {
  return {
    type: "lens",
    uid,
    grid: { x, y: 5, w: 16, h: 10 },
    config: {
      title,
      attributes: {
        type: "donut",
        dataset: { type: "esql", query },
        metrics: [{ operation: "value", column: metricCol }],
        group_by: [{ operation: "value", column: groupCol }],
      },
    },
  };
}

function xyLine(uid, x, y, w, title, query, xCol, yCols) {
  return {
    type: "lens",
    uid,
    grid: { x, y, w, h: 10 },
    config: {
      title,
      attributes: {
        type: "xy",
        axis: {
          x: { title: { visible: false } },
          left: { title: { visible: false } },
        },
        layers: [
          {
            type: "line",
            dataset: { type: "esql", query },
            x: { operation: "value", column: xCol },
            y: yCols.map(({ col, label }) => ({ operation: "value", column: col, label })),
          },
        ],
      },
    },
  };
}

function xyBarH(uid, x, y, title, query, xCol, yCol, yLabel) {
  return {
    type: "lens",
    uid,
    grid: { x, y, w: 24, h: 10 },
    config: {
      title,
      attributes: {
        type: "xy",
        axis: {
          x: { title: { visible: false } },
          left: { title: { visible: false } },
        },
        layers: [
          {
            type: "bar_horizontal",
            dataset: { type: "esql", query },
            x: { operation: "value", column: xCol },
            y: [{ operation: "value", column: yCol, label: yLabel }],
          },
        ],
      },
    },
  };
}

function dataTable(uid, y, title, query, columns) {
  return {
    type: "lens",
    uid,
    grid: { x: 0, y, w: 48, h: 12 },
    config: {
      title,
      attributes: {
        type: "datatable",
        dataset: { type: "esql", query },
        metrics: columns.map(({ col, label }) => ({ operation: "value", column: col, label })),
        rows: [],
      },
    },
  };
}

function dash(title, panels) {
  return JSON.stringify({ title, time_range: { from: "now-24h", to: "now" }, panels }, null, 2);
}

const BUCKET = "BUCKET(`@timestamp`, 75, ?_tstart, ?_tend)";

const aws = [];

// --- ALB ---
aws.push([
  "installer/aws-custom-dashboards/alb-dashboard.json",
  dash("AWS Application Load Balancer — HTTP Performance", [
    metric(
      "alb-k1",
      0,
      0,
      "Requests",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS Requests = COUNT()`
    ),
    metric(
      "alb-k2",
      12,
      0,
      "5xx %",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | EVAL s5 = CASE(\`http.response.status_code\` >= 500, 1, 0) | STATS m = AVG(s5) | EVAL \`5xx %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "alb-k3",
      24,
      0,
      "Avg latency (ms)",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS a = AVG(event.duration) | EVAL \`Avg latency (ms)\` = ROUND(a / 1000000.0, 1)`
    ),
    metric(
      "alb-k4",
      36,
      0,
      "Bytes out",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS \`Bytes out\` = SUM(\`http.response.bytes\`)`
    ),
    donut(
      "alb-d1",
      0,
      "HTTP status",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS c = COUNT() BY st = \`http.response.status_code\` | SORT c DESC | LIMIT 10`,
      "c",
      "st"
    ),
    donut(
      "alb-d2",
      16,
      "Top load balancers",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS c = COUNT() BY lb = \`aws.elb.name\` | SORT c DESC | LIMIT 10`,
      "c",
      "lb"
    ),
    donut(
      "alb-d3",
      32,
      "Outcome",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS c = COUNT() BY o = event.outcome`,
      "c",
      "o"
    ),
    xyLine(
      "alb-l1",
      0,
      15,
      48,
      "Request volume",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "alb-l2",
      0,
      25,
      24,
      "5xx and 4xx over time",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS c5 = SUM(CASE(\`http.response.status_code\` >= 500, 1, 0)), c4 = SUM(CASE(\`http.response.status_code\` >= 400 AND \`http.response.status_code\` < 500, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "c5", label: "5xx" },
        { col: "c4", label: "4xx" },
      ]
    ),
    xyLine(
      "alb-l3",
      24,
      25,
      24,
      "Avg response time (ms)",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS avg_ms = AVG(\`aws.elb.backend_processing_time.sec\` + \`aws.elb.request_processing_time.sec\` + \`aws.elb.response_processing_time.sec\`) * 1000 BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "avg_ms", label: "Avg proc (ms)" }]
    ),
    xyBarH(
      "alb-b1",
      0,
      35,
      "Top target groups",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | STATS c = COUNT() BY tg = \`aws.elb.target_group.arn\` | SORT c DESC | LIMIT 10`,
      "tg",
      "c",
      "Requests"
    ),
    dataTable(
      "alb-t1",
      45,
      "Recent access",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "alb" | KEEP \`@timestamp\`, \`aws.elb.name\`, \`http.request.method\`, \`http.response.status_code\`, event.outcome, \`client.ip\`, \`aws.elb.trace_id\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.elb.name", label: "ALB" },
        { col: "http.request.method", label: "Method" },
        { col: "http.response.status_code", label: "Status" },
        { col: "event.outcome", label: "Outcome" },
        { col: "client.ip", label: "Client IP" },
        { col: "aws.elb.trace_id", label: "Trace" },
      ]
    ),
  ]),
]);

// --- API Gateway ---
aws.push([
  "installer/aws-custom-dashboards/apigateway-dashboard.json",
  dash("AWS API Gateway — Requests & Latency", [
    metric(
      "apigw-k1",
      0,
      0,
      "Requests",
      `FROM logs-aws.apigateway_logs* | STATS \`Requests\` = COUNT()`
    ),
    metric(
      "apigw-k2",
      12,
      0,
      "5xx %",
      `FROM logs-aws.apigateway_logs* | EVAL s5 = CASE(\`aws.apigateway.status\` >= 500, 1, 0) | STATS m = AVG(s5) | EVAL \`5xx %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "apigw-k3",
      24,
      0,
      "Avg latency (ms)",
      `FROM logs-aws.apigateway_logs* | STATS a = AVG(event.duration) | EVAL \`Avg latency (ms)\` = ROUND(a / 1000000.0, 1)`
    ),
    metric(
      "apigw-k4",
      36,
      0,
      "Avg integration (ms)",
      `FROM logs-aws.apigateway_logs* | STATS a = AVG(\`aws.apigateway.integration_latency\`) | EVAL \`Avg integ (ms)\` = ROUND(a, 1)`
    ),
    donut(
      "apigw-d1",
      0,
      "HTTP status",
      `FROM logs-aws.apigateway_logs* | STATS c = COUNT() BY st = \`aws.apigateway.status\` | SORT c DESC | LIMIT 10`,
      "c",
      "st"
    ),
    donut(
      "apigw-d2",
      16,
      "API stages",
      `FROM logs-aws.apigateway_logs* | STATS c = COUNT() BY stg = \`aws.apigateway.stage\` | SORT c DESC | LIMIT 10`,
      "c",
      "stg"
    ),
    donut(
      "apigw-d3",
      32,
      "API type",
      `FROM logs-aws.apigateway_logs* | STATS c = COUNT() BY t = \`aws.apigateway.api_type\` | SORT c DESC | LIMIT 8`,
      "c",
      "t"
    ),
    xyLine(
      "apigw-l1",
      0,
      15,
      48,
      "Requests over time",
      `FROM logs-aws.apigateway_logs* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "apigw-l2",
      0,
      25,
      24,
      "Latency vs integration",
      `FROM logs-aws.apigateway_logs* | STATS lat = AVG(event.duration) / 1000000.0, integ = AVG(\`aws.apigateway.integration_latency\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "lat", label: "Latency (ms)" },
        { col: "integ", label: "Integration (ms)" },
      ]
    ),
    xyLine(
      "apigw-l3",
      24,
      25,
      24,
      "4xx vs 5xx",
      `FROM logs-aws.apigateway_logs* | STATS e4 = SUM(\`aws.apigateway.metrics.4XXError.sum\`), e5 = SUM(\`aws.apigateway.metrics.5XXError.sum\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "e4", label: "4XX" },
        { col: "e5", label: "5XX" },
      ]
    ),
    xyBarH(
      "apigw-b1",
      0,
      35,
      "Top APIs by volume",
      `FROM logs-aws.apigateway_logs* | STATS c = COUNT() BY api = \`aws.apigateway.api_id\` | SORT c DESC | LIMIT 10`,
      "api",
      "c",
      "Requests"
    ),
    dataTable(
      "apigw-t1",
      45,
      "Recent requests",
      `FROM logs-aws.apigateway_logs* | KEEP \`@timestamp\`, \`aws.apigateway.api_id\`, \`aws.apigateway.stage\`, \`aws.apigateway.http_method\`, \`aws.apigateway.resource_path\`, \`aws.apigateway.status\`, \`aws.apigateway.integration_latency\`, \`aws.apigateway.request_id\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.apigateway.api_id", label: "API" },
        { col: "aws.apigateway.stage", label: "Stage" },
        { col: "aws.apigateway.http_method", label: "Method" },
        { col: "aws.apigateway.resource_path", label: "Path" },
        { col: "aws.apigateway.status", label: "Status" },
        { col: "aws.apigateway.integration_latency", label: "Integ ms" },
        { col: "aws.apigateway.request_id", label: "Request ID" },
      ]
    ),
  ]),
]);

// --- CloudFront ---
aws.push([
  "installer/aws-custom-dashboards/cloudfront-dashboard.json",
  dash("AWS CloudFront — CDN Traffic & Cache", [
    metric("cf-k1", 0, 0, "Requests", `FROM logs-aws.cloudfront_logs* | STATS Requests = COUNT()`),
    metric(
      "cf-k2",
      12,
      0,
      "Error %",
      `FROM logs-aws.cloudfront_logs* | EVAL e = CASE(\`http.response.status_code\` >= 400, 1, 0) | STATS m = AVG(e) | EVAL \`Error %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "cf-k3",
      24,
      0,
      "Cache hit %",
      `FROM logs-aws.cloudfront_logs* | EVAL hit = CASE(\`aws.cloudfront.edge_result_type\` == "Hit" OR \`aws.cloudfront.edge_result_type\` == "RefreshHit", 1, 0) | STATS m = AVG(hit) | EVAL \`Hit %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "cf-k4",
      36,
      0,
      "Bytes served",
      `FROM logs-aws.cloudfront_logs* | STATS \`Bytes served\` = SUM(\`http.response.bytes\`)`
    ),
    donut(
      "cf-d1",
      0,
      "Edge result",
      `FROM logs-aws.cloudfront_logs* | STATS c = COUNT() BY r = \`aws.cloudfront.edge_result_type\` | SORT c DESC | LIMIT 8`,
      "c",
      "r"
    ),
    donut(
      "cf-d2",
      16,
      "HTTP status",
      `FROM logs-aws.cloudfront_logs* | STATS c = COUNT() BY s = \`http.response.status_code\` | SORT c DESC | LIMIT 10`,
      "c",
      "s"
    ),
    donut(
      "cf-d3",
      32,
      "Top distributions",
      `FROM logs-aws.cloudfront_logs* | STATS c = COUNT() BY d = \`aws.dimensions.DistributionId\` | SORT c DESC | LIMIT 8`,
      "c",
      "d"
    ),
    xyLine(
      "cf-l1",
      0,
      15,
      48,
      "Requests over time",
      `FROM logs-aws.cloudfront_logs* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "cf-l2",
      0,
      25,
      24,
      "Bytes & time-to-first-byte",
      `FROM logs-aws.cloudfront_logs* | STATS bytes = SUM(\`http.response.bytes\`), ttfb = AVG(\`aws.cloudfront.time_to_first_byte\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "bytes", label: "Bytes" },
        { col: "ttfb", label: "TTFB (s)" },
      ]
    ),
    xyLine(
      "cf-l3",
      24,
      25,
      24,
      "Errors over time",
      `FROM logs-aws.cloudfront_logs* | STATS err = SUM(CASE(\`http.response.status_code\` >= 400, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "err", label: "Errors" }]
    ),
    xyBarH(
      "cf-b1",
      0,
      35,
      "Top edge locations",
      `FROM logs-aws.cloudfront_logs* | STATS c = COUNT() BY e = \`aws.cloudfront.edge_location\` | SORT c DESC | LIMIT 10`,
      "e",
      "c",
      "Requests"
    ),
    dataTable(
      "cf-t1",
      45,
      "Recent requests",
      `FROM logs-aws.cloudfront_logs* | KEEP \`@timestamp\`, \`aws.dimensions.DistributionId\`, \`aws.cloudfront.edge_location\`, \`http.response.status_code\`, \`aws.cloudfront.edge_result_type\`, \`http.response.bytes\`, \`url.path\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.dimensions.DistributionId", label: "Distribution" },
        { col: "aws.cloudfront.edge_location", label: "Edge" },
        { col: "http.response.status_code", label: "Status" },
        { col: "aws.cloudfront.edge_result_type", label: "Result" },
        { col: "http.response.bytes", label: "Bytes" },
        { col: "url.path", label: "Path" },
      ]
    ),
  ]),
]);

// --- CloudTrail ---
aws.push([
  "installer/aws-custom-dashboards/cloudtrail-dashboard.json",
  dash("AWS CloudTrail — API Activity", [
    metric("ct-k1", 0, 0, "Events", `FROM logs-aws.cloudtrail* | STATS Events = COUNT()`),
    metric(
      "ct-k2",
      12,
      0,
      "Failure %",
      `FROM logs-aws.cloudtrail* | EVAL f = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(f) | EVAL \`Failure %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "ct-k3",
      24,
      0,
      "Distinct users",
      `FROM logs-aws.cloudtrail* | STATS \`Users\` = COUNT_DISTINCT(\`user.name\`)`
    ),
    metric(
      "ct-k4",
      36,
      0,
      "Distinct APIs",
      `FROM logs-aws.cloudtrail* | STATS \`APIs\` = COUNT_DISTINCT(\`aws.cloudtrail.eventName\`)`
    ),
    donut(
      "ct-d1",
      0,
      "Event outcome",
      `FROM logs-aws.cloudtrail* | STATS c = COUNT() BY o = event.outcome`,
      "c",
      "o"
    ),
    donut(
      "ct-d2",
      16,
      "Top event names",
      `FROM logs-aws.cloudtrail* | STATS c = COUNT() BY ev = \`aws.cloudtrail.eventName\` | SORT c DESC | LIMIT 10`,
      "c",
      "ev"
    ),
    donut(
      "ct-d3",
      32,
      "Top sources",
      `FROM logs-aws.cloudtrail* | STATS c = COUNT() BY s = \`aws.cloudtrail.eventSource\` | SORT c DESC | LIMIT 8`,
      "c",
      "s"
    ),
    xyLine(
      "ct-l1",
      0,
      15,
      48,
      "API calls over time",
      `FROM logs-aws.cloudtrail* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "ct-l2",
      0,
      25,
      24,
      "Success vs failure",
      `FROM logs-aws.cloudtrail* | STATS ok = SUM(CASE(event.outcome == "success", 1, 0)), bad = SUM(CASE(event.outcome == "failure", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "ok", label: "Success" },
        { col: "bad", label: "Failure" },
      ]
    ),
    xyLine(
      "ct-l3",
      24,
      25,
      24,
      "Read-only vs mutating",
      `FROM logs-aws.cloudtrail* | STATS ro = SUM(CASE(\`aws.cloudtrail.readOnly\` == true, 1, 0)), rw = SUM(CASE(\`aws.cloudtrail.readOnly\` == false, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "ro", label: "ReadOnly" },
        { col: "rw", label: "Mutating" },
      ]
    ),
    xyBarH(
      "ct-b1",
      0,
      35,
      "Top callers (user)",
      `FROM logs-aws.cloudtrail* | STATS c = COUNT() BY u = \`user.name\` | SORT c DESC | LIMIT 10`,
      "u",
      "c",
      "Events"
    ),
    dataTable(
      "ct-t1",
      45,
      "Recent management events",
      `FROM logs-aws.cloudtrail* | KEEP \`@timestamp\`, \`aws.cloudtrail.eventName\`, \`aws.cloudtrail.eventSource\`, event.outcome, \`user.name\`, \`source.ip\`, \`aws.cloudtrail.errorCode\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.cloudtrail.eventName", label: "Event" },
        { col: "aws.cloudtrail.eventSource", label: "Source" },
        { col: "event.outcome", label: "Outcome" },
        { col: "user.name", label: "User" },
        { col: "source.ip", label: "Source IP" },
        { col: "aws.cloudtrail.errorCode", label: "Error" },
      ]
    ),
  ]),
]);

// --- Config ---
aws.push([
  "installer/aws-custom-dashboards/config-dashboard.json",
  dash("AWS Config — Compliance & Rules", [
    metric("cfg-k1", 0, 0, "Evaluations", `FROM logs-aws.config* | STATS Evaluations = COUNT()`),
    metric(
      "cfg-k2",
      12,
      0,
      "Non-compliant %",
      `FROM logs-aws.config* | EVAL nc = CASE(\`aws.config.compliance_type\` == "NON_COMPLIANT", 1, 0) | STATS m = AVG(nc) | EVAL \`Non-compliant %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "cfg-k3",
      24,
      0,
      "Distinct rules",
      `FROM logs-aws.config* | STATS \`Rules\` = COUNT_DISTINCT(\`aws.config.rule_name\`)`
    ),
    metric(
      "cfg-k4",
      36,
      0,
      "Avg rule score",
      `FROM logs-aws.config* | STATS \`Avg score\` = ROUND(AVG(\`aws.config.metrics.ComplianceByConfigRule.avg\`), 2)`
    ),
    donut(
      "cfg-d1",
      0,
      "Compliance status",
      `FROM logs-aws.config* | STATS c = COUNT() BY s = \`aws.config.compliance_type\` | SORT c DESC`,
      "c",
      "s"
    ),
    donut(
      "cfg-d2",
      16,
      "Top rules",
      `FROM logs-aws.config* | STATS c = COUNT() BY r = \`aws.config.rule_name\` | SORT c DESC | LIMIT 10`,
      "c",
      "r"
    ),
    donut(
      "cfg-d3",
      32,
      "Resource types",
      `FROM logs-aws.config* | STATS c = COUNT() BY t = \`aws.config.resource_type\` | SORT c DESC | LIMIT 8`,
      "c",
      "t"
    ),
    xyLine(
      "cfg-l1",
      0,
      15,
      48,
      "Evaluations over time",
      `FROM logs-aws.config* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "cfg-l2",
      0,
      25,
      24,
      "Non-compliant vs compliant",
      `FROM logs-aws.config* | STATS nc = SUM(\`aws.config.metrics.NonCompliantRules.sum\`), ok = SUM(\`aws.config.metrics.CompliantRules.sum\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "nc", label: "Non-compliant" },
        { col: "ok", label: "Compliant" },
      ]
    ),
    xyLine(
      "cfg-l3",
      24,
      25,
      24,
      "Configuration items recorded",
      `FROM logs-aws.config* | STATS items = SUM(\`aws.config.metrics.ConfigurationItemsRecorded.sum\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "items", label: "Items" }]
    ),
    xyBarH(
      "cfg-b1",
      0,
      35,
      "Rules with most failures",
      `FROM logs-aws.config* | WHERE \`aws.config.compliance_type\` == "NON_COMPLIANT" | STATS c = COUNT() BY r = \`aws.config.rule_name\` | SORT c DESC | LIMIT 10`,
      "r",
      "c",
      "Failures"
    ),
    dataTable(
      "cfg-t1",
      45,
      "Recent evaluations",
      `FROM logs-aws.config* | KEEP \`@timestamp\`, \`aws.config.rule_name\`, \`aws.config.compliance_type\`, \`aws.config.resource_type\`, \`aws.config.resource_id\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.config.rule_name", label: "Rule" },
        { col: "aws.config.compliance_type", label: "Status" },
        { col: "aws.config.resource_type", label: "Resource type" },
        { col: "aws.config.resource_id", label: "Resource" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// --- DMS ---
aws.push([
  "installer/aws-custom-dashboards/dms-dashboard.json",
  dash("AWS Database Migration Service — Replication", [
    metric("dms-k1", 0, 0, "Events", `FROM logs-aws.dms* | STATS Events = COUNT()`),
    metric(
      "dms-k2",
      12,
      0,
      "Failed tasks",
      `FROM logs-aws.dms* | STATS \`Failed\` = SUM(CASE(\`aws.dms.task_status\` == "Failed", 1, 0))`
    ),
    metric(
      "dms-k3",
      24,
      0,
      "Avg CDC latency (ms)",
      `FROM logs-aws.dms* | STATS \`CDC ms\` = ROUND(AVG(\`aws.dms.latency_ms\`), 0)`
    ),
    metric(
      "dms-k4",
      36,
      0,
      "Rows transferred",
      `FROM logs-aws.dms* | STATS \`Rows\` = SUM(\`aws.dms.full_load_rows_transferred\`)`
    ),
    donut(
      "dms-d1",
      0,
      "Task status",
      `FROM logs-aws.dms* | STATS c = COUNT() BY s = \`aws.dms.task_status\` | SORT c DESC`,
      "c",
      "s"
    ),
    donut(
      "dms-d2",
      16,
      "Migration type",
      `FROM logs-aws.dms* | STATS c = COUNT() BY m = \`aws.dms.migration_type\` | SORT c DESC`,
      "c",
      "m"
    ),
    donut(
      "dms-d3",
      32,
      "Source engines",
      `FROM logs-aws.dms* | STATS c = COUNT() BY e = \`aws.dms.source_engine\` | SORT c DESC | LIMIT 8`,
      "c",
      "e"
    ),
    xyLine(
      "dms-l1",
      0,
      15,
      48,
      "Events over time",
      `FROM logs-aws.dms* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "dms-l2",
      0,
      25,
      24,
      "CDC incoming changes",
      `FROM logs-aws.dms* | STATS cdc = AVG(\`aws.dms.cdc_incoming_changes\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "cdc", label: "CDC changes" }]
    ),
    xyLine(
      "dms-l3",
      24,
      25,
      24,
      "Replication latency (ms)",
      `FROM logs-aws.dms* | STATS lat = AVG(\`aws.dms.latency_ms\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "lat", label: "Latency ms" }]
    ),
    xyBarH(
      "dms-b1",
      0,
      35,
      "Top replication tasks",
      `FROM logs-aws.dms* | STATS c = COUNT() BY t = \`aws.dms.replication_task_id\` | SORT c DESC | LIMIT 10`,
      "t",
      "c",
      "Events"
    ),
    dataTable(
      "dms-t1",
      45,
      "Recent tasks",
      `FROM logs-aws.dms* | KEEP \`@timestamp\`, \`aws.dms.replication_task_id\`, \`aws.dms.task_status\`, \`aws.dms.migration_type\`, \`aws.dms.source_engine\`, \`aws.dms.target_engine\`, \`aws.dms.latency_ms\`, \`aws.dms.tables_errored\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.dms.replication_task_id", label: "Task" },
        { col: "aws.dms.task_status", label: "Status" },
        { col: "aws.dms.migration_type", label: "Type" },
        { col: "aws.dms.source_engine", label: "Source" },
        { col: "aws.dms.target_engine", label: "Target" },
        { col: "aws.dms.latency_ms", label: "Latency" },
        { col: "aws.dms.tables_errored", label: "Table errors" },
      ]
    ),
  ]),
]);

// --- GuardDuty ---
aws.push([
  "installer/aws-custom-dashboards/guardduty-dashboard.json",
  dash("Amazon GuardDuty — Findings", [
    metric("gd-k1", 0, 0, "Events", `FROM logs-aws.guardduty* | STATS Events = COUNT()`),
    metric(
      "gd-k2",
      12,
      0,
      "High+ findings",
      `FROM logs-aws.guardduty* | STATS \`High+\` = SUM(CASE(\`aws.guardduty.severity\` >= 7.0, 1, 0))`
    ),
    metric(
      "gd-k3",
      24,
      0,
      "Avg severity",
      `FROM logs-aws.guardduty* | STATS \`Avg sev\` = ROUND(AVG(\`aws.guardduty.severity\`), 1)`
    ),
    metric(
      "gd-k4",
      36,
      0,
      "Distinct types",
      `FROM logs-aws.guardduty* | STATS \`Types\` = COUNT_DISTINCT(\`aws.guardduty.type\`)`
    ),
    donut(
      "gd-d1",
      0,
      "Severity bands",
      `FROM logs-aws.guardduty* | STATS c = COUNT() BY band = CASE(\`aws.guardduty.severity\` >= 7, "High", \`aws.guardduty.severity\` >= 4, "Medium", "Low") | SORT c DESC`,
      "c",
      "band"
    ),
    donut(
      "gd-d2",
      16,
      "Finding types",
      `FROM logs-aws.guardduty* | STATS c = COUNT() BY t = \`aws.guardduty.type\` | SORT c DESC | LIMIT 10`,
      "c",
      "t"
    ),
    donut(
      "gd-d3",
      32,
      "Outcome",
      `FROM logs-aws.guardduty* | STATS c = COUNT() BY o = event.outcome`,
      "c",
      "o"
    ),
    xyLine(
      "gd-l1",
      0,
      15,
      48,
      "Findings over time",
      `FROM logs-aws.guardduty* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "gd-l2",
      0,
      25,
      24,
      "Severity over time",
      `FROM logs-aws.guardduty* | STATS s = AVG(\`aws.guardduty.severity\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "s", label: "Avg severity" }]
    ),
    xyLine(
      "gd-l3",
      24,
      25,
      24,
      "High severity count",
      `FROM logs-aws.guardduty* | STATS hi = SUM(CASE(\`aws.guardduty.severity\` >= 7, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "hi", label: "High+" }]
    ),
    xyBarH(
      "gd-b1",
      0,
      35,
      "Top detector IDs",
      `FROM logs-aws.guardduty* | STATS c = COUNT() BY d = \`aws.dimensions.DetectorId\` | SORT c DESC | LIMIT 10`,
      "d",
      "c",
      "Findings"
    ),
    dataTable(
      "gd-t1",
      45,
      "Recent findings",
      `FROM logs-aws.guardduty* | KEEP \`@timestamp\`, \`aws.guardduty.type\`, \`aws.guardduty.severity\`, \`aws.guardduty.title\`, event.outcome, \`aws.guardduty.id\`, log.level | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.guardduty.type", label: "Type" },
        { col: "aws.guardduty.severity", label: "Severity" },
        { col: "aws.guardduty.title", label: "Title" },
        { col: "event.outcome", label: "Outcome" },
        { col: "aws.guardduty.id", label: "Finding ID" },
        { col: "log.level", label: "Level" },
      ]
    ),
  ]),
]);

// --- Inspector (index aws.inspector) ---
aws.push([
  "installer/aws-custom-dashboards/inspector-dashboard.json",
  dash("AWS Inspector — Vulnerabilities", [
    metric("insp-k1", 0, 0, "Findings", `FROM logs-aws.inspector* | STATS Findings = COUNT()`),
    metric(
      "insp-k2",
      12,
      0,
      "Critical",
      `FROM logs-aws.inspector* | STATS Critical = SUM(CASE(\`aws.inspector2.severity\` == "CRITICAL", 1, 0))`
    ),
    metric(
      "insp-k3",
      24,
      0,
      "High",
      `FROM logs-aws.inspector* | STATS High = SUM(CASE(\`aws.inspector2.severity\` == "HIGH", 1, 0))`
    ),
    metric(
      "insp-k4",
      36,
      0,
      "Avg CVSS",
      `FROM logs-aws.inspector* | STATS \`Avg CVSS\` = ROUND(AVG(\`aws.inspector2.severity_score\`), 1)`
    ),
    donut(
      "insp-d1",
      0,
      "Severity",
      `FROM logs-aws.inspector* | STATS c = COUNT() BY s = \`aws.inspector2.severity\` | SORT c DESC`,
      "c",
      "s"
    ),
    donut(
      "insp-d2",
      16,
      "Finding type",
      `FROM logs-aws.inspector* | STATS c = COUNT() BY t = \`aws.inspector2.type\` | SORT c DESC | LIMIT 8`,
      "c",
      "t"
    ),
    donut(
      "insp-d3",
      32,
      "Resource type",
      `FROM logs-aws.inspector* | STATS c = COUNT() BY r = \`aws.inspector2.resource_type\` | SORT c DESC`,
      "c",
      "r"
    ),
    xyLine(
      "insp-l1",
      0,
      15,
      48,
      "Findings over time",
      `FROM logs-aws.inspector* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Findings" }]
    ),
    xyLine(
      "insp-l2",
      0,
      25,
      24,
      "Critical + high trend",
      `FROM logs-aws.inspector* | STATS ch = SUM(CASE(\`aws.inspector2.severity\` IN ("CRITICAL", "HIGH"), 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "ch", label: "Crit+High" }]
    ),
    xyLine(
      "insp-l3",
      24,
      25,
      24,
      "Covered resources (avg)",
      `FROM logs-aws.inspector* | STATS cov = AVG(\`aws.inspector2.metrics.CoveredResources.avg\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "cov", label: "Resources" }]
    ),
    xyBarH(
      "insp-b1",
      0,
      35,
      "Top packages (CVE findings)",
      `FROM logs-aws.inspector* | WHERE \`aws.inspector2.type\` == "PACKAGE_VULNERABILITY" | STATS c = COUNT() BY p = \`package.name\` | SORT c DESC | LIMIT 10`,
      "p",
      "c",
      "Findings"
    ),
    dataTable(
      "insp-t1",
      45,
      "Recent findings",
      `FROM logs-aws.inspector* | KEEP \`@timestamp\`, \`aws.inspector2.severity\`, \`aws.inspector2.type\`, \`aws.inspector2.title\`, \`aws.inspector2.resource_id\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.inspector2.severity", label: "Severity" },
        { col: "aws.inspector2.type", label: "Type" },
        { col: "aws.inspector2.title", label: "Title" },
        { col: "aws.inspector2.resource_id", label: "Resource" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// --- Neptune ---
aws.push([
  "installer/aws-custom-dashboards/neptune-dashboard.json",
  dash("Amazon Neptune — Graph Queries", [
    metric("nep-k1", 0, 0, "Queries", `FROM logs-aws.neptune* | STATS Queries = COUNT()`),
    metric(
      "nep-k2",
      12,
      0,
      "Error %",
      `FROM logs-aws.neptune* | EVAL e = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(e) | EVAL \`Error %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "nep-k3",
      24,
      0,
      "Avg query (ms)",
      `FROM logs-aws.neptune* | STATS \`Avg ms\` = ROUND(AVG(\`aws.neptune.duration_ms\`), 1)`
    ),
    metric(
      "nep-k4",
      36,
      0,
      "Avg connections",
      `FROM logs-aws.neptune* | STATS \`Avg conns\` = ROUND(AVG(\`aws.neptune.db_connections\`), 0)`
    ),
    donut(
      "nep-d1",
      0,
      "Query language",
      `FROM logs-aws.neptune* | STATS c = COUNT() BY l = \`aws.neptune.query_language\` | SORT c DESC`,
      "c",
      "l"
    ),
    donut(
      "nep-d2",
      16,
      "HTTP status",
      `FROM logs-aws.neptune* | STATS c = COUNT() BY s = \`aws.neptune.http_status\` | SORT c DESC`,
      "c",
      "s"
    ),
    donut(
      "nep-d3",
      32,
      "Clusters",
      `FROM logs-aws.neptune* | STATS c = COUNT() BY cl = \`aws.neptune.cluster_id\` | SORT c DESC | LIMIT 8`,
      "c",
      "cl"
    ),
    xyLine(
      "nep-l1",
      0,
      15,
      48,
      "Queries over time",
      `FROM logs-aws.neptune* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Queries" }]
    ),
    xyLine(
      "nep-l2",
      0,
      25,
      24,
      "Avg duration (ms)",
      `FROM logs-aws.neptune* | STATS d = AVG(\`aws.neptune.duration_ms\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "d", label: "Duration ms" }]
    ),
    xyLine(
      "nep-l3",
      24,
      25,
      24,
      "DB connections",
      `FROM logs-aws.neptune* | STATS con = AVG(\`aws.neptune.metrics.DatabaseConnections.avg\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "con", label: "Connections" }]
    ),
    xyBarH(
      "nep-b1",
      0,
      35,
      "Gremlin RPS by cluster",
      `FROM logs-aws.neptune* | STATS rps = AVG(\`aws.neptune.metrics.GremlinRequestsPerSec.avg\`) BY cl = \`aws.neptune.cluster_id\` | SORT rps DESC | LIMIT 10`,
      "cl",
      "rps",
      "Gremlin RPS"
    ),
    dataTable(
      "nep-t1",
      45,
      "Recent queries",
      `FROM logs-aws.neptune* | KEEP \`@timestamp\`, \`aws.neptune.cluster_id\`, \`aws.neptune.query_language\`, \`aws.neptune.duration_ms\`, \`aws.neptune.http_status\`, event.outcome, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.neptune.cluster_id", label: "Cluster" },
        { col: "aws.neptune.query_language", label: "Lang" },
        { col: "aws.neptune.duration_ms", label: "Ms" },
        { col: "aws.neptune.http_status", label: "HTTP" },
        { col: "event.outcome", label: "Outcome" },
        { col: "message", label: "Message" },
      ]
    ),
  ]),
]);

// --- Network Firewall ---
aws.push([
  "installer/aws-custom-dashboards/networkfirewall-dashboard.json",
  dash("AWS Network Firewall — Flows", [
    metric("nfw-k1", 0, 0, "Flows", `FROM logs-aws.firewall_logs* | STATS Flows = COUNT()`),
    metric(
      "nfw-k2",
      12,
      0,
      "Dropped %",
      `FROM logs-aws.firewall_logs* | EVAL d = CASE(\`aws.firewall_logs.action\` == "DROP", 1, 0) | STATS m = AVG(d) | EVAL \`Dropped %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "nfw-k3",
      24,
      0,
      "Packets dropped",
      `FROM logs-aws.firewall_logs* | STATS \`Dropped pkts\` = SUM(\`aws.network_firewall.metrics.DroppedPackets.sum\`)`
    ),
    metric(
      "nfw-k4",
      36,
      0,
      "Packets passed",
      `FROM logs-aws.firewall_logs* | STATS \`Passed pkts\` = SUM(\`aws.network_firewall.metrics.PassedPackets.sum\`)`
    ),
    donut(
      "nfw-d1",
      0,
      "Action",
      `FROM logs-aws.firewall_logs* | STATS c = COUNT() BY a = \`aws.firewall_logs.action\` | SORT c DESC`,
      "c",
      "a"
    ),
    donut(
      "nfw-d2",
      16,
      "Protocol",
      `FROM logs-aws.firewall_logs* | STATS c = COUNT() BY p = \`aws.firewall_logs.protocol\` | SORT c DESC | LIMIT 8`,
      "c",
      "p"
    ),
    donut(
      "nfw-d3",
      32,
      "Firewalls",
      `FROM logs-aws.firewall_logs* | STATS c = COUNT() BY f = \`aws.firewall_logs.firewall_name\` | SORT c DESC | LIMIT 8`,
      "c",
      "f"
    ),
    xyLine(
      "nfw-l1",
      0,
      15,
      48,
      "Events over time",
      `FROM logs-aws.firewall_logs* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "nfw-l2",
      0,
      25,
      24,
      "Dropped vs passed bytes",
      `FROM logs-aws.firewall_logs* | STATS db = SUM(\`aws.network_firewall.metrics.DroppedBytes.sum\`), pb = SUM(\`network.bytes\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "db", label: "Dropped bytes" },
        { col: "pb", label: "Flow bytes" },
      ]
    ),
    xyLine(
      "nfw-l3",
      24,
      25,
      24,
      "Drop events",
      `FROM logs-aws.firewall_logs* | STATS drops = SUM(CASE(\`aws.firewall_logs.action\` == "DROP", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "drops", label: "Drops" }]
    ),
    xyBarH(
      "nfw-b1",
      0,
      35,
      "Top destination ports",
      `FROM logs-aws.firewall_logs* | STATS c = COUNT() BY p = \`aws.firewall_logs.dest_port\` | SORT c DESC | LIMIT 10`,
      "p",
      "c",
      "Flows"
    ),
    dataTable(
      "nfw-t1",
      45,
      "Recent flows",
      `FROM logs-aws.firewall_logs* | KEEP \`@timestamp\`, \`aws.firewall_logs.firewall_name\`, \`aws.firewall_logs.action\`, \`aws.firewall_logs.protocol\`, \`source.ip\`, \`destination.ip\`, \`aws.firewall_logs.dest_port\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.firewall_logs.firewall_name", label: "Firewall" },
        { col: "aws.firewall_logs.action", label: "Action" },
        { col: "aws.firewall_logs.protocol", label: "Proto" },
        { col: "source.ip", label: "Src" },
        { col: "destination.ip", label: "Dst" },
        { col: "aws.firewall_logs.dest_port", label: "Dport" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// --- NLB ---
aws.push([
  "installer/aws-custom-dashboards/nlb-dashboard.json",
  dash("AWS Network Load Balancer — TCP/UDP", [
    metric(
      "nlb-k1",
      0,
      0,
      "Events",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS Events = COUNT()`
    ),
    metric(
      "nlb-k2",
      12,
      0,
      "Failure %",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | EVAL f = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(f) | EVAL \`Failure %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "nlb-k3",
      24,
      0,
      "Avg conn (ms)",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS \`Conn ms\` = ROUND(AVG(\`aws.elb.connection_time.ms\`), 1)`
    ),
    metric(
      "nlb-k4",
      36,
      0,
      "Bytes transferred",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS bytes = SUM(\`aws.elb.received_bytes\`) + SUM(\`aws.elb.sent_bytes\`) | EVAL \`Bytes\` = bytes`
    ),
    donut(
      "nlb-d1",
      0,
      "Protocol",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS c = COUNT() BY p = \`aws.elb.protocol\` | SORT c DESC`,
      "c",
      "p"
    ),
    donut(
      "nlb-d2",
      16,
      "Outcome",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS c = COUNT() BY o = event.outcome`,
      "c",
      "o"
    ),
    donut(
      "nlb-d3",
      32,
      "Load balancers",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS c = COUNT() BY lb = \`aws.elb.name\` | SORT c DESC | LIMIT 8`,
      "c",
      "lb"
    ),
    xyLine(
      "nlb-l1",
      0,
      15,
      48,
      "Connections over time",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "nlb-l2",
      0,
      25,
      24,
      "Received vs sent bytes",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS rx = SUM(\`aws.elb.received_bytes\`), tx = SUM(\`aws.elb.sent_bytes\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "rx", label: "Received" },
        { col: "tx", label: "Sent" },
      ]
    ),
    xyLine(
      "nlb-l3",
      24,
      25,
      24,
      "Connection duration (ms)",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS d = AVG(\`aws.elb.connection_time.ms\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "d", label: "Conn ms" }]
    ),
    xyBarH(
      "nlb-b1",
      0,
      35,
      "Top backend IPs",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | STATS c = COUNT() BY ip = \`aws.elb.backend.ip\` | SORT c DESC | LIMIT 10`,
      "ip",
      "c",
      "Flows"
    ),
    dataTable(
      "nlb-t1",
      45,
      "Recent flows",
      `FROM logs-aws.elb_logs* | WHERE \`cloud.service.name\` == "nlb" | KEEP \`@timestamp\`, \`aws.elb.name\`, \`aws.elb.protocol\`, event.outcome, \`source.ip\`, \`aws.elb.backend.ip\`, \`aws.elb.connection_time.ms\`, \`network.bytes\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.elb.name", label: "NLB" },
        { col: "aws.elb.protocol", label: "Proto" },
        { col: "event.outcome", label: "Outcome" },
        { col: "source.ip", label: "Client" },
        { col: "aws.elb.backend.ip", label: "Backend" },
        { col: "aws.elb.connection_time.ms", label: "Conn ms" },
        { col: "network.bytes", label: "Bytes" },
      ]
    ),
  ]),
]);

// --- Route 53 ---
aws.push([
  "installer/aws-custom-dashboards/route53-dashboard.json",
  dash("Amazon Route 53 — DNS Queries", [
    metric(
      "r53-k1",
      0,
      0,
      "Queries",
      `FROM logs-aws.route53_public_logs* | STATS Queries = COUNT()`
    ),
    metric(
      "r53-k2",
      12,
      0,
      "NXDOMAIN %",
      `FROM logs-aws.route53_public_logs* | EVAL nx = CASE(\`dns.response_code\` == "NXDOMAIN", 1, 0) | STATS m = AVG(nx) | EVAL \`NXDOMAIN %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "r53-k3",
      24,
      0,
      "Failure %",
      `FROM logs-aws.route53_public_logs* | EVAL f = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(f) | EVAL \`Failure %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "r53-k4",
      36,
      0,
      "Distinct zones",
      `FROM logs-aws.route53_public_logs* | STATS \`Zones\` = COUNT_DISTINCT(\`aws.route53.hosted_zone_id\`)`
    ),
    donut(
      "r53-d1",
      0,
      "Response code",
      `FROM logs-aws.route53_public_logs* | STATS c = COUNT() BY r = \`dns.response_code\` | SORT c DESC`,
      "c",
      "r"
    ),
    donut(
      "r53-d2",
      16,
      "Record type",
      `FROM logs-aws.route53_public_logs* | STATS c = COUNT() BY t = \`dns.question.type\` | SORT c DESC | LIMIT 10`,
      "c",
      "t"
    ),
    donut(
      "r53-d3",
      32,
      "Outcome",
      `FROM logs-aws.route53_public_logs* | STATS c = COUNT() BY o = event.outcome`,
      "c",
      "o"
    ),
    xyLine(
      "r53-l1",
      0,
      15,
      48,
      "Queries over time",
      `FROM logs-aws.route53_public_logs* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Queries" }]
    ),
    xyLine(
      "r53-l2",
      0,
      25,
      24,
      "NXDOMAIN vs success",
      `FROM logs-aws.route53_public_logs* | STATS nx = SUM(CASE(\`dns.response_code\` == "NXDOMAIN", 1, 0)), ok = SUM(CASE(\`dns.response_code\` == "NOERROR", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "nx", label: "NXDOMAIN" },
        { col: "ok", label: "NOERROR" },
      ]
    ),
    xyLine(
      "r53-l3",
      24,
      25,
      24,
      "Avg query time (µs)",
      `FROM logs-aws.route53_public_logs* | STATS lat = AVG(event.duration) / 1000.0 BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "lat", label: "µs" }]
    ),
    xyBarH(
      "r53-b1",
      0,
      35,
      "Top QNAMEs",
      `FROM logs-aws.route53_public_logs* | STATS c = COUNT() BY q = \`dns.question.name\` | SORT c DESC | LIMIT 10`,
      "q",
      "c",
      "Queries"
    ),
    dataTable(
      "r53-t1",
      45,
      "Recent queries",
      `FROM logs-aws.route53_public_logs* | KEEP \`@timestamp\`, \`dns.question.name\`, \`dns.question.type\`, \`dns.response_code\`, \`client.ip\`, \`aws.route53.hosted_zone_id\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "dns.question.name", label: "QNAME" },
        { col: "dns.question.type", label: "Type" },
        { col: "dns.response_code", label: "RCODE" },
        { col: "client.ip", label: "Client" },
        { col: "aws.route53.hosted_zone_id", label: "Zone" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// --- S3 access logs ---
aws.push([
  "installer/aws-custom-dashboards/s3-dashboard.json",
  dash("Amazon S3 — Access & Errors", [
    metric("s3-k1", 0, 0, "Requests", `FROM logs-aws.s3access* | STATS Requests = COUNT()`),
    metric(
      "s3-k2",
      12,
      0,
      "5xx %",
      `FROM logs-aws.s3access* | EVAL s5 = CASE(\`aws.s3access.http_status\` >= 500, 1, 0) | STATS m = AVG(s5) | EVAL \`5xx %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "s3-k3",
      24,
      0,
      "4xx %",
      `FROM logs-aws.s3access* | EVAL s4 = CASE(\`aws.s3access.http_status\` >= 400 AND \`aws.s3access.http_status\` < 500, 1, 0) | STATS m = AVG(s4) | EVAL \`4xx %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "s3-k4",
      36,
      0,
      "Bytes sent",
      `FROM logs-aws.s3access* | STATS \`Bytes sent\` = SUM(\`aws.s3access.bytes_sent\`)`
    ),
    donut(
      "s3-d1",
      0,
      "HTTP status",
      `FROM logs-aws.s3access* | STATS c = COUNT() BY s = \`aws.s3access.http_status\` | SORT c DESC | LIMIT 10`,
      "c",
      "s"
    ),
    donut(
      "s3-d2",
      16,
      "Operation",
      `FROM logs-aws.s3access* | STATS c = COUNT() BY o = \`aws.s3access.operation\` | SORT c DESC | LIMIT 10`,
      "c",
      "o"
    ),
    donut(
      "s3-d3",
      32,
      "Outcome",
      `FROM logs-aws.s3access* | STATS c = COUNT() BY out = event.outcome`,
      "c",
      "out"
    ),
    xyLine(
      "s3-l1",
      0,
      15,
      48,
      "Requests over time",
      `FROM logs-aws.s3access* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "s3-l2",
      0,
      25,
      24,
      "Errors over time",
      `FROM logs-aws.s3access* | STATS e4 = SUM(CASE(\`aws.s3access.http_status\` >= 400 AND \`aws.s3access.http_status\` < 500, 1, 0)), e5 = SUM(CASE(\`aws.s3access.http_status\` >= 500, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "e4", label: "4xx" },
        { col: "e5", label: "5xx" },
      ]
    ),
    xyLine(
      "s3-l3",
      24,
      25,
      24,
      "Bytes transferred",
      `FROM logs-aws.s3access* | STATS bts = SUM(\`aws.s3access.bytes_sent\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "bts", label: "Bytes" }]
    ),
    xyBarH(
      "s3-b1",
      0,
      35,
      "Top buckets",
      `FROM logs-aws.s3access* | STATS c = COUNT() BY bk = \`aws.s3access.bucket\` | SORT c DESC | LIMIT 10`,
      "bk",
      "c",
      "Requests"
    ),
    dataTable(
      "s3-t1",
      45,
      "Recent access",
      `FROM logs-aws.s3access* | KEEP \`@timestamp\`, \`aws.s3access.bucket\`, \`aws.s3access.operation\`, \`aws.s3access.http_status\`, \`aws.s3access.bytes_sent\`, \`aws.s3access.error_code\`, \`aws.s3access.remote_ip\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.s3access.bucket", label: "Bucket" },
        { col: "aws.s3access.operation", label: "Operation" },
        { col: "aws.s3access.http_status", label: "Status" },
        { col: "aws.s3access.bytes_sent", label: "Bytes" },
        { col: "aws.s3access.error_code", label: "Error" },
        { col: "aws.s3access.remote_ip", label: "Client" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// --- Security Hub ---
aws.push([
  "installer/aws-custom-dashboards/securityhub-dashboard.json",
  dash("AWS Security Hub — Findings & Compliance", [
    metric(
      "sh-k1",
      0,
      0,
      "Findings",
      `FROM logs-aws.securityhub_findings* | STATS Findings = COUNT()`
    ),
    metric(
      "sh-k2",
      12,
      0,
      "Failed %",
      `FROM logs-aws.securityhub_findings* | EVAL f = CASE(\`aws.securityhub_findings.Compliance.Status\` == "FAILED", 1, 0) | STATS m = AVG(f) | EVAL \`Failed %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "sh-k3",
      24,
      0,
      "Critical+High",
      `FROM logs-aws.securityhub_findings* | STATS \`Crit+High\` = SUM(CASE(\`aws.securityhub_findings.Severity.Label\` == "CRITICAL" OR \`aws.securityhub_findings.Severity.Label\` == "HIGH", 1, 0))`
    ),
    metric(
      "sh-k4",
      36,
      0,
      "Distinct controls",
      `FROM logs-aws.securityhub_findings* | STATS \`Controls\` = COUNT_DISTINCT(\`aws.securityhub_findings.Compliance.SecurityControlId\`)`
    ),
    donut(
      "sh-d1",
      0,
      "Severity",
      `FROM logs-aws.securityhub_findings* | STATS c = COUNT() BY s = \`aws.securityhub_findings.Severity.Label\` | SORT c DESC`,
      "c",
      "s"
    ),
    donut(
      "sh-d2",
      16,
      "Compliance",
      `FROM logs-aws.securityhub_findings* | STATS c = COUNT() BY z = \`aws.securityhub_findings.Compliance.Status\` | SORT c DESC`,
      "c",
      "z"
    ),
    donut(
      "sh-d3",
      32,
      "Workflow",
      `FROM logs-aws.securityhub_findings* | STATS c = COUNT() BY w = \`aws.securityhub_findings.Workflow.Status\` | SORT c DESC | LIMIT 8`,
      "c",
      "w"
    ),
    xyLine(
      "sh-l1",
      0,
      15,
      48,
      "Findings over time",
      `FROM logs-aws.securityhub_findings* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "sh-l2",
      0,
      25,
      24,
      "Failed vs passed",
      `FROM logs-aws.securityhub_findings* | STATS bad = SUM(CASE(\`aws.securityhub_findings.Compliance.Status\` == "FAILED", 1, 0)), ok = SUM(CASE(\`aws.securityhub_findings.Compliance.Status\` == "PASSED", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "bad", label: "Failed" },
        { col: "ok", label: "Passed" },
      ]
    ),
    xyLine(
      "sh-l3",
      24,
      25,
      24,
      "Normalized severity",
      `FROM logs-aws.securityhub_findings* | STATS sev = AVG(\`aws.securityhub_findings.Severity.Normalized\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "sev", label: "Avg severity" }]
    ),
    xyBarH(
      "sh-b1",
      0,
      35,
      "Top controls",
      `FROM logs-aws.securityhub_findings* | STATS c = COUNT() BY ctl = \`aws.securityhub_findings.Compliance.SecurityControlId\` | SORT c DESC | LIMIT 10`,
      "ctl",
      "c",
      "Findings"
    ),
    dataTable(
      "sh-t1",
      45,
      "Recent findings",
      `FROM logs-aws.securityhub_findings* | KEEP \`@timestamp\`, \`aws.securityhub_findings.Title\`, \`aws.securityhub_findings.Severity.Label\`, \`aws.securityhub_findings.Compliance.Status\`, \`rule.id\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.securityhub_findings.Title", label: "Title" },
        { col: "aws.securityhub_findings.Severity.Label", label: "Severity" },
        { col: "aws.securityhub_findings.Compliance.Status", label: "Compliance" },
        { col: "rule.id", label: "Control" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

// --- VPC Flow Logs ---
aws.push([
  "installer/aws-custom-dashboards/vpc-dashboard.json",
  dash("AWS VPC Flow Logs — Traffic & Denials", [
    metric("vpc-k1", 0, 0, "Flows", `FROM logs-aws.vpcflow* | STATS Flows = COUNT()`),
    metric(
      "vpc-k2",
      12,
      0,
      "Rejected %",
      `FROM logs-aws.vpcflow* | EVAL rj = CASE(\`aws.vpcflow.action\` == "REJECT", 1, 0) | STATS m = AVG(rj) | EVAL \`Reject %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "vpc-k3",
      24,
      0,
      "Total bytes",
      `FROM logs-aws.vpcflow* | STATS \`Bytes\` = SUM(\`aws.vpcflow.bytes\`)`
    ),
    metric(
      "vpc-k4",
      36,
      0,
      "Distinct VPCs",
      `FROM logs-aws.vpcflow* | STATS \`VPCs\` = COUNT_DISTINCT(\`aws.vpcflow.vpc_id\`)`
    ),
    donut(
      "vpc-d1",
      0,
      "Action",
      `FROM logs-aws.vpcflow* | STATS c = COUNT() BY a = \`aws.vpcflow.action\` | SORT c DESC`,
      "c",
      "a"
    ),
    donut(
      "vpc-d2",
      16,
      "Protocol",
      `FROM logs-aws.vpcflow* | STATS c = COUNT() BY p = \`network.transport\` | SORT c DESC | LIMIT 8`,
      "c",
      "p"
    ),
    donut(
      "vpc-d3",
      32,
      "Direction",
      `FROM logs-aws.vpcflow* | STATS c = COUNT() BY d = \`network.direction\` | SORT c DESC`,
      "c",
      "d"
    ),
    xyLine(
      "vpc-l1",
      0,
      15,
      48,
      "Flow volume",
      `FROM logs-aws.vpcflow* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Flows" }]
    ),
    xyLine(
      "vpc-l2",
      0,
      25,
      24,
      "Accept vs reject",
      `FROM logs-aws.vpcflow* | STATS acc = SUM(CASE(\`aws.vpcflow.action\` == "ACCEPT", 1, 0)), rej = SUM(CASE(\`aws.vpcflow.action\` == "REJECT", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "acc", label: "ACCEPT" },
        { col: "rej", label: "REJECT" },
      ]
    ),
    xyLine(
      "vpc-l3",
      24,
      25,
      24,
      "Bytes over time",
      `FROM logs-aws.vpcflow* | STATS bts = SUM(\`network.bytes\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "bts", label: "Bytes" }]
    ),
    xyBarH(
      "vpc-b1",
      0,
      35,
      "Top talkers (src)",
      `FROM logs-aws.vpcflow* | STATS c = COUNT() BY s = \`source.ip\` | SORT c DESC | LIMIT 10`,
      "s",
      "c",
      "Flows"
    ),
    dataTable(
      "vpc-t1",
      45,
      "Recent flows",
      `FROM logs-aws.vpcflow* | KEEP \`@timestamp\`, \`aws.vpcflow.vpc_id\`, \`aws.vpcflow.action\`, \`network.transport\`, \`source.ip\`, \`destination.ip\`, \`aws.vpcflow.dstport\`, \`network.bytes\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "aws.vpcflow.vpc_id", label: "VPC" },
        { col: "aws.vpcflow.action", label: "Action" },
        { col: "network.transport", label: "Proto" },
        { col: "source.ip", label: "Src" },
        { col: "destination.ip", label: "Dst" },
        { col: "aws.vpcflow.dstport", label: "Dport" },
        { col: "network.bytes", label: "Bytes" },
      ]
    ),
  ]),
]);

// --- WAFv2 ---
aws.push([
  "installer/aws-custom-dashboards/wafv2-dashboard.json",
  dash("AWS WAFv2 — Rules & Blocks", [
    metric("waf2-k1", 0, 0, "Events", `FROM logs-aws.waf* | STATS Events = COUNT()`),
    metric(
      "waf2-k2",
      12,
      0,
      "Blocked %",
      `FROM logs-aws.waf* | EVAL b = CASE(event.action == "block", 1, 0) | STATS m = AVG(b) | EVAL \`Blocked %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "waf2-k3",
      24,
      0,
      "Blocked (sum)",
      `FROM logs-aws.waf* | STATS \`Blocked\` = SUM(\`aws.waf.metrics.BlockedRequests.sum\`)`
    ),
    metric(
      "waf2-k4",
      36,
      0,
      "Allowed (sum)",
      `FROM logs-aws.waf* | STATS \`Allowed\` = SUM(\`aws.waf.metrics.AllowedRequests.sum\`)`
    ),
    donut(
      "waf2-d1",
      0,
      "Action",
      `FROM logs-aws.waf* | STATS c = COUNT() BY a = event.action | SORT c DESC`,
      "c",
      "a"
    ),
    donut(
      "waf2-d2",
      16,
      "Terminating rule",
      `FROM logs-aws.waf* | STATS c = COUNT() BY r = \`aws.waf.terminatingRuleId\` | SORT c DESC | LIMIT 10`,
      "c",
      "r"
    ),
    donut(
      "waf2-d3",
      32,
      "Outcome",
      `FROM logs-aws.waf* | STATS c = COUNT() BY o = event.outcome | SORT c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "waf2-l1",
      0,
      15,
      48,
      "Requests over time",
      `FROM logs-aws.waf* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "waf2-l2",
      0,
      25,
      24,
      "Allowed vs blocked",
      `FROM logs-aws.waf* | STATS al = SUM(\`aws.waf.metrics.AllowedRequests.sum\`), bl = SUM(\`aws.waf.metrics.BlockedRequests.sum\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "al", label: "Allowed" },
        { col: "bl", label: "Blocked" },
      ]
    ),
    xyLine(
      "waf2-l3",
      24,
      25,
      24,
      "Counted rules",
      `FROM logs-aws.waf* | STATS cnt = SUM(\`aws.waf.metrics.CountedRequests.sum\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "cnt", label: "Counted" }]
    ),
    xyBarH(
      "waf2-b1",
      0,
      35,
      "Top client IPs",
      `FROM logs-aws.waf* | STATS c = COUNT() BY ip = \`source.ip\` | SORT c DESC | LIMIT 10`,
      "ip",
      "c",
      "Requests"
    ),
    dataTable(
      "waf2-t1",
      45,
      "Recent evaluations",
      `FROM logs-aws.waf* | KEEP \`@timestamp\`, event.action, \`aws.waf.terminatingRuleId\`, \`rule.ruleset\`, \`source.ip\`, \`http.request.method\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "event.action", label: "Action" },
        { col: "aws.waf.terminatingRuleId", label: "Rule" },
        { col: "rule.ruleset", label: "Ruleset" },
        { col: "source.ip", label: "Client" },
        { col: "http.request.method", label: "Method" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

const gcp = [];

gcp.push([
  "installer/gcp-custom-dashboards/cloud-audit-logs-dashboard.json",
  dash("GCP Cloud Audit Logs — API Activity", [
    metric("gcpal-k1", 0, 0, "Events", `FROM logs-gcp.audit* | STATS Events = COUNT()`),
    metric(
      "gcpal-k2",
      12,
      0,
      "Denied %",
      `FROM logs-gcp.audit* | EVAL d = CASE(\`gcp.cloud_audit.authorization_decision\` == "DENIED", 1, 0) | STATS m = AVG(d) | EVAL \`Denied %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "gcpal-k3",
      24,
      0,
      "Distinct methods",
      `FROM logs-gcp.audit* | STATS \`Methods\` = COUNT_DISTINCT(\`gcp.cloud_audit.method_name\`)`
    ),
    metric(
      "gcpal-k4",
      36,
      0,
      "Distinct services",
      `FROM logs-gcp.audit* | STATS \`Services\` = COUNT_DISTINCT(\`gcp.cloud_audit.service_name\`)`
    ),
    donut(
      "gcpal-d1",
      0,
      "Authorization",
      `FROM logs-gcp.audit* | STATS c = COUNT() BY a = \`gcp.cloud_audit.authorization_decision\` | SORT c DESC`,
      "c",
      "a"
    ),
    donut(
      "gcpal-d2",
      16,
      "Caller type",
      `FROM logs-gcp.audit* | STATS c = COUNT() BY t = \`gcp.cloud_audit.caller_type\` | SORT c DESC`,
      "c",
      "t"
    ),
    donut(
      "gcpal-d3",
      32,
      "Top methods",
      `FROM logs-gcp.audit* | STATS c = COUNT() BY m = \`gcp.cloud_audit.method_name\` | SORT c DESC | LIMIT 8`,
      "c",
      "m"
    ),
    xyLine(
      "gcpal-l1",
      0,
      15,
      48,
      "API calls over time",
      `FROM logs-gcp.audit* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "gcpal-l2",
      0,
      25,
      24,
      "Denied vs allowed",
      `FROM logs-gcp.audit* | STATS den = SUM(CASE(\`gcp.cloud_audit.authorization_decision\` == "DENIED", 1, 0)), ok = SUM(CASE(\`gcp.cloud_audit.authorization_decision\` == "ALLOWED", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "den", label: "Denied" },
        { col: "ok", label: "Allowed" },
      ]
    ),
    xyLine(
      "gcpal-l3",
      24,
      25,
      24,
      "Failure outcome",
      `FROM logs-gcp.audit* | STATS bad = SUM(CASE(event.outcome == "failure", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "bad", label: "Failures" }]
    ),
    xyBarH(
      "gcpal-b1",
      0,
      35,
      "Top principals",
      `FROM logs-gcp.audit* | STATS c = COUNT() BY u = \`user.name\` | SORT c DESC | LIMIT 10`,
      "u",
      "c",
      "Calls"
    ),
    dataTable(
      "gcpal-t1",
      45,
      "Recent audit events",
      `FROM logs-gcp.audit* | KEEP \`@timestamp\`, \`gcp.cloud_audit.service_name\`, \`gcp.cloud_audit.method_name\`, \`gcp.cloud_audit.resource_name\`, \`gcp.cloud_audit.authorization_decision\`, \`user.name\`, \`gcp.cloud_audit.caller_ip\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.cloud_audit.service_name", label: "Service" },
        { col: "gcp.cloud_audit.method_name", label: "Method" },
        { col: "gcp.cloud_audit.resource_name", label: "Resource" },
        { col: "gcp.cloud_audit.authorization_decision", label: "Authz" },
        { col: "user.name", label: "Principal" },
        { col: "gcp.cloud_audit.caller_ip", label: "IP" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

gcp.push([
  "installer/gcp-custom-dashboards/cloud-dns-dashboard.json",
  dash("GCP Cloud DNS — Queries & Errors", [
    metric("gcpdns-k1", 0, 0, "Queries", `FROM logs-gcp.dns* | STATS Queries = COUNT()`),
    metric(
      "gcpdns-k2",
      12,
      0,
      "NXDOMAIN %",
      `FROM logs-gcp.dns* | EVAL nx = CASE(\`gcp.cloud_dns.response_code\` == "NXDOMAIN", 1, 0) | STATS m = AVG(nx) | EVAL \`NXDOMAIN %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "gcpdns-k3",
      24,
      0,
      "Avg latency (ms)",
      `FROM logs-gcp.dns* | STATS \`Avg ms\` = ROUND(AVG(event.duration) / 1000000.0, 2)`
    ),
    metric(
      "gcpdns-k4",
      36,
      0,
      "Distinct zones",
      `FROM logs-gcp.dns* | STATS \`Zones\` = COUNT_DISTINCT(\`gcp.cloud_dns.zone_name\`)`
    ),
    donut(
      "gcpdns-d1",
      0,
      "Response code",
      `FROM logs-gcp.dns* | STATS c = COUNT() BY r = \`gcp.cloud_dns.response_code\` | SORT c DESC`,
      "c",
      "r"
    ),
    donut(
      "gcpdns-d2",
      16,
      "Record type",
      `FROM logs-gcp.dns* | STATS c = COUNT() BY t = \`gcp.cloud_dns.query_type\` | SORT c DESC | LIMIT 10`,
      "c",
      "t"
    ),
    donut(
      "gcpdns-d3",
      32,
      "Protocol",
      `FROM logs-gcp.dns* | STATS c = COUNT() BY p = \`gcp.cloud_dns.protocol\` | SORT c DESC`,
      "c",
      "p"
    ),
    xyLine(
      "gcpdns-l1",
      0,
      15,
      48,
      "Queries over time",
      `FROM logs-gcp.dns* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Queries" }]
    ),
    xyLine(
      "gcpdns-l2",
      0,
      25,
      24,
      "Errors vs success",
      `FROM logs-gcp.dns* | STATS bad = SUM(CASE(event.outcome == "failure", 1, 0)), ok = SUM(CASE(event.outcome == "success", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "bad", label: "Failures" },
        { col: "ok", label: "Success" },
      ]
    ),
    xyLine(
      "gcpdns-l3",
      24,
      25,
      24,
      "Avg latency",
      `FROM logs-gcp.dns* | STATS lat = AVG(event.duration) / 1000000.0 BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "lat", label: "Ms" }]
    ),
    xyBarH(
      "gcpdns-b1",
      0,
      35,
      "Top QNAMEs",
      `FROM logs-gcp.dns* | STATS c = COUNT() BY q = \`gcp.cloud_dns.query_name\` | SORT c DESC | LIMIT 10`,
      "q",
      "c",
      "Queries"
    ),
    dataTable(
      "gcpdns-t1",
      45,
      "Recent queries",
      `FROM logs-gcp.dns* | KEEP \`@timestamp\`, \`gcp.cloud_dns.query_name\`, \`gcp.cloud_dns.query_type\`, \`gcp.cloud_dns.response_code\`, \`gcp.cloud_dns.source_ip\`, \`gcp.cloud_dns.zone_name\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.cloud_dns.query_name", label: "QNAME" },
        { col: "gcp.cloud_dns.query_type", label: "Type" },
        { col: "gcp.cloud_dns.response_code", label: "RCODE" },
        { col: "gcp.cloud_dns.source_ip", label: "Client" },
        { col: "gcp.cloud_dns.zone_name", label: "Zone" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

gcp.push([
  "installer/gcp-custom-dashboards/cloud-lb-dashboard.json",
  dash("GCP Cloud Load Balancing — Requests & Latency", [
    metric("gcplb-k1", 0, 0, "Requests", `FROM logs-gcp.loadbalancing* | STATS Requests = COUNT()`),
    metric(
      "gcplb-k2",
      12,
      0,
      "5xx %",
      `FROM logs-gcp.loadbalancing* | EVAL s5 = CASE(\`gcp.cloud_lb.response_code\` >= 500, 1, 0) | STATS m = AVG(s5) | EVAL \`5xx %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "gcplb-k3",
      24,
      0,
      "Avg latency (ms)",
      `FROM logs-gcp.loadbalancing* | STATS \`Avg ms\` = ROUND(AVG(\`gcp.cloud_lb.latency_ms\`), 1)`
    ),
    metric(
      "gcplb-k4",
      36,
      0,
      "Error %",
      `FROM logs-gcp.loadbalancing* | EVAL e = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(e) | EVAL \`Err %\` = ROUND(m * 100, 1)`
    ),
    donut(
      "gcplb-d1",
      0,
      "HTTP status",
      `FROM logs-gcp.loadbalancing* | STATS c = COUNT() BY s = \`gcp.cloud_lb.response_code\` | SORT c DESC | LIMIT 10`,
      "c",
      "s"
    ),
    donut(
      "gcplb-d2",
      16,
      "Backend service",
      `FROM logs-gcp.loadbalancing* | STATS c = COUNT() BY be = \`gcp.cloud_lb.backend_service\` | SORT c DESC | LIMIT 10`,
      "c",
      "be"
    ),
    donut(
      "gcplb-d3",
      32,
      "Outcome",
      `FROM logs-gcp.loadbalancing* | STATS c = COUNT() BY o = event.outcome | SORT c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "gcplb-l1",
      0,
      15,
      48,
      "Requests over time",
      `FROM logs-gcp.loadbalancing* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Requests" }]
    ),
    xyLine(
      "gcplb-l2",
      0,
      25,
      24,
      "Latency (ms)",
      `FROM logs-gcp.loadbalancing* | STATS lat = AVG(\`gcp.cloud_lb.latency_ms\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "lat", label: "Ms" }]
    ),
    xyLine(
      "gcplb-l3",
      24,
      25,
      24,
      "5xx count",
      `FROM logs-gcp.loadbalancing* | STATS e5 = SUM(CASE(\`gcp.cloud_lb.response_code\` >= 500, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "e5", label: "5xx" }]
    ),
    xyBarH(
      "gcplb-b1",
      0,
      35,
      "Top URL paths",
      `FROM logs-gcp.loadbalancing* | STATS c = COUNT() BY p = \`gcp.cloud_lb.url_path\` | SORT c DESC | LIMIT 10`,
      "p",
      "c",
      "Hits"
    ),
    dataTable(
      "gcplb-t1",
      45,
      "Recent requests",
      `FROM logs-gcp.loadbalancing* | KEEP \`@timestamp\`, \`gcp.cloud_lb.backend_service\`, \`gcp.cloud_lb.request_method\`, \`gcp.cloud_lb.response_code\`, \`gcp.cloud_lb.latency_ms\`, \`gcp.cloud_lb.client_ip\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "gcp.cloud_lb.backend_service", label: "Backend" },
        { col: "gcp.cloud_lb.request_method", label: "Method" },
        { col: "gcp.cloud_lb.response_code", label: "Status" },
        { col: "gcp.cloud_lb.latency_ms", label: "Ms" },
        { col: "gcp.cloud_lb.client_ip", label: "Client" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

const azure = [];

azure.push([
  "installer/azure-custom-dashboards/activity-log-dashboard.json",
  dash("Azure Activity Log — Operations & Failures", [
    metric("azact-k1", 0, 0, "Events", `FROM logs-azure.activity_log* | STATS Events = COUNT()`),
    metric(
      "azact-k2",
      12,
      0,
      "Failure %",
      `FROM logs-azure.activity_log* | EVAL f = CASE(to_lower(resultType) != "success", 1, 0) | STATS m = AVG(f) | EVAL \`Failure %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "azact-k3",
      24,
      0,
      "Distinct ops",
      `FROM logs-azure.activity_log* | STATS \`Operations\` = COUNT_DISTINCT(operationName)`
    ),
    metric(
      "azact-k4",
      36,
      0,
      "Avg duration (ms)",
      `FROM logs-azure.activity_log* | STATS \`Avg ms\` = ROUND(AVG(\`azure.activity_log.duration_ms\`), 0)`
    ),
    donut(
      "azact-d1",
      0,
      "Result",
      `FROM logs-azure.activity_log* | STATS c = COUNT() BY r = resultType | SORT c DESC | LIMIT 10`,
      "c",
      "r"
    ),
    donut(
      "azact-d2",
      16,
      "Category",
      `FROM logs-azure.activity_log* | STATS c = COUNT() BY cat = category | SORT c DESC | LIMIT 10`,
      "c",
      "cat"
    ),
    donut(
      "azact-d3",
      32,
      "Outcome",
      `FROM logs-azure.activity_log* | STATS c = COUNT() BY o = event.outcome | SORT c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "azact-l1",
      0,
      15,
      48,
      "Operations over time",
      `FROM logs-azure.activity_log* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "azact-l2",
      0,
      25,
      24,
      "Failures over time",
      `FROM logs-azure.activity_log* | STATS bad = SUM(CASE(to_lower(resultType) != "success", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "bad", label: "Failures" }]
    ),
    xyLine(
      "azact-l3",
      24,
      25,
      24,
      "Avg duration",
      `FROM logs-azure.activity_log* | STATS d = AVG(\`azure.activity_log.duration_ms\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "d", label: "Ms" }]
    ),
    xyBarH(
      "azact-b1",
      0,
      35,
      "Top operations",
      `FROM logs-azure.activity_log* | STATS c = COUNT() BY op = operationName | SORT c DESC | LIMIT 10`,
      "op",
      "c",
      "Count"
    ),
    dataTable(
      "azact-t1",
      45,
      "Recent events",
      `FROM logs-azure.activity_log* | KEEP \`@timestamp\`, operationName, category, resultType, \`callerIpAddress\`, \`azure.activity_log.resource_name\`, correlationId | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "operationName", label: "Operation" },
        { col: "category", label: "Category" },
        { col: "resultType", label: "Result" },
        { col: "callerIpAddress", label: "Caller IP" },
        { col: "azure.activity_log.resource_name", label: "Resource" },
        { col: "correlationId", label: "Correlation" },
      ]
    ),
  ]),
]);

azure.push([
  "installer/azure-custom-dashboards/application-gateway-dashboard.json",
  dash("Azure Application Gateway — Traffic & WAF", [
    metric(
      "azagw-k1",
      0,
      0,
      "Events",
      `FROM logs-azure.application_gateway* | STATS Events = COUNT()`
    ),
    metric(
      "azagw-k2",
      12,
      0,
      "Failure %",
      `FROM logs-azure.application_gateway* | EVAL f = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(f) | EVAL \`Failure %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "azagw-k3",
      24,
      0,
      "Avg latency (ms)",
      `FROM logs-azure.application_gateway* | STATS \`Avg ms\` = ROUND(AVG(\`azure.application_gateway.latency_ms\`), 1)`
    ),
    metric(
      "azagw-k4",
      36,
      0,
      "5xx count",
      `FROM logs-azure.application_gateway* | STATS \`5xx\` = SUM(CASE(\`azure.application_gateway.http_status\` >= 500, 1, 0))`
    ),
    donut(
      "azagw-d1",
      0,
      "HTTP status",
      `FROM logs-azure.application_gateway* | STATS c = COUNT() BY s = \`azure.application_gateway.http_status\` | SORT c DESC | LIMIT 10`,
      "c",
      "s"
    ),
    donut(
      "azagw-d2",
      16,
      "Gateway",
      `FROM logs-azure.application_gateway* | STATS c = COUNT() BY g = \`azure.application_gateway.name\` | SORT c DESC | LIMIT 8`,
      "c",
      "g"
    ),
    donut(
      "azagw-d3",
      32,
      "Log category",
      `FROM logs-azure.application_gateway* | STATS c = COUNT() BY cat = category | SORT c DESC | LIMIT 8`,
      "c",
      "cat"
    ),
    xyLine(
      "azagw-l1",
      0,
      15,
      48,
      "Events over time",
      `FROM logs-azure.application_gateway* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "azagw-l2",
      0,
      25,
      24,
      "Latency (ms)",
      `FROM logs-azure.application_gateway* | STATS lat = AVG(\`azure.application_gateway.latency_ms\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "lat", label: "Ms" }]
    ),
    xyLine(
      "azagw-l3",
      24,
      25,
      24,
      "Failures",
      `FROM logs-azure.application_gateway* | STATS bad = SUM(CASE(event.outcome == "failure", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "bad", label: "Failures" }]
    ),
    xyBarH(
      "azagw-b1",
      0,
      35,
      "Top backends",
      `FROM logs-azure.application_gateway* | STATS c = COUNT() BY h = \`azure.application_gateway.backend_host\` | SORT c DESC | LIMIT 10`,
      "h",
      "c",
      "Requests"
    ),
    dataTable(
      "azagw-t1",
      45,
      "Recent",
      `FROM logs-azure.application_gateway* | KEEP \`@timestamp\`, \`azure.application_gateway.name\`, category, operationName, \`azure.application_gateway.http_status\`, \`azure.application_gateway.latency_ms\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.application_gateway.name", label: "Gateway" },
        { col: "category", label: "Category" },
        { col: "operationName", label: "Operation" },
        { col: "azure.application_gateway.http_status", label: "HTTP" },
        { col: "azure.application_gateway.latency_ms", label: "Ms" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

azure.push([
  "installer/azure-custom-dashboards/azure-firewall-dashboard.json",
  dash("Azure Firewall — Allow vs Deny", [
    metric("azfw-k1", 0, 0, "Events", `FROM logs-azure.firewall* | STATS Events = COUNT()`),
    metric(
      "azfw-k2",
      12,
      0,
      "Denied %",
      `FROM logs-azure.firewall* | EVAL d = CASE(to_lower(\`azure.firewall.action\`) == "deny", 1, 0) | STATS m = AVG(d) | EVAL \`Denied %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "azfw-k3",
      24,
      0,
      "Distinct firewalls",
      `FROM logs-azure.firewall* | STATS \`Firewalls\` = COUNT_DISTINCT(\`azure.firewall.name\`)`
    ),
    metric(
      "azfw-k4",
      36,
      0,
      "DNS proxy events",
      `FROM logs-azure.firewall* | STATS \`DNS\` = SUM(CASE(category == "AzureFirewallDnsProxy", 1, 0))`
    ),
    donut(
      "azfw-d1",
      0,
      "Action",
      `FROM logs-azure.firewall* | STATS c = COUNT() BY a = \`azure.firewall.action\` | SORT c DESC`,
      "c",
      "a"
    ),
    donut(
      "azfw-d2",
      16,
      "Log category",
      `FROM logs-azure.firewall* | STATS c = COUNT() BY cat = category | SORT c DESC | LIMIT 10`,
      "c",
      "cat"
    ),
    donut(
      "azfw-d3",
      32,
      "Rule collection",
      `FROM logs-azure.firewall* | STATS c = COUNT() BY rc = \`azure.firewall.rule_collection\` | SORT c DESC | LIMIT 8`,
      "c",
      "rc"
    ),
    xyLine(
      "azfw-l1",
      0,
      15,
      48,
      "Events over time",
      `FROM logs-azure.firewall* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "azfw-l2",
      0,
      25,
      24,
      "Allow vs deny",
      `FROM logs-azure.firewall* | STATS al = SUM(CASE(to_lower(\`azure.firewall.action\`) == "allow", 1, 0)), dn = SUM(CASE(to_lower(\`azure.firewall.action\`) == "deny", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "al", label: "Allow" },
        { col: "dn", label: "Deny" },
      ]
    ),
    xyLine(
      "azfw-l3",
      24,
      25,
      24,
      "Threat intel hits",
      `FROM logs-azure.firewall* | STATS ti = SUM(CASE(category == "AzureFirewallThreatIntel", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "ti", label: "ThreatIntel" }]
    ),
    xyBarH(
      "azfw-b1",
      0,
      35,
      "Top destination ports",
      `FROM logs-azure.firewall* | STATS c = COUNT() BY p = \`azure.firewall.dest_port\` | SORT c DESC | LIMIT 10`,
      "p",
      "c",
      "Flows"
    ),
    dataTable(
      "azfw-t1",
      45,
      "Recent",
      `FROM logs-azure.firewall* | KEEP \`@timestamp\`, \`azure.firewall.name\`, category, \`azure.firewall.action\`, \`azure.firewall.source_ip\`, \`azure.firewall.dest_ip\`, \`azure.firewall.dest_port\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.firewall.name", label: "Firewall" },
        { col: "category", label: "Category" },
        { col: "azure.firewall.action", label: "Action" },
        { col: "azure.firewall.source_ip", label: "Src" },
        { col: "azure.firewall.dest_ip", label: "Dst" },
        { col: "azure.firewall.dest_port", label: "Dport" },
      ]
    ),
  ]),
]);

azure.push([
  "installer/azure-custom-dashboards/entra-id-dashboard.json",
  dash("Microsoft Entra ID — Sign-ins & Risk", [
    metric("azent-k1", 0, 0, "Events", `FROM logs-azure.entra_id* | STATS Events = COUNT()`),
    metric(
      "azent-k2",
      12,
      0,
      "Failed %",
      `FROM logs-azure.entra_id* | EVAL f = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(f) | EVAL \`Failed %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "azent-k3",
      24,
      0,
      "Distinct users",
      `FROM logs-azure.entra_id* | STATS \`Users\` = COUNT_DISTINCT(\`azure.entra_id.user\`)`
    ),
    metric(
      "azent-k4",
      36,
      0,
      "MFA not success",
      `FROM logs-azure.entra_id* | STATS \`MFA issues\` = SUM(CASE(\`azure.entra_id.conditional_access\` == "Failure", 1, 0))`
    ),
    donut(
      "azent-d1",
      0,
      "Category",
      `FROM logs-azure.entra_id* | STATS c = COUNT() BY cat = \`azure.entra_id.category\` | SORT c DESC | LIMIT 8`,
      "c",
      "cat"
    ),
    donut(
      "azent-d2",
      16,
      "Result",
      `FROM logs-azure.entra_id* | STATS c = COUNT() BY r = \`azure.entra_id.result\` | SORT c DESC`,
      "c",
      "r"
    ),
    donut(
      "azent-d3",
      32,
      "Conditional Access",
      `FROM logs-azure.entra_id* | STATS c = COUNT() BY ca = \`azure.entra_id.conditional_access\` | SORT c DESC | LIMIT 8`,
      "c",
      "ca"
    ),
    xyLine(
      "azent-l1",
      0,
      15,
      48,
      "Sign-ins over time",
      `FROM logs-azure.entra_id* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "azent-l2",
      0,
      25,
      24,
      "Failures",
      `FROM logs-azure.entra_id* | STATS bad = SUM(CASE(event.outcome == "failure", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "bad", label: "Failures" }]
    ),
    xyLine(
      "azent-l3",
      24,
      25,
      24,
      "Risky sessions",
      `FROM logs-azure.entra_id* | STATS rsk = SUM(CASE(\`azure.entra_id.category\` == "RiskyUsers", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "rsk", label: "Risk" }]
    ),
    xyBarH(
      "azent-b1",
      0,
      35,
      "Top users",
      `FROM logs-azure.entra_id* | STATS c = COUNT() BY u = \`azure.entra_id.user\` | SORT c DESC | LIMIT 10`,
      "u",
      "c",
      "Events"
    ),
    dataTable(
      "azent-t1",
      45,
      "Recent",
      `FROM logs-azure.entra_id* | KEEP \`@timestamp\`, \`azure.entra_id.category\`, \`azure.entra_id.user\`, \`azure.entra_id.result\`, \`azure.entra_id.conditional_access\`, \`azure.entra_id.ip_address\`, event.outcome | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.entra_id.category", label: "Category" },
        { col: "azure.entra_id.user", label: "User" },
        { col: "azure.entra_id.result", label: "Result" },
        { col: "azure.entra_id.conditional_access", label: "CA" },
        { col: "azure.entra_id.ip_address", label: "IP" },
        { col: "event.outcome", label: "Outcome" },
      ]
    ),
  ]),
]);

azure.push([
  "installer/azure-custom-dashboards/m365-dashboard.json",
  dash("Microsoft 365 — Audit & Workloads", [
    metric("azm365-k1", 0, 0, "Events", `FROM logs-azure.microsoft_365* | STATS Events = COUNT()`),
    metric(
      "azm365-k2",
      12,
      0,
      "Failed %",
      `FROM logs-azure.microsoft_365* | EVAL f = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(f) | EVAL \`Failed %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "azm365-k3",
      24,
      0,
      "Workloads",
      `FROM logs-azure.microsoft_365* | STATS \`Workloads\` = COUNT_DISTINCT(\`azure.microsoft_365.workload\`)`
    ),
    metric(
      "azm365-k4",
      36,
      0,
      "Record types",
      `FROM logs-azure.microsoft_365* | STATS \`Types\` = COUNT_DISTINCT(\`azure.microsoft_365.record_type\`)`
    ),
    donut(
      "azm365-d1",
      0,
      "Workload",
      `FROM logs-azure.microsoft_365* | STATS c = COUNT() BY w = \`azure.microsoft_365.workload\` | SORT c DESC | LIMIT 10`,
      "c",
      "w"
    ),
    donut(
      "azm365-d2",
      16,
      "Record type",
      `FROM logs-azure.microsoft_365* | STATS c = COUNT() BY t = \`azure.microsoft_365.record_type\` | SORT c DESC | LIMIT 10`,
      "c",
      "t"
    ),
    donut(
      "azm365-d3",
      32,
      "Result",
      `FROM logs-azure.microsoft_365* | STATS c = COUNT() BY r = \`azure.microsoft_365.result\` | SORT c DESC`,
      "c",
      "r"
    ),
    xyLine(
      "azm365-l1",
      0,
      15,
      48,
      "Audit volume",
      `FROM logs-azure.microsoft_365* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "azm365-l2",
      0,
      25,
      24,
      "Teams vs Exchange",
      `FROM logs-azure.microsoft_365* | STATS teams = SUM(CASE(\`azure.microsoft_365.workload\` == "MicrosoftTeams", 1, 0)), ex = SUM(CASE(\`azure.microsoft_365.workload\` == "Exchange", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "teams", label: "Teams" },
        { col: "ex", label: "Exchange" },
      ]
    ),
    xyLine(
      "azm365-l3",
      24,
      25,
      24,
      "OneDrive activity",
      `FROM logs-azure.microsoft_365* | STATS od = SUM(CASE(\`azure.microsoft_365.workload\` == "OneDrive", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "od", label: "OneDrive" }]
    ),
    xyBarH(
      "azm365-b1",
      0,
      35,
      "Top users",
      `FROM logs-azure.microsoft_365* | STATS c = COUNT() BY u = \`azure.microsoft_365.user_id\` | SORT c DESC | LIMIT 10`,
      "u",
      "c",
      "Events"
    ),
    dataTable(
      "azm365-t1",
      45,
      "Recent",
      `FROM logs-azure.microsoft_365* | KEEP \`@timestamp\`, \`azure.microsoft_365.workload\`, \`azure.microsoft_365.record_type\`, \`azure.microsoft_365.user_id\`, \`azure.microsoft_365.result\`, \`azure.microsoft_365.client_ip\` | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.microsoft_365.workload", label: "Workload" },
        { col: "azure.microsoft_365.record_type", label: "Record" },
        { col: "azure.microsoft_365.user_id", label: "User" },
        { col: "azure.microsoft_365.result", label: "Result" },
        { col: "azure.microsoft_365.client_ip", label: "IP" },
      ]
    ),
  ]),
]);

azure.push([
  "installer/azure-custom-dashboards/monitor-dashboard.json",
  dash("Azure Monitor — Alerts & Diagnostics", [
    metric("azmon-k1", 0, 0, "Events", `FROM logs-azure.monitor* | STATS Events = COUNT()`),
    metric(
      "azmon-k2",
      12,
      0,
      "Failure %",
      `FROM logs-azure.monitor* | EVAL f = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(f) | EVAL \`Failure %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "azmon-k3",
      24,
      0,
      "Distinct resources",
      `FROM logs-azure.monitor* | STATS \`Resources\` = COUNT_DISTINCT(\`azure.monitor.resource_name\`)`
    ),
    metric(
      "azmon-k4",
      36,
      0,
      "Avg duration (ms)",
      `FROM logs-azure.monitor* | STATS \`Avg ms\` = ROUND(AVG(\`azure.monitor.duration_ms\`), 0)`
    ),
    donut(
      "azmon-d1",
      0,
      "Category",
      `FROM logs-azure.monitor* | STATS c = COUNT() BY cat = \`azure.monitor.category\` | SORT c DESC | LIMIT 10`,
      "c",
      "cat"
    ),
    donut(
      "azmon-d2",
      16,
      "Result",
      `FROM logs-azure.monitor* | STATS c = COUNT() BY r = \`azure.monitor.status\` | SORT c DESC`,
      "c",
      "r"
    ),
    donut(
      "azmon-d3",
      32,
      "Outcome",
      `FROM logs-azure.monitor* | STATS c = COUNT() BY o = event.outcome | SORT c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "azmon-l1",
      0,
      15,
      48,
      "Events over time",
      `FROM logs-azure.monitor* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "azmon-l2",
      0,
      25,
      24,
      "HTTP status mix",
      `FROM logs-azure.monitor* | STATS s2 = SUM(CASE(\`azure.monitor.http_status\` >= 200 AND \`azure.monitor.http_status\` < 300, 1, 0)), s4 = SUM(CASE(\`azure.monitor.http_status\` >= 400, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [
        { col: "s2", label: "2xx" },
        { col: "s4", label: "4xx+" },
      ]
    ),
    xyLine(
      "azmon-l3",
      24,
      25,
      24,
      "Alert category",
      `FROM logs-azure.monitor* | STATS d = SUM(CASE(category == "Alert", 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "d", label: "Alerts" }]
    ),
    xyBarH(
      "azmon-b1",
      0,
      35,
      "Top operations",
      `FROM logs-azure.monitor* | STATS c = COUNT() BY op = operationName | SORT c DESC | LIMIT 10`,
      "op",
      "c",
      "Count"
    ),
    dataTable(
      "azmon-t1",
      45,
      "Recent",
      `FROM logs-azure.monitor* | KEEP \`@timestamp\`, operationName, \`azure.monitor.category\`, \`azure.monitor.status\`, \`azure.monitor.http_status\`, \`azure.monitor.duration_ms\`, correlationId | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "operationName", label: "Operation" },
        { col: "azure.monitor.category", label: "Category" },
        { col: "azure.monitor.status", label: "Status" },
        { col: "azure.monitor.http_status", label: "HTTP" },
        { col: "azure.monitor.duration_ms", label: "Ms" },
        { col: "correlationId", label: "Correlation" },
      ]
    ),
  ]),
]);

azure.push([
  "installer/azure-custom-dashboards/policy-dashboard.json",
  dash("Azure Policy — Compliance & Enforcement", [
    metric("azpol-k1", 0, 0, "Events", `FROM logs-azure.policy* | STATS Events = COUNT()`),
    metric(
      "azpol-k2",
      12,
      0,
      "Non-success %",
      `FROM logs-azure.policy* | EVAL f = CASE(to_lower(\`azure.policy.status\`) != "success", 1, 0) | STATS m = AVG(f) | EVAL \`Non-success %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "azpol-k3",
      24,
      0,
      "Assignments",
      `FROM logs-azure.policy* | STATS \`Assignments\` = COUNT_DISTINCT(\`azure.policy.resource_name\`)`
    ),
    metric(
      "azpol-k4",
      36,
      0,
      "Avg duration (ms)",
      `FROM logs-azure.policy* | STATS \`Avg ms\` = ROUND(AVG(\`azure.policy.duration_ms\`), 0)`
    ),
    donut(
      "azpol-d1",
      0,
      "Status",
      `FROM logs-azure.policy* | STATS c = COUNT() BY s = \`azure.policy.status\` | SORT c DESC`,
      "c",
      "s"
    ),
    donut(
      "azpol-d2",
      16,
      "Category",
      `FROM logs-azure.policy* | STATS c = COUNT() BY cat = \`azure.policy.category\` | SORT c DESC | LIMIT 8`,
      "c",
      "cat"
    ),
    donut(
      "azpol-d3",
      32,
      "Outcome",
      `FROM logs-azure.policy* | STATS c = COUNT() BY o = event.outcome | SORT c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "azpol-l1",
      0,
      15,
      48,
      "Evaluations over time",
      `FROM logs-azure.policy* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "azpol-l2",
      0,
      25,
      24,
      "HTTP 4xx+",
      `FROM logs-azure.policy* | STATS e = SUM(CASE(\`azure.policy.http_status\` >= 400, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "e", label: "Errors" }]
    ),
    xyLine(
      "azpol-l3",
      24,
      25,
      24,
      "Duration (ms)",
      `FROM logs-azure.policy* | STATS d = AVG(\`azure.policy.duration_ms\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "d", label: "Ms" }]
    ),
    xyBarH(
      "azpol-b1",
      0,
      35,
      "Top policy resources",
      `FROM logs-azure.policy* | STATS c = COUNT() BY r = \`azure.policy.resource_name\` | SORT c DESC | LIMIT 10`,
      "r",
      "c",
      "Events"
    ),
    dataTable(
      "azpol-t1",
      45,
      "Recent",
      `FROM logs-azure.policy* | KEEP \`@timestamp\`, operationName, \`azure.policy.resource_name\`, \`azure.policy.status\`, \`azure.policy.http_status\`, \`azure.policy.duration_ms\`, correlationId | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "operationName", label: "Operation" },
        { col: "azure.policy.resource_name", label: "Resource" },
        { col: "azure.policy.status", label: "Status" },
        { col: "azure.policy.http_status", label: "HTTP" },
        { col: "azure.policy.duration_ms", label: "Ms" },
        { col: "correlationId", label: "Correlation" },
      ]
    ),
  ]),
]);

azure.push([
  "installer/azure-custom-dashboards/spring-apps-dashboard.json",
  dash("Azure Spring Apps — Operations", [
    metric("azspr-k1", 0, 0, "Events", `FROM logs-azure.spring_apps* | STATS Events = COUNT()`),
    metric(
      "azspr-k2",
      12,
      0,
      "Failure %",
      `FROM logs-azure.spring_apps* | EVAL f = CASE(event.outcome == "failure", 1, 0) | STATS m = AVG(f) | EVAL \`Failure %\` = ROUND(m * 100, 1)`
    ),
    metric(
      "azspr-k3",
      24,
      0,
      "Avg duration (ms)",
      `FROM logs-azure.spring_apps* | STATS \`Avg ms\` = ROUND(AVG(\`azure.spring_apps.duration_ms\`), 0)`
    ),
    metric(
      "azspr-k4",
      36,
      0,
      "5xx count",
      `FROM logs-azure.spring_apps* | STATS \`5xx\` = SUM(CASE(\`azure.spring_apps.http_status\` >= 500, 1, 0))`
    ),
    donut(
      "azspr-d1",
      0,
      "HTTP status",
      `FROM logs-azure.spring_apps* | STATS c = COUNT() BY s = \`azure.spring_apps.http_status\` | SORT c DESC | LIMIT 10`,
      "c",
      "s"
    ),
    donut(
      "azspr-d2",
      16,
      "Category",
      `FROM logs-azure.spring_apps* | STATS c = COUNT() BY cat = \`azure.spring_apps.category\` | SORT c DESC | LIMIT 8`,
      "c",
      "cat"
    ),
    donut(
      "azspr-d3",
      32,
      "Outcome",
      `FROM logs-azure.spring_apps* | STATS c = COUNT() BY o = event.outcome | SORT c DESC`,
      "c",
      "o"
    ),
    xyLine(
      "azspr-l1",
      0,
      15,
      48,
      "Operations over time",
      `FROM logs-azure.spring_apps* | STATS c = COUNT() BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "c", label: "Events" }]
    ),
    xyLine(
      "azspr-l2",
      0,
      25,
      24,
      "HTTP 4xx+ over time",
      `FROM logs-azure.spring_apps* | STATS err = SUM(CASE(\`azure.spring_apps.http_status\` >= 400, 1, 0)) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "err", label: "4xx+" }]
    ),
    xyLine(
      "azspr-l3",
      24,
      25,
      24,
      "Avg latency",
      `FROM logs-azure.spring_apps* | STATS lat = AVG(\`azure.spring_apps.duration_ms\`) BY b = ${BUCKET} | SORT b`,
      "b",
      [{ col: "lat", label: "Ms" }]
    ),
    xyBarH(
      "azspr-b1",
      0,
      35,
      "Top Spring services",
      `FROM logs-azure.spring_apps* | STATS c = COUNT() BY n = \`azure.spring_apps.resource_name\` | SORT c DESC | LIMIT 10`,
      "n",
      "c",
      "Events"
    ),
    dataTable(
      "azspr-t1",
      45,
      "Recent",
      `FROM logs-azure.spring_apps* | KEEP \`@timestamp\`, \`azure.spring_apps.resource_name\`, operationName, \`azure.spring_apps.http_status\`, \`azure.spring_apps.duration_ms\`, event.outcome, correlationId | SORT \`@timestamp\` DESC | LIMIT 100`,
      [
        { col: "`@timestamp`", label: "Time" },
        { col: "azure.spring_apps.resource_name", label: "Service" },
        { col: "operationName", label: "Operation" },
        { col: "azure.spring_apps.http_status", label: "HTTP" },
        { col: "azure.spring_apps.duration_ms", label: "Ms" },
        { col: "event.outcome", label: "Outcome" },
        { col: "correlationId", label: "Correlation" },
      ]
    ),
  ]),
]);

const all = [...aws, ...gcp, ...azure];
for (const [rel, body] of all) {
  const fp = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, body + "\n", "utf8");
}
console.log("Wrote", all.length, "dashboard(s)");
