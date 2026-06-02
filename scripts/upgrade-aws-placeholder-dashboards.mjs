/**
 * Upgrades 4-panel AWS placeholder dashboards to 12-panel ES|QL layouts (ECS template).
 * Run: node scripts/upgrade-aws-placeholder-dashboards.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DASH_DIR = path.join(ROOT, "installer/aws-custom-dashboards");
const SAMPLES_DIR = path.join(ROOT, "samples/aws/logs");
const GEN_DIR = path.join(ROOT, "src/aws/generators");
const SKIP = new Set(["rds", "ec2", "dynamodb", "ecs", "sqs", "sns", "kinesis"]);
const BUCKET = "BUCKET(`@timestamp````@timestamp`, 75, ?_tstart, ?_tend)";

const DISPLAY_NAMES = {
  accessanalyzer: "IAM Access Analyzer",
  acm: "ACM",
  amazonmq: "Amazon MQ",
  auroradsql: "Aurora DSQL",
  apigateway: "API Gateway",
  iotcore: "IoT Core",
  iotdefender: "IoT Device Defender",
  iotevents: "IoT Events",
  iotsitewise: "IoT SiteWise",
  iotanalytics: "IoT Analytics",
  vpcipam: "VPC IPAM",
  waf: "AWS WAF Classic",
  wafv2: "AWS WAFv2",
  ssm: "Systems Manager",
  ecr: "ECR",
  ebs: "EBS",
  efs: "EFS",
  kms: "KMS",
  msk: "Amazon MSK",
  eks: "EKS",
  rds: "RDS",
  ecs: "ECS",
  ec2: "EC2",
  sns: "SNS",
  sqs: "SQS",
  ml: "ML",
};

function displayName(slug) {
  if (DISPLAY_NAMES[slug]) return DISPLAY_NAMES[slug];
  return slug
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/-/g, " ")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function backtick(field) {
  if (field.startsWith("`")) return field;
  if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field) && !field.includes("@")) return `\`${field}\``;
  return `\`${field}\``;
}

function metric(uid, x, col, query) {
  return {
    type: "lens",
    uid,
    grid: { x, y: 0, w: 12, h: 5 },
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

function donut(uid, x, y, w, title, query, metricCol, groupCol) {
  return {
    type: "lens",
    uid,
    grid: { x, y, w, h: 8 },
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
    grid: { x, y, w, h: 8 },
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

function xyBarH(uid, x, y, w, title, query, xCol, yCol, yLabel) {
  return {
    type: "lens",
    uid,
    grid: { x, y, w, h: 8 },
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
    grid: { x: 0, y, w: 48, h: 10 },
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

const DIM_PRIORITY = [
  "operation",
  "status",
  "action",
  "event_type",
  "finding_type",
  "type",
  "state",
  "category",
  "name",
  "queue_name",
  "cluster",
  "resource_type",
  "analyzer_name",
  "job_queue",
  "key_alias",
];

function normKey(k) {
  return k.replace(/_/g, "").toLowerCase();
}

function findAwsBlockKey(serviceSlug, aws) {
  const skip = new Set(["dimensions", "s3", "cloudwatch"]);
  const keys = Object.keys(aws).filter((k) => !skip.has(k));
  if (keys.includes(serviceSlug)) return serviceSlug;
  const want = normKey(serviceSlug);
  for (const k of keys) {
    if (normKey(k) === want) return k;
  }
  return keys[0] ?? serviceSlug;
}

function flattenAwsFields(obj, prefix = "") {
  const fields = [];
  const metrics = [];
  if (!obj || typeof obj !== "object") return { fields, metrics };
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if ("avg" in v || "sum" in v || "max" in v || "min" in v) {
        const stat = "avg" in v ? "avg" : "sum" in v ? "sum" : "max" in v ? "max" : "min";
        metrics.push({ path: `${p}.${stat}`, leaf: k, stat });
      } else {
        const sub = flattenAwsFields(v, p);
        fields.push(...sub.fields);
        metrics.push(...sub.metrics);
      }
    } else if (["string", "number", "boolean"].includes(typeof v)) {
      fields.push({ path: p, leaf: k });
    }
  }
  return { fields, metrics };
}

function pickDimensionField(fields, awsPrefix) {
  const full = fields.map((f) => `aws.${awsPrefix}.${f.path}`);
  for (const leaf of DIM_PRIORITY) {
    const hit = fields.find((f) => f.leaf === leaf || f.path.endsWith(`.${leaf}`));
    if (hit) return `aws.${awsPrefix}.${hit.path}`;
  }
  const nameHit = fields.find((f) => f.leaf.includes("name") || f.leaf.includes("type"));
  if (nameHit) return `aws.${awsPrefix}.${nameHit.path}`;
  if (fields[0]) return `aws.${awsPrefix}.${fields[0].path}`;
  return "event.action";
}

function pickResourceField(fields, awsPrefix, dimField) {
  const resource = fields.find(
    (f) =>
      f.leaf.includes("arn") ||
      f.leaf.includes("id") ||
      f.leaf === "cluster" ||
      f.leaf === "instance"
  );
  if (resource) {
    const p = `aws.${awsPrefix}.${resource.path}`;
    if (p !== dimField) return p;
  }
  const second = fields.find((f) => `aws.${awsPrefix}.${f.path}` !== dimField);
  return second ? `aws.${awsPrefix}.${second.path}` : dimField;
}

function pickMetric(metrics, awsPrefix) {
  if (!metrics.length) return null;
  const preferred = metrics.find((m) =>
    /utilization|count|latency|duration|error|failed|running|visible|invocation/i.test(m.leaf)
  );
  const m = preferred ?? metrics[0];
  return `aws.${awsPrefix}.${m.path}`;
}

function loadSample(serviceSlug) {
  const fp = path.join(SAMPLES_DIR, `${serviceSlug}.json`);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf8"));
  } catch {
    return null;
  }
}

function extractFromGenerators(serviceSlug) {
  const fields = [];
  const metrics = [];
  const re = new RegExp(`aws\\.${serviceSlug.replace(/-/g, "[._-]?")}\\.([a-zA-Z0-9_.]+)`, "gi");
  const files = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith(".ts")) files.push(p);
    }
  }
  walk(GEN_DIR);
  for (const fp of files) {
    const text = fs.readFileSync(fp, "utf8");
    let m;
    while ((m = re.exec(text)) !== null) {
      const seg = m[1];
      if (seg.startsWith("metrics.")) {
        metrics.push({ path: seg, leaf: seg.split(".").pop() });
      } else {
        fields.push({ path: seg, leaf: seg.split(".").pop() });
      }
    }
  }
  return { fields, metrics };
}

function analyzeService(serviceSlug) {
  const sample = loadSample(serviceSlug);
  let awsPrefix = serviceSlug;
  let fields = [];
  let metrics = [];

  if (sample?.aws) {
    awsPrefix = findAwsBlockKey(serviceSlug, sample.aws);
    const block = sample.aws[awsPrefix];
    if (block && typeof block === "object") {
      const flat = flattenAwsFields(block);
      fields = flat.fields;
      metrics = flat.metrics;
    }
  }

  if (!fields.length && !metrics.length) {
    const gen = extractFromGenerators(serviceSlug);
    fields = gen.fields;
    metrics = gen.metrics;
  }

  const dimField = pickDimensionField(fields, awsPrefix);
  const resourceField = pickResourceField(fields, awsPrefix, dimField);
  const metricField = pickMetric(metrics, awsPrefix);

  const tableFields = [
    "`@timestamp`",
    dimField,
    resourceField !== dimField ? resourceField : null,
    metricField,
    "log.level",
    "event.outcome",
  ].filter(Boolean);

  return { awsPrefix, dimField, resourceField, metricField, tableFields };
}

function buildDashboard(serviceSlug, oldTitle) {
  const idx = `logs-aws.${serviceSlug}*`;
  const p = analyzeService(serviceSlug);
  const dim = backtick(p.dimField);
  const resource = backtick(p.resourceField);
  const metricField = p.metricField ? backtick(p.metricField) : null;
  const dimLabel = p.dimField.split(".").pop().replace(/_/g, " ");
  const resourceLabel = p.resourceField.split(".").pop().replace(/_/g, " ");

  const title =
    oldTitle && !/overview/i.test(oldTitle)
      ? oldTitle.replace(/\s*—\s*overview$/i, "").trim() + " — Overview"
      : `AWS ${displayName(serviceSlug)} — Overview`;

  const kpi3 = metricField
    ? metric(
        `${serviceSlug}-kpi-metric3`,
        24,
        "Avg metric",
        `FROM ${idx} | STATS avg_m = AVG(${metricField}) | EVAL \`Avg metric\` = ROUND(avg_m, 1)`
      )
    : metric(
        `${serviceSlug}-kpi-actions`,
        24,
        "Distinct actions",
        `FROM ${idx} | STATS \`Distinct actions\` = COUNT_DISTINCT(${backtick("event.action")})`
      );

  const kpi4 = metricField
    ? metric(
        `${serviceSlug}-kpi-metric4`,
        36,
        "Metric sum",
        `FROM ${idx} | STATS \`Metric sum\` = ROUND(SUM(${metricField}), 0)`
      )
    : metric(
        `${serviceSlug}-kpi-resources`,
        36,
        "Resources",
        `FROM ${idx} | STATS Resources = COUNT_DISTINCT(${resource})`
      );

  const lineMetric = metricField
    ? xyLine(
        `${serviceSlug}-line-metric`,
        24,
        13,
        24,
        "Key metric over time",
        `FROM ${idx} | STATS avg_m = AVG(${metricField}) BY bucket = ${BUCKET} | SORT \`\`bucket`,
        "bucket",
        [{ col: "avg_m", label: "Avg metric" }]
      )
    : xyLine(
        `${serviceSlug}-line-failures`,
        24,
        13,
        24,
        "Failures over time",
        `FROM ${idx} | STATS failures = SUM(CASE(\`event.outcome\` == "failure", 1, 0)) BY bucket = ${BUCKET} | SORT \`\`bucket`,
        "bucket",
        [{ col: "failures", label: "Failures" }]
      );

  const keepFields = [
    ...new Set(
      p.tableFields.map((f) => (f === "`@timestamp`" ? "`@timestamp``@timestamp`" : backtick(f)))
    ),
  ];
  const tableCols = p.tableFields.map((f) => {
    const col = f === "`@timestamp`" ? "`@timestamp`" : f;
    const label =
      f === "`@timestamp`"
        ? "Timestamp"
        : f
            .replace(/^aws\.[^.]+\./, "")
            .split(".")
            .pop()
            .replace(/_/g, " ");
    return { col, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });

  const panels = [
    metric(`${serviceSlug}-kpi-events`, 0, "Events", `FROM ${idx} | STATS Events = COUNT()`),
    metric(
      `${serviceSlug}-kpi-failures`,
      12,
      "Failures",
      `FROM ${idx} | STATS Failures = SUM(CASE(\`event.outcome\` == "failure", 1, 0))`
    ),
    kpi3,
    kpi4,
    donut(
      `${serviceSlug}-donut-outcome`,
      0,
      5,
      24,
      "Event Outcome",
      `FROM ${idx} | STATS count = COUNT() BY outcome = \`event.outcome\` | SORT \`\`count DESC`,
      "count",
      "outcome"
    ),
    xyBarH(
      `${serviceSlug}-bar-dimension`,
      24,
      5,
      24,
      `Events by ${dimLabel}`,
      `FROM ${idx} | STATS count = COUNT() BY dim = ${dim} | SORT \`\`count DESC | LIMIT 10`,
      "dim",
      "count",
      "Events"
    ),
    xyLine(
      `${serviceSlug}-line-volume`,
      0,
      13,
      24,
      "Event Volume Over Time",
      `FROM ${idx} | STATS count = COUNT() BY bucket = ${BUCKET} | SORT \`\`bucket`,
      "bucket",
      [{ col: "count", label: "Events" }]
    ),
    lineMetric,
    xyBarH(
      `${serviceSlug}-bar-region`,
      0,
      21,
      16,
      "Events by Region",
      `FROM ${idx} | STATS count = COUNT() BY region = COALESCE(cloud.region, "unknown") | SORT \`\`count DESC | LIMIT 10`,
      "region",
      "count",
      "Events"
    ),
    xyBarH(
      `${serviceSlug}-bar-resource`,
      16,
      21,
      16,
      `Events by ${resourceLabel}`,
      `FROM ${idx} | STATS count = COUNT() BY res = ${resource} | SORT \`\`count DESC | LIMIT 10`,
      "res",
      "count",
      "Events"
    ),
    donut(
      `${serviceSlug}-donut-log-level`,
      32,
      21,
      16,
      "Log Level",
      `FROM ${idx} | STATS count = COUNT() BY lvl = log.level | SORT \`\`count DESC`,
      "count",
      "lvl"
    ),
    dataTable(
      `${serviceSlug}-table-recent`,
      29,
      "Recent Events",
      `FROM ${idx} | KEEP ${keepFields.join(", ")}, message | SORT \`@timestamp\` DESC | LIMIT 100`,
      [...tableCols, { col: "message", label: "Message" }]
    ),
  ];

  return dash(title, panels);
}

const placeholders = fs
  .readdirSync(DASH_DIR)
  .filter((f) => f.endsWith("-dashboard.json"))
  .map((f) => {
    const slug = f.replace("-dashboard.json", "");
    const fp = path.join(DASH_DIR, f);
    const j = JSON.parse(fs.readFileSync(fp, "utf8"));
    return { slug, fp, panels: j.panels?.length ?? 0, title: j.title };
  })
  .filter(({ panels, slug }) => panels === 4 && !SKIP.has(slug));

let wrote = 0;
for (const { slug, fp, title } of placeholders) {
  const body = buildDashboard(slug, title);
  fs.writeFileSync(fp, body + "\n", "utf8");
  wrote++;
}

console.log(`Upgraded ${wrote} placeholder dashboard(s) (skipped: ${[...SKIP].join(", ")})`);
