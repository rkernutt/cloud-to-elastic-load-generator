/**
 * RDS/Aurora PostgreSQL OTel trace generator.
 *
 * Simulates RDS-backed services instrumented with EDOT via JDBC (Java),
 * psycopg2 (Python), or node-postgres (Node.js). Each trace represents one
 * business operation (transaction) with 2–5 SQL spans, including optional
 * BEGIN/COMMIT spans for transactional services.
 *
 * Real-world instrumentation path:
 *   Application (Java/Python/Node) + EDOT OTel SDK
 *     → OTLP gRPC/HTTP → Elastic APM Server / OTel Collector
 *       → traces-apm-default
 */

import {
  TRACE_REGIONS,
  TRACE_ACCOUNTS,
  newTraceId,
  newSpanId,
  rand,
  randInt,
  offsetTs,
  serviceBlock,
  otelBlocks,
} from "./helpers.js";

// ─── Service configurations ───────────────────────────────────────────────────
const SERVICE_CONFIGS = [
  {
    name: "orders-api",
    language: "java",
    framework: "Spring Boot",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    dbName: "orders_db",
    clusterSuffix: "prod-postgres.cluster-abc123",
    operations: [
      {
        txName: "CreateOrder",
        spans: [
          { type: "control", name: "BEGIN" },
          {
            type: "sql",
            stmt: "SELECT id, status, credit_limit FROM customers WHERE id = $1",
            table: "customers",
            action: "query",
          },
          {
            type: "sql",
            stmt: "INSERT INTO orders (id, customer_id, total, status, created_at) VALUES ($1, $2, $3, $4, $5)",
            table: "orders",
            action: "execute",
          },
          {
            type: "sql",
            stmt: "UPDATE inventory SET quantity = quantity - $1 WHERE product_id = $2",
            table: "inventory",
            action: "execute",
          },
          { type: "control", name: "COMMIT" },
        ],
      },
      {
        txName: "GetOrderDetails",
        spans: [
          {
            type: "sql",
            stmt: "SELECT id, status, total FROM orders WHERE customer_id = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 10",
            table: "orders",
            action: "query",
          },
          {
            type: "sql",
            stmt: "SELECT oi.product_id, oi.quantity, p.name FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = $1",
            table: "order_items",
            action: "query",
          },
        ],
      },
      {
        txName: "UpdateOrderStatus",
        spans: [
          { type: "control", name: "BEGIN" },
          {
            type: "sql",
            stmt: "SELECT id, status FROM orders WHERE id = $1 FOR UPDATE",
            table: "orders",
            action: "query",
          },
          {
            type: "sql",
            stmt: "UPDATE orders SET status = $1, updated_at = $2 WHERE id = $3",
            table: "orders",
            action: "execute",
          },
          { type: "control", name: "COMMIT" },
        ],
      },
    ],
  },
  {
    name: "analytics-service",
    language: "python",
    framework: "Django",
    runtimeName: "CPython",
    runtimeVersion: "3.12.3",
    dbName: "analytics_db",
    clusterSuffix: "analytics-postgres.cluster-def456",
    slow: true,
    operations: [
      {
        txName: "GenerateSalesReport",
        spans: [
          {
            type: "sql",
            stmt: "SELECT date_trunc('day', created_at) AS day, SUM(total) AS revenue, COUNT(*) AS order_count FROM orders WHERE created_at BETWEEN $1 AND $2 GROUP BY 1 ORDER BY 1",
            table: "orders",
            action: "query",
          },
          {
            type: "sql",
            stmt: "SELECT p.category, SUM(oi.quantity * oi.unit_price) AS category_revenue FROM order_items oi JOIN products p ON oi.product_id = p.id JOIN orders o ON oi.order_id = o.id WHERE o.created_at BETWEEN $1 AND $2 GROUP BY p.category ORDER BY category_revenue DESC",
            table: "order_items",
            action: "query",
          },
        ],
      },
      {
        txName: "CustomerCohortAnalysis",
        spans: [
          {
            type: "sql",
            stmt: "SELECT customer_id, MIN(created_at) AS first_order, COUNT(*) AS order_count, SUM(total) AS lifetime_value FROM orders GROUP BY customer_id HAVING COUNT(*) > $1",
            table: "orders",
            action: "query",
          },
          {
            type: "sql",
            stmt: "SELECT c.segment, AVG(o.total) AS avg_order_value, RANK() OVER (ORDER BY AVG(o.total) DESC) AS rank FROM customers c JOIN orders o ON c.id = o.customer_id GROUP BY c.segment",
            table: "customers",
            action: "query",
          },
        ],
      },
    ],
  },
  {
    name: "user-service",
    language: "nodejs",
    framework: "Express",
    runtimeName: "node",
    runtimeVersion: "20.15.1",
    dbName: "users_db",
    clusterSuffix: "users-postgres.cluster-ghi789",
    operations: [
      {
        txName: "GetUserProfile",
        spans: [
          {
            type: "sql",
            stmt: "SELECT id, email, name, created_at, last_login FROM users WHERE id = $1",
            table: "users",
            action: "query",
          },
          {
            type: "sql",
            stmt: "SELECT role FROM user_roles WHERE user_id = $1",
            table: "user_roles",
            action: "query",
          },
        ],
      },
      {
        txName: "UserLogin",
        spans: [
          {
            type: "sql",
            stmt: "SELECT id, email, password_hash, status FROM users WHERE email = $1",
            table: "users",
            action: "query",
          },
          {
            type: "sql",
            stmt: "UPDATE users SET last_login = $1 WHERE id = $2",
            table: "users",
            action: "execute",
          },
          {
            type: "sql",
            stmt: "INSERT INTO audit_log (user_id, action, ip_address, created_at) VALUES ($1, $2, $3, $4)",
            table: "audit_log",
            action: "execute",
          },
        ],
      },
      {
        txName: "UpdateUserProfile",
        spans: [
          {
            type: "sql",
            stmt: "SELECT id FROM users WHERE id = $1",
            table: "users",
            action: "query",
          },
          {
            type: "sql",
            stmt: "UPDATE users SET name = $1, updated_at = $2 WHERE id = $3",
            table: "users",
            action: "execute",
          },
          {
            type: "sql",
            stmt: "INSERT INTO audit_log (user_id, action, created_at) VALUES ($1, $2, $3)",
            table: "audit_log",
            action: "execute",
          },
        ],
      },
    ],
  },
  {
    name: "billing-service",
    language: "java",
    framework: "Micronaut",
    runtimeName: "OpenJDK",
    runtimeVersion: "21.0.3",
    dbName: "billing_db",
    clusterSuffix: "billing-postgres.cluster-jkl012",
    operations: [
      {
        txName: "ListInvoices",
        spans: [
          {
            type: "sql",
            stmt: "SELECT i.id, i.amount, i.status, i.due_date, c.name AS customer_name FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE i.customer_id = $1 ORDER BY i.due_date DESC LIMIT $2",
            table: "invoices",
            action: "query",
          },
        ],
      },
      {
        txName: "ProcessCharge",
        spans: [
          { type: "control", name: "BEGIN" },
          {
            type: "sql",
            stmt: "SELECT id, balance, status FROM accounts WHERE customer_id = $1 FOR UPDATE",
            table: "accounts",
            action: "query",
          },
          {
            type: "sql",
            stmt: "INSERT INTO charges (id, account_id, amount, description, created_at) VALUES ($1, $2, $3, $4, $5)",
            table: "charges",
            action: "execute",
          },
          {
            type: "sql",
            stmt: "UPDATE accounts SET balance = balance - $1 WHERE id = $2",
            table: "accounts",
            action: "execute",
          },
          { type: "control", name: "COMMIT" },
        ],
      },
      {
        txName: "ReconcileInvoices",
        spans: [
          {
            type: "sql",
            stmt: "SELECT i.id, i.amount, SUM(p.amount) AS paid FROM invoices i LEFT JOIN payments p ON i.id = p.invoice_id WHERE i.status = 'open' GROUP BY i.id, i.amount HAVING SUM(p.amount) >= i.amount",
            table: "invoices",
            action: "query",
          },
          {
            type: "sql",
            stmt: "UPDATE invoices SET status = 'paid', settled_at = $1 WHERE id = ANY($2)",
            table: "invoices",
            action: "execute",
          },
        ],
      },
    ],
  },
  {
    name: "reporting-service",
    language: "python",
    framework: "FastAPI",
    runtimeName: "CPython",
    runtimeVersion: "3.11.9",
    dbName: "reporting_db",
    clusterSuffix: "reporting-postgres.cluster-mno345",
    slow: true,
    operations: [
      {
        txName: "GenerateMonthlyReport",
        spans: [
          {
            type: "sql",
            stmt: "SELECT date_trunc('month', o.created_at) AS month, u.segment, COUNT(o.id) AS orders, SUM(o.total) AS revenue FROM orders o JOIN users u ON o.customer_id = u.id WHERE o.created_at > NOW() - INTERVAL '12 months' GROUP BY 1, 2 ORDER BY 1, revenue DESC",
            table: "orders",
            action: "query",
          },
          {
            type: "sql",
            stmt: "SELECT p.category, p.sku, SUM(oi.quantity) AS units_sold, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN products p ON oi.product_id = p.id GROUP BY p.category, p.sku ORDER BY revenue DESC LIMIT 100",
            table: "order_items",
            action: "query",
          },
        ],
      },
      {
        txName: "ExportCustomerData",
        spans: [
          {
            type: "sql",
            stmt: "SELECT u.id, u.email, u.name, u.created_at, COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS lifetime_value, MAX(o.created_at) AS last_order_at FROM users u LEFT JOIN orders o ON u.id = o.customer_id GROUP BY u.id, u.email, u.name, u.created_at ORDER BY lifetime_value DESC",
            table: "users",
            action: "query",
          },
        ],
      },
    ],
  },
];

