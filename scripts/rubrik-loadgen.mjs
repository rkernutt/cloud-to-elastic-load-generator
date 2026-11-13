#!/usr/bin/env node
/**
 * Rubrik → Elastic sample load generator CLI.
 *
 * Emits realistic Rubrik-shaped events (webhook PD-CEF/custom JSON, GraphQL
 * activity/audit nodes, CDM syslog) and ships them to:
 *   - file (NDJSON / .log) — stage for object-storage or Agent file input
 *   - http — Elastic Agent Custom HTTP Endpoint (webhook / GraphQL JSON)
 *   - elasticsearch — _bulk (optional ?pipeline= for raw pre-pipeline docs)
 *
 * Usage examples:
 *   npm run rubrik:loadgen -- --mode file --path all --count 30
 *   npm run rubrik:loadgen -- --mode http --path webhook --count 20 \
 *     --url http://localhost:8080/
 *   npm run rubrik:loadgen -- --mode elasticsearch --path webhook --count 20 \
 *     --es-url https://ES:9200 --api-key "$ES_API_KEY" --pipeline rubrik-webhook
 *   npm run rubrik:loadgen -- --mode file --path syslog --count 10 --anomaly
 *
 * Env: RUBRIK_HTTP_URL, ES_URL / ELASTICSEARCH_URL, ES_API_KEY / ELASTIC_API_KEY
 */

import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import { fileURLToPath } from "url";
import net from "net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

