/**
 * Azure trace generators registry.
 */

import { AZURE_TRACE_SERVICES } from "./services.js";
import { generateAppServiceTrace } from "./appservice.js";
import { generateFunctionsTrace } from "./functions.js";
import {
  generateAksTrace,
  generateServiceBusFlowTrace,
  generateOpenAiChainTrace,
  generateDataFactoryEtlTrace,
  generateApiManagementTrace,
  generateWorkflowCascadingTrace,
} from "./simple.js";
import {
  generateServiceBusTopicFanoutTrace,
  generateEventGridBlobPipelineTrace,
  generateDurableFunctionsOrchestrationTrace,
} from "./workflow-chains.js";
import { generateCosmosDbTrace, generateSqlDatabaseTrace } from "./databases.js";
import {
  generateEventHubsTrace,
  generateKeyVaultTrace,
  generateLogicAppsTrace,
} from "./integration.js";
import { generateCacheForRedisTrace } from "./cache-for-redis.js";
import { generateBlobStorageTrace } from "./blob-storage.js";
import { generateContainerAppsTrace } from "./container-apps.js";
import { generateMachineLearningTrace } from "./machine-learning.js";
import { generateDatabricksTrace } from "./databricks.js";
import { generateSynapseWorkspaceTrace } from "./synapse-workspace.js";
import { generateOpenAiTrace } from "./openai.js";
import { generateVirtualMachinesTrace } from "./virtual-machines.js";
import { generateServiceBusTrace } from "./service-bus.js";
import { generateEventGridTrace } from "./event-grid.js";
import { generateIotHubTrace } from "./iot-hub.js";
import { generateEntraIdTrace } from "./entra-id.js";
import { generateDataFactoryTrace } from "./data-factory.js";
import { generateLoadBalancerTrace } from "./load-balancer.js";
import { generateApplicationGatewayTrace } from "./application-gateway.js";
import { generateAzureFirewallTrace } from "./azure-firewall.js";
import { generateStreamAnalyticsTrace } from "./stream-analytics.js";
import { generateCognitiveServicesTrace } from "./cognitive-services.js";
import { generateAiSearchTrace } from "./ai-search.js";
import { generateDatabaseForPostgresqlTrace } from "./database-for-postgresql.js";
import { generateSqlManagedInstanceTrace } from "./sql-managed-instance.js";
import { generateSentinelTrace } from "./sentinel.js";
import { generateDefenderForCloudTrace } from "./defender-for-cloud.js";
import { generateContainerInstancesTrace } from "./container-instances.js";

const AZURE_TRACE_GENERATORS: Record<
  string,
  (ts: string, er: number) => Record<string, unknown>[]
> = {
  "app-service": generateAppServiceTrace,
  functions: generateFunctionsTrace,
  aks: generateAksTrace,
  "service-bus-flow": generateServiceBusFlowTrace,
  "openai-chain": generateOpenAiChainTrace,
  "data-factory-etl": generateDataFactoryEtlTrace,
  "api-management": generateApiManagementTrace,
  "workflow-cascading": generateWorkflowCascadingTrace,
  "workflow-servicebus-fanout": generateServiceBusTopicFanoutTrace,
  "workflow-eventgrid-blob": generateEventGridBlobPipelineTrace,
  "workflow-durable-orchestration": generateDurableFunctionsOrchestrationTrace,
  "cosmos-db": generateCosmosDbTrace,
  "sql-database": generateSqlDatabaseTrace,
  "event-hubs": generateEventHubsTrace,
  "key-vault": generateKeyVaultTrace,
  "logic-apps": generateLogicAppsTrace,
  "cache-for-redis": generateCacheForRedisTrace,
  "blob-storage": generateBlobStorageTrace,
  "container-apps": generateContainerAppsTrace,
  "machine-learning": generateMachineLearningTrace,
  databricks: generateDatabricksTrace,
  "synapse-workspace": generateSynapseWorkspaceTrace,
  openai: generateOpenAiTrace,
  "virtual-machines": generateVirtualMachinesTrace,
  "service-bus": generateServiceBusTrace,
  "event-grid": generateEventGridTrace,
  "iot-hub": generateIotHubTrace,
  "entra-id": generateEntraIdTrace,
  "data-factory": generateDataFactoryTrace,
  "load-balancer": generateLoadBalancerTrace,
  "application-gateway": generateApplicationGatewayTrace,
  "azure-firewall": generateAzureFirewallTrace,
  "stream-analytics": generateStreamAnalyticsTrace,
  "cognitive-services": generateCognitiveServicesTrace,
  "ai-search": generateAiSearchTrace,
  "database-for-postgresql": generateDatabaseForPostgresqlTrace,
  "sql-managed-instance": generateSqlManagedInstanceTrace,
  sentinel: generateSentinelTrace,
  "defender-for-cloud": generateDefenderForCloudTrace,
  "container-instances": generateContainerInstancesTrace,
};

export { AZURE_TRACE_SERVICES, AZURE_TRACE_GENERATORS };
