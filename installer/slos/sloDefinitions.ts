export interface SloDefinition {
  id: string;
  name: string;
  description: string;
  indicator: Record<string, unknown>;
  timeWindow: { duration: string; type: string };
  budgetingMethod: string;
  objective: { target: number };
  tags: string[];
}

export function getSloDefinitions(vendor: string): SloDefinition[] {
  const v = vendor.toUpperCase();
  return [
    {
      id: `cloudloadgen-${vendor}-availability`,
      name: `${v} Service Availability`,
      description: `Overall ${v} service availability — percentage of successful events across all ${v} services.`,
      indicator: {
        type: "sli.kql.custom",
        params: {
          index: `logs-${vendor}.*`,
          good: "event.outcome: success",
          total: "*",
          filter: "",
          timestampField: "@timestamp",
        },
      },
      timeWindow: { duration: "30d", type: "rolling" },
      budgetingMethod: "occurrences",
      objective: { target: 0.995 },
      tags: ["cloudloadgen", vendor],
    },
    {
      id: `cloudloadgen-${vendor}-pipeline-availability`,
      name: `${v} Data Pipeline Availability`,
      description: `Data pipeline success rate for ${v} services (EMR, Glue, Athena, etc.).`,
      indicator: {
        type: "sli.kql.custom",
        params: {
          index: `logs-${vendor}.*`,
          good: "event.outcome: success AND event.category: database",
          total: "event.category: database",
          filter: "",
          timestampField: "@timestamp",
        },
      },
      timeWindow: { duration: "30d", type: "rolling" },
      budgetingMethod: "occurrences",
      objective: { target: 0.99 },
      tags: ["cloudloadgen", vendor],
    },
  ];
}
