/**
 * Azure distributed trace scenarios (synthetic OTel / APM style).
 */

export const AZURE_TRACE_SERVICES = [
  { id: "app-service", label: "App Service — SQL & Redis" },
  { id: "functions", label: "Azure Functions — Event Hub → Cosmos" },
  { id: "aks", label: "AKS — HTTP → internal API" },
  { id: "service-bus-flow", label: "Service Bus — multi-hop workflow" },
  { id: "openai-chain", label: "OpenAI — embedding + completion" },
  { id: "data-factory-etl", label: "Data Factory — copy activity chain" },
  { id: "api-management", label: "API Management — backend latency" },
  { id: "workflow-cascading", label: "Cascading failure — Functions & Storage" },
  {
    id: "workflow-servicebus-fanout",
    label: "Service Bus fan-out — API Management → topic → 3 subscribers",
  },
  {
    id: "workflow-eventgrid-blob",
    label: "Event Grid + Blob — Function ETL → SQL warehouse",
  },
  {
    id: "workflow-durable-orchestration",
    label: "Durable Functions — HTTP starter → orchestration → 3 activities",
  },
  {
    id: "cosmos-db",
    label: "Cosmos DB",
    desc: "NoSQL document reads/writes — partition key routing spans via OTel SDK",
    group: "Single-Service",
  },
  {
    id: "sql-database",
    label: "Azure SQL Database",
    desc: "SQL query spans — connection pool + parameterized queries via OTel JDBC/ADO.NET",
    group: "Single-Service",
  },
  {
    id: "event-hubs",
    label: "Event Hubs",
    desc: "Producer/consumer traces — sendBatch and receiveMessages spans with partition context",
    group: "Single-Service",
  },
  {
    id: "key-vault",
    label: "Key Vault",
    desc: "Secret and key access spans — getSecret, listVersions via OTel SDK",
    group: "Single-Service",
  },
  {
    id: "logic-apps",
    label: "Logic Apps",
    desc: "Workflow action chain — trigger + HTTP/ServiceBus/notification action spans",
    group: "Single-Service",
  },
] as const;