/** Span step from SERVICE_CONFIGS (literal type widens to string when mapped). */
type RdsSqlSpanDef = {
  type: string;
  name?: string;
  stmt?: string;
  table?: string;
  action?: string;
};

function buildSqlSpan(
  traceId: string,
  txId: string,
  parentId: string,
  ts: string,
  spanDef: RdsSqlSpanDef,
  dbName: string,
  dbHost: string,
  isErr: boolean,
  spanOffsetMs: number,
  isSlow: boolean
) {
  const id = newSpanId();

  // BEGIN / COMMIT control spans — very short
  if (spanDef.type === "control") {
    const durationUs = randInt(1, 5) * 1000;
    return {
      "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
      processor: { name: "transaction", event: "span" },
      trace: { id: traceId },
      transaction: { id: txId },
      parent: { id: parentId },
      span: {
        id: id,
        type: "db",
        subtype: "postgresql",
        name: spanDef.name,
        duration: { us: durationUs },
        action: "execute",
        db: { type: "sql", statement: spanDef.name },
        destination: { service: { resource: "postgresql", type: "db", name: "postgresql" } },
      },
      labels: { db_name: dbName, db_host: dbHost },
      event: { outcome: "success" },
      data_stream: { type: "traces", dataset: "apm", namespace: "default" },
    };
  }

  // Regular SQL spans
  const minMs = isSlow ? 5000 : 5;
  const maxMs = isSlow ? 60000 : 500;
  const durationUs = randInt(minMs, maxMs) * 1000;

  // Derive a short span name: "SELECT orders", "INSERT users", etc.
  const stmt = spanDef.stmt ?? "";
  const table = spanDef.table ?? "";
  const statementType = stmt.trim().split(/\s+/)[0].toUpperCase();
  const spanName = `${statementType} ${table}`;

  return {
    "@timestamp": offsetTs(new Date(ts), spanOffsetMs),
    processor: { name: "transaction", event: "span" },
    trace: { id: traceId },
    transaction: { id: txId },
    parent: { id: parentId },
    span: {
      id: id,
      type: "db",
      subtype: "postgresql",
      name: spanName,
      duration: { us: durationUs },
      action: spanDef.action ?? "query",
      db: { type: "sql", statement: stmt },
      destination: { service: { resource: "postgresql", type: "db", name: "postgresql" } },
    },
    labels: { db_name: dbName, db_host: dbHost },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };
}

