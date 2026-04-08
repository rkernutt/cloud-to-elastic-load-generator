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
};

export { AZURE_TRACE_SERVICES, AZURE_TRACE_GENERATORS };