function parseArgs(argv) {
  const out = {
    mode: "file",
    path: "all",
    count: 25,
    outDir: path.join(rootDir, "samples", "rubrik"),
    url: process.env.RUBRIK_HTTP_URL || "",
    esUrl: process.env.ES_URL || process.env.ELASTICSEARCH_URL || "",
    apiKey: process.env.ES_API_KEY || process.env.ELASTIC_API_KEY || "",
    pipeline: "",
    index: "",
    anomaly: false,
    raw: true,
    errorRate: 0.15,
    syslogHost: "127.0.0.1",
    syslogPort: 514,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--mode") out.mode = next();
    else if (a === "--path") out.path = next();
    else if (a === "--count") out.count = Number(next());
    else if (a === "--out-dir") out.outDir = path.resolve(next());
    else if (a === "--url") out.url = next();
    else if (a === "--es-url") out.esUrl = next();
    else if (a === "--api-key") out.apiKey = next();
    else if (a === "--pipeline") out.pipeline = next();
    else if (a === "--index") out.index = next();
    else if (a === "--anomaly") out.anomaly = true;
    else if (a === "--ecs") out.raw = false;
    else if (a === "--error-rate") out.errorRate = Number(next());
    else if (a === "--syslog-host") out.syslogHost = next();
    else if (a === "--syslog-port") out.syslogPort = Number(next());
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function usage() {
  console.log(`Rubrik sample load generator

Options:
  --mode file|http|elasticsearch|syslog   Output destination (default: file)
  --path webhook|graphql|syslog|all       Event family (default: all)
  --count N                               Events per path (default: 25)
  --out-dir DIR                           File output directory (default: samples/rubrik)
  --url URL                               Custom HTTP Endpoint base URL
  --es-url URL                            Elasticsearch URL
  --api-key KEY                           Elasticsearch API key
  --pipeline NAME                         _bulk ?pipeline= (raw docs through rubrik-*)
  --index NAME                            Override destination index/data stream
  --anomaly                               Force RansomwareStrainDetected (Success+critical)
  --ecs                                   Ship ECS-wrapped docs instead of raw payloads
  --error-rate N                          Scenario mix bias 0..1 (default: 0.15)
  --syslog-host HOST                      TCP syslog target (mode=syslog)
  --syslog-port PORT                      TCP syslog port (default: 514)

Examples (Rob / Rubrik→Elastic PoC):
  # 1) Stage NDJSON + syslog for Agent / object storage
  npm run rubrik:loadgen -- --mode file --path all --count 40 --anomaly

  # 2) POST webhooks at Custom HTTP Endpoint (pipeline: rubrik-webhook)
  npm run rubrik:loadgen -- --mode http --path webhook --count 25 \\
    --url http://agent-host:8080/

  # 3) Exercise pipeline via ES _bulk without Agent
  npm run rubrik:loadgen -- --mode elasticsearch --path webhook --count 25 \\
    --es-url https://ES:9200 --api-key "$ES_API_KEY" --pipeline rubrik-webhook \\
    --index logs-rubrik.webhook-default

  # 4) TCP syslog to Custom TCP Logs (pipeline: rubrik-syslog)
  npm run rubrik:loadgen -- --mode syslog --path syslog --count 20 \\
    --syslog-host 127.0.0.1 --syslog-port 9514
`);
}

function pathsFor(p) {
  if (p === "all") return ["webhook", "graphql", "syslog"];
  if (["webhook", "graphql", "syslog"].includes(p)) return [p];
  throw new Error(`Unknown --path ${p}`);
}

function defaultIndex(pathName, ecs) {
  if (!ecs) {
    // Raw docs still need a destination data stream; pipelines set event.dataset
    return `logs-rubrik.${pathName}-default`;
  }
  return `logs-rubrik.${pathName}-default`;
}

function defaultPipeline(pathName) {
  if (pathName === "webhook") return "rubrik-webhook";
  if (pathName === "graphql") return "rubrik-graphql-events";
  if (pathName === "syslog") return "rubrik-syslog";
  return "";
}

function request(urlStr, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function shipHttp(url, payloads) {
  let ok = 0;
  let fail = 0;
  for (const p of payloads) {
    const body = typeof p === "string" ? p : JSON.stringify(p);
    const res = await request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      body,
    });
    if (res.status >= 200 && res.status < 300) ok++;
    else {
      fail++;
      console.error(`HTTP ${res.status}: ${res.body.slice(0, 200)}`);
    }
  }
  return { ok, fail };
}

async function shipElasticsearch(esUrl, apiKey, index, pipeline, docs) {
  const lines = [];
  for (const doc of docs) {
    lines.push(JSON.stringify({ create: { _index: index } }));
    lines.push(JSON.stringify(doc));
  }
  const ndjson = lines.join("\n") + "\n";
  let bulkUrl = `${esUrl.replace(/\/$/, "")}/_bulk`;
  if (pipeline) bulkUrl += `?pipeline=${encodeURIComponent(pipeline)}`;
  const res = await request(bulkUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-ndjson",
      Authorization: `ApiKey ${apiKey}`,
      "Content-Length": Buffer.byteLength(ndjson),
    },
    body: ndjson,
  });
  if (res.status >= 300) {
    throw new Error(`_bulk HTTP ${res.status}: ${res.body.slice(0, 500)}`);
  }
  const json = JSON.parse(res.body);
  const errors = (json.items || []).filter((it) => {
    const r = it.create || it.index;
    return r && r.error;
  });
  return { ok: (json.items || []).length - errors.length, fail: errors.length, sample: errors[0] };
}

function shipSyslogTcp(host, port, lines) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port }, () => {
      for (const line of lines) {
        socket.write(line.endsWith("\n") ? line : line + "\n");
      }
      socket.end();
    });
    socket.on("error", reject);
    socket.on("close", () => resolve({ ok: lines.length, fail: 0 }));
  });
}

function writeFiles(outDir, pathName, bundles, useRaw) {
  fs.mkdirSync(outDir, { recursive: true });
  if (pathName === "syslog") {
    const file = path.join(outDir, "syslog.log");
    const text =
      bundles
        .map((b) => b.line || "")
        .filter(Boolean)
        .join("\n") + "\n";
    fs.writeFileSync(file, text);
    return file;
  }
  const file = path.join(outDir, `${pathName}.ndjson`);
  const lines = bundles.map((b) => JSON.stringify(useRaw ? b.payload : b.ecs));
  fs.writeFileSync(file, lines.join("\n") + "\n");
  // Also drop one pretty anomaly sample for docs / curl demos
  const anomaly = bundles.find((b) => b.scenario === "anomaly_ransomware");
  if (anomaly) {
    const sampleFile = path.join(outDir, `${pathName}-anomaly-sample.json`);
    fs.writeFileSync(
      sampleFile,
      JSON.stringify(useRaw ? anomaly.payload : anomaly.ecs, null, 2) + "\n"
    );
  }
  return file;
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  usage();
  process.exit(0);
}

