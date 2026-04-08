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
] as const;