/**
 * Generates an RDS/Aurora PostgreSQL OTel trace: 1 transaction + 2–5 SQL spans.
 * @param {string} ts  - ISO timestamp string (base time for the request)
 * @param {number} er  - error rate 0.0–1.0
 * @returns {Object[]} array of APM documents (transaction first, then spans)
 */
export function generateRdsTrace(ts: string, er: number) {
  const cfg = rand(SERVICE_CONFIGS);
  const region = rand(TRACE_REGIONS);
  const account = rand(TRACE_ACCOUNTS);
  const traceId = newTraceId();
  const txId = newSpanId();
  const env = rand(["production", "production", "staging", "dev"]);
  const isErr = Math.random() < er;
  const isSlow = cfg.slow === true;
  const dbHost = `${cfg.clusterSuffix}.${region}.rds.amazonaws.com`;

  const opConfig = rand(cfg.operations);

  // Total duration: sum approximate of children
  const totalUs = isSlow ? randInt(5000, 65000) * 1000 : randInt(10, 600) * 1000;

  const svcBlock = serviceBlock(
    cfg.name,
    env,
    cfg.language,
    cfg.framework,
    cfg.runtimeName,
    cfg.runtimeVersion
  );

  const { agent, telemetry } = otelBlocks(cfg.language, "elastic");

  // ── Root transaction ────────────────────────────────────────────────────────
  const txDoc = {
    "@timestamp": ts,
    processor: { name: "transaction", event: "transaction" },
    trace: { id: traceId },
    transaction: {
      id: txId,
      name: opConfig.txName,
      type: "request",
      duration: { us: totalUs },
      result: isErr ? "failure" : "success",
      sampled: true,
      span_count: { started: opConfig.spans.length, dropped: 0 },
    },
    service: svcBlock,
    agent: agent,
    telemetry: telemetry,
    cloud: {
      provider: "aws",
      region: region,
      account: { id: account.id, name: account.name },
      service: { name: "rds" },
    },
    event: { outcome: isErr ? "failure" : "success" },
    data_stream: { type: "traces", dataset: "apm", namespace: "default" },
  };

  // ── Child spans (SQL operations) ─────────────────────────────────────────────
  const spans: any[] = [];
  let spanOffsetMs = randInt(1, 5);

  for (let i = 0; i < opConfig.spans.length; i++) {
    const spanDef = opConfig.spans[i];
    const spanIsErr = isErr && i === opConfig.spans.length - 1 && spanDef.type !== "control";
    const spanDoc = buildSqlSpan(
      traceId,
      txId,
      txId,
      ts,
      spanDef,
      cfg.dbName,
      dbHost,
      spanIsErr,
      spanOffsetMs,
      isSlow
    );

    spans.push(spanDoc);
    spanOffsetMs += spanDoc.span.duration.us / 1000 + randInt(1, 10);
  }

  return [txDoc, ...spans];
}
