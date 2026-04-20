/**
 * Registry of Azure log generators (synthetic).
 */

import { AZURE_ELASTIC_DATASET_MAP } from "../data/elasticMaps.js";
import { makeGenericAzureLog } from "./genericLog.js";
import {
  generateVirtualMachinesLog,
  generateVmScaleSetsLog,
  generateBatchLog,
  generateAksLog,
} from "./compute.js";
import {
  generateVirtualNetworkLog,
  generateLoadBalancerLog,
  generateApplicationGatewayLog,
  generateAzureFirewallLog,
} from "./networking.js";
import { generateBlobStorageLog } from "./storage.js";
import { generateSqlDatabaseLog, generateCosmosDbLog } from "./databases.js";
import {
  generateAppServiceLog,
  generateFunctionsLog,
  generateServiceBusLog,
  generateEventHubsLog,
  generateKeyVaultLog,
  generateEntraIdLog,
  generateM365Log,
} from "./platform.js";
import { generateOpenAiLog } from "./aiml.js";
import {
  generateAzureSecurityFindingChain,
  generateAzureCspmFindings,
  generateAzureKspmFindings,
  generateAzureIamPrivEscChain,
  generateAzureDataExfilChain,
} from "./securityChains.js";
import { generateAzureDataPipelineChain } from "./dataPipelineChain.js";
import {
  generateIotHubLog,
  generateLogicAppsLog,
  generateApiManagementLog,
  generateEventGridLog,
  generateSynapseWorkspaceLog,
  generateDatabricksLog,
} from "./integration.js";
import { mergeAzureLogVariants } from "./mergeHelpers.js";

import type { EcsDocument } from "./helpers.js";

/** Most generators return one doc; security-chain generators return correlated multi-doc bursts. */
type Gen = (ts: string, er: number) => EcsDocument | EcsDocument[];

const DEDICATED: Record<string, Gen> = {
  "virtual-machines": generateVirtualMachinesLog,
  "vm-scale-sets": generateVmScaleSetsLog,
  batch: generateBatchLog,
  aks: generateAksLog,
  "virtual-network": generateVirtualNetworkLog,
  "load-balancer": generateLoadBalancerLog,
  "application-gateway": generateApplicationGatewayLog,
  "azure-firewall": generateAzureFirewallLog,
  "blob-storage": generateBlobStorageLog,
  "sql-database": generateSqlDatabaseLog,
  "cosmos-db": generateCosmosDbLog,
  "app-service": generateAppServiceLog,
  functions: generateFunctionsLog,
  "service-bus": generateServiceBusLog,
  "event-hubs": generateEventHubsLog,
  "key-vault": generateKeyVaultLog,
  "entra-id": generateEntraIdLog,
  m365: generateM365Log,
  openai: generateOpenAiLog,
  "iot-hub": generateIotHubLog,
  "logic-apps": generateLogicAppsLog,
  "api-management": generateApiManagementLog,
  "event-grid": generateEventGridLog,
  "synapse-workspace": generateSynapseWorkspaceLog,
  databricks: generateDatabricksLog,
  "azure-security-chain": generateAzureSecurityFindingChain,
  "azure-cspm": generateAzureCspmFindings,
  "azure-kspm": generateAzureKspmFindings,
  "azure-iam-privesc-chain": generateAzureIamPrivEscChain,
  "azure-data-exfil-chain": generateAzureDataExfilChain,
  "azure-data-pipeline-chain": generateAzureDataPipelineChain,
};

const AZURE_LOG_MERGE_CHILDREN: Record<string, readonly string[]> = {
  "virtual-machines": [
    "dedicated-host",
    "capacity-reservation",
    "proximity-placement",
    "confidential-vm",
  ],
  "front-door": ["cdn"],
};

function buildRegistry(): Record<string, Gen> {
  const out: Record<string, Gen> = {};
  for (const id of Object.keys(AZURE_ELASTIC_DATASET_MAP)) {
    out[id] = DEDICATED[id] ?? makeGenericAzureLog(id);
  }
  for (const [parent, children] of Object.entries(AZURE_LOG_MERGE_CHILDREN)) {
    const base = out[parent];
    if (!base) continue;
    const variants = [base, ...children.map((c) => makeGenericAzureLog(c))];
    out[parent] = mergeAzureLogVariants(variants);
    for (const c of children) {
      delete out[c];
    }
  }
  for (const [parent, children] of Object.entries(AZURE_LOG_MERGE_CHILDREN)) {
    const parentGen = out[parent];
    if (!parentGen) continue;
    for (const c of children) {
      if (!(c in out)) out[c] = parentGen;
    }
  }
  return out;
}

const AZURE_GENERATORS = buildRegistry();

export { AZURE_GENERATORS };