const { generateRawRubrikEvent, generateAnomalyRansomwareRaw, wrapRawAsEcs } =
  await import("../src/rubrik/generators/index.ts");

const selectedPaths = pathsFor(args.path);
const ts = new Date().toISOString();

console.log(
  `Rubrik loadgen mode=${args.mode} paths=${selectedPaths.join(",")} count=${args.count} raw=${args.raw}`
);

let totalOk = 0;
let totalFail = 0;

for (const pathName of selectedPaths) {
  const bundles = [];
  for (let i = 0; i < args.count; i++) {
    const raw =
      args.anomaly && i === 0
        ? generateAnomalyRansomwareRaw(ts, pathName)
        : args.anomaly && Math.random() < 0.25
          ? generateAnomalyRansomwareRaw(new Date(Date.now() - i * 1000).toISOString(), pathName)
          : generateRawRubrikEvent(
              new Date(Date.now() - i * 1000).toISOString(),
              args.errorRate,
              pathName
            );
    bundles.push({
      ...raw,
      ecs: wrapRawAsEcs(raw, ts),
    });
  }

  if (args.mode === "file") {
    const file = writeFiles(args.outDir, pathName, bundles, args.raw);
    console.log(`  wrote ${bundles.length} → ${file}`);
    totalOk += bundles.length;
    continue;
  }

  if (args.mode === "http") {
    if (pathName === "syslog") {
      console.warn("  skip syslog on --mode http (use --mode syslog or --mode file)");
      continue;
    }
    if (!args.url) {
      console.error("  --url (or RUBRIK_HTTP_URL) required for --mode http");
      process.exit(1);
    }
    const payloads = bundles.map((b) => (args.raw ? b.payload : b.ecs));
    const { ok, fail } = await shipHttp(args.url, payloads);
    console.log(`  http ${pathName}: ok=${ok} fail=${fail}`);
    totalOk += ok;
    totalFail += fail;
    continue;
  }

  if (args.mode === "syslog") {
    if (pathName !== "syslog") continue;
    const lines = bundles.map((b) => b.line).filter(Boolean);
    const { ok, fail } = await shipSyslogTcp(args.syslogHost, args.syslogPort, lines);
    console.log(`  syslog tcp ${args.syslogHost}:${args.syslogPort}: ok=${ok} fail=${fail}`);
    totalOk += ok;
    totalFail += fail;
    continue;
  }

  if (args.mode === "elasticsearch") {
    if (!args.esUrl || !args.apiKey) {
      console.error("  --es-url and --api-key required for --mode elasticsearch");
      process.exit(1);
    }
    const index = args.index || defaultIndex(pathName, !args.raw);
    const pipeline = args.pipeline || (args.raw ? defaultPipeline(pathName) : "");
    // Syslog raw through ES bulk: send { message: <MSG body> } so rubrik-syslog can grok
    const docs = bundles.map((b) => {
      if (!args.raw) return b.ecs;
      if (pathName === "syslog") {
        const msg = (b.line || "").replace(/^<[^>]+>[^:]+:\s*/, "");
        return { message: msg || b.line, event: { original: b.line } };
      }
      return b.payload;
    });
    const result = await shipElasticsearch(args.esUrl, args.apiKey, index, pipeline, docs);
    console.log(
      `  es ${pathName} → ${index}${pipeline ? ` pipeline=${pipeline}` : ""}: ok=${result.ok} fail=${result.fail}`
    );
    if (result.sample)
      console.error("  sample error:", JSON.stringify(result.sample).slice(0, 400));
    totalOk += result.ok;
    totalFail += result.fail;
    continue;
  }

  console.error(`Unknown --mode ${args.mode}`);
  process.exit(1);
}

console.log(`Done. ok=${totalOk} fail=${totalFail}`);
process.exit(totalFail > 0 ? 2 : 0);
