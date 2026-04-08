/**
 * Custom ingest pipelines for Azure load-generator data streams logs-azure.{suffix}-default.
 * Parses JSON from the message field into azure.parsed when present.
 *
 * Generated — run: npx vite-node scripts/generate-azure-pipeline-registry.mjs
 */

export const PIPELINE_REGISTRY = [
  {
    id: "logs-azure.activity_log-default",
    dataset: "azure.activity_log",
    group: "management",
    description: "Parse JSON from message for azure.activity_log (activity-log)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.advisor-default",
    dataset: "azure.advisor",
    group: "management",
    description: "Parse JSON from message for azure.advisor (advisor)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.ai_search-default",
    dataset: "azure.ai_search",
    group: "data-ai",
    description: "Parse JSON from message for azure.ai_search (ai-search)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.analysis_services-default",
    dataset: "azure.analysis_services",
    group: "data-ai",
    description: "Parse JSON from message for azure.analysis_services (analysis-services)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.api_center-default",
    dataset: "azure.api_center",
    group: "integration",
    description: "Parse JSON from message for azure.api_center (api-center)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.api_management-default",
    dataset: "azure.api_management",
    group: "integration",
    description: "Parse JSON from message for azure.api_management (api-management)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.app_configuration-default",
    dataset: "azure.app_configuration",
    group: "management",
    description: "Parse JSON from message for azure.app_configuration (app-configuration)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.app_service-default",
    dataset: "azure.app_service",
    group: "serverless-apps",
    description: "Parse JSON from message for azure.app_service (app-service)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.application_gateway-default",
    dataset: "azure.application_gateway",
    group: "networking",
    description: "Parse JSON from message for azure.application_gateway (application-gateway)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.arc-default",
    dataset: "azure.arc",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.arc (arc)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.attestation-default",
    dataset: "azure.attestation",
    group: "identity-security",
    description: "Parse JSON from message for azure.attestation (attestation)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.automation-default",
    dataset: "azure.automation",
    group: "management",
    description: "Parse JSON from message for azure.automation (automation-account)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.azure_stack-default",
    dataset: "azure.azure_stack",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.azure_stack (stack)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.backup-default",
    dataset: "azure.backup",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.backup (backup)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.bastion-default",
    dataset: "azure.bastion",
    group: "networking",
    description: "Parse JSON from message for azure.bastion (bastion)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.batch-default",
    dataset: "azure.batch",
    group: "compute",
    description: "Parse JSON from message for azure.batch (batch)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.blob_storage-default",
    dataset: "azure.blob_storage",
    group: "storage",
    description: "Parse JSON from message for azure.blob_storage (blob-storage)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.blueprints-default",
    dataset: "azure.blueprints",
    group: "management",
    description: "Parse JSON from message for azure.blueprints (blueprints)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.bot_service-default",
    dataset: "azure.bot_service",
    group: "data-ai",
    description: "Parse JSON from message for azure.bot_service (bot-service)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.capacity_reservation-default",
    dataset: "azure.capacity_reservation",
    group: "compute",
    description: "Parse JSON from message for azure.capacity_reservation (capacity-reservation)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.cdn-default",
    dataset: "azure.cdn",
    group: "networking",
    description: "Parse JSON from message for azure.cdn (cdn)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.cognitive_services-default",
    dataset: "azure.cognitive_services",
    group: "data-ai",
    description: "Parse JSON from message for azure.cognitive_services (cognitive-services)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.communication_services-default",
    dataset: "azure.communication_services",
    group: "iot-media",
    description: "Parse JSON from message for azure.communication_services (communication-services)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.compute_gallery-default",
    dataset: "azure.compute_gallery",
    group: "compute",
    description: "Parse JSON from message for azure.compute_gallery (compute-gallery)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.confidential_ledger-default",
    dataset: "azure.confidential_ledger",
    group: "identity-security",
    description: "Parse JSON from message for azure.confidential_ledger (confidential-ledger)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.confidential_vm-default",
    dataset: "azure.confidential_vm",
    group: "compute",
    description: "Parse JSON from message for azure.confidential_vm (confidential-vm)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.container_apps-default",
    dataset: "azure.container_apps",
    group: "containers",
    description: "Parse JSON from message for azure.container_apps (container-apps)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.container_instances-default",
    dataset: "azure.container_instances",
    group: "containers",
    description: "Parse JSON from message for azure.container_instances (container-instances)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.container_registry-default",
    dataset: "azure.container_registry",
    group: "containers",
    description: "Parse JSON from message for azure.container_registry (acr)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.cosmos_db-default",
    dataset: "azure.cosmos_db",
    group: "databases",
    description: "Parse JSON from message for azure.cosmos_db (cosmos-db)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.cost_management-default",
    dataset: "azure.cost_management",
    group: "management",
    description: "Parse JSON from message for azure.cost_management (cost-management)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.data_box-default",
    dataset: "azure.data_box",
    group: "storage",
    description: "Parse JSON from message for azure.data_box (data-box)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.data_factory-default",
    dataset: "azure.data_factory",
    group: "data-ai",
    description: "Parse JSON from message for azure.data_factory (data-factory)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.data_lake_storage-default",
    dataset: "azure.data_lake_storage",
    group: "storage",
    description: "Parse JSON from message for azure.data_lake_storage (data-lake-storage)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.databricks-default",
    dataset: "azure.databricks",
    group: "data-ai",
    description: "Parse JSON from message for azure.databricks (databricks)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.ddos_protection-default",
    dataset: "azure.ddos_protection",
    group: "networking",
    description: "Parse JSON from message for azure.ddos_protection (ddos-protection)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.dedicated_host-default",
    dataset: "azure.dedicated_host",
    group: "compute",
    description: "Parse JSON from message for azure.dedicated_host (dedicated-host)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.defender-default",
    dataset: "azure.defender",
    group: "identity-security",
    description: "Parse JSON from message for azure.defender (defender-for-cloud)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.deployment_environments-default",
    dataset: "azure.deployment_environments",
    group: "management",
    description: "Parse JSON from message for azure.deployment_environments (deployment-environments)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.dev_center-default",
    dataset: "azure.dev_center",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.dev_center (devcenter)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.device_provisioning-default",
    dataset: "azure.device_provisioning",
    group: "iot-media",
    description: "Parse JSON from message for azure.device_provisioning (device-provisioning)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.devops_pipeline-default",
    dataset: "azure.devops_pipeline",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.devops_pipeline (pipeline)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.digital_twins-default",
    dataset: "azure.digital_twins",
    group: "data-ai",
    description: "Parse JSON from message for azure.digital_twins (digital-twins)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.document_intelligence-default",
    dataset: "azure.document_intelligence",
    group: "data-ai",
    description: "Parse JSON from message for azure.document_intelligence (document-intelligence)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.entra_id-default",
    dataset: "azure.entra_id",
    group: "identity-security",
    description: "Parse JSON from message for azure.entra_id (entra-id)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.event_grid-default",
    dataset: "azure.event_grid",
    group: "integration",
    description: "Parse JSON from message for azure.event_grid (event-grid)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.event_hubs-default",
    dataset: "azure.event_hubs",
    group: "data-ai",
    description: "Parse JSON from message for azure.event_hubs (event-hubs)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.express_route-default",
    dataset: "azure.express_route",
    group: "networking",
    description: "Parse JSON from message for azure.express_route (expressroute-circuit)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.expressroute_gateway-default",
    dataset: "azure.expressroute_gateway",
    group: "networking",
    description: "Parse JSON from message for azure.expressroute_gateway (expressroute-gateway)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.fabric-default",
    dataset: "azure.fabric",
    group: "data-ai",
    description: "Parse JSON from message for azure.fabric (microsoft-fabric)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.file_storage-default",
    dataset: "azure.file_storage",
    group: "storage",
    description: "Parse JSON from message for azure.file_storage (file-storage)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.firewall-default",
    dataset: "azure.firewall",
    group: "networking",
    description: "Parse JSON from message for azure.firewall (azure-firewall)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.firewall_policy-default",
    dataset: "azure.firewall_policy",
    group: "networking",
    description: "Parse JSON from message for azure.firewall_policy (firewall-policy)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.front_door-default",
    dataset: "azure.front_door",
    group: "networking",
    description: "Parse JSON from message for azure.front_door (front-door)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.functions-default",
    dataset: "azure.functions",
    group: "serverless-apps",
    description: "Parse JSON from message for azure.functions (functions)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.hdinsight-default",
    dataset: "azure.hdinsight",
    group: "data-ai",
    description: "Parse JSON from message for azure.hdinsight (hdinsight)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.hpc_cache-default",
    dataset: "azure.hpc_cache",
    group: "storage",
    description: "Parse JSON from message for azure.hpc_cache (hpc-cache)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.image_builder-default",
    dataset: "azure.image_builder",
    group: "compute",
    description: "Parse JSON from message for azure.image_builder (image-builder)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.iot_central-default",
    dataset: "azure.iot_central",
    group: "iot-media",
    description: "Parse JSON from message for azure.iot_central (iot-central)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.iot_hub-default",
    dataset: "azure.iot_hub",
    group: "iot-media",
    description: "Parse JSON from message for azure.iot_hub (iot-hub)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.key_vault-default",
    dataset: "azure.key_vault",
    group: "identity-security",
    description: "Parse JSON from message for azure.key_vault (key-vault)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.kubernetes-default",
    dataset: "azure.kubernetes",
    group: "containers",
    description: "Parse JSON from message for azure.kubernetes (aks)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.kubernetes_fleet-default",
    dataset: "azure.kubernetes_fleet",
    group: "containers",
    description: "Parse JSON from message for azure.kubernetes_fleet (kubernetes-fleet)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.lab_services-default",
    dataset: "azure.lab_services",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.lab_services (lab-services)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.load_balancer-default",
    dataset: "azure.load_balancer",
    group: "networking",
    description: "Parse JSON from message for azure.load_balancer (load-balancer)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.load_testing-default",
    dataset: "azure.load_testing",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.load_testing (load-testing)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.logic_apps-default",
    dataset: "azure.logic_apps",
    group: "integration",
    description: "Parse JSON from message for azure.logic_apps (logic-apps)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.machine_learning-default",
    dataset: "azure.machine_learning",
    group: "data-ai",
    description: "Parse JSON from message for azure.machine_learning (machine-learning)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.managed_identity-default",
    dataset: "azure.managed_identity",
    group: "identity-security",
    description: "Parse JSON from message for azure.managed_identity (managed-identity)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.maps-default",
    dataset: "azure.maps",
    group: "management",
    description: "Parse JSON from message for azure.maps (maps)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.mariadb-default",
    dataset: "azure.mariadb",
    group: "databases",
    description: "Parse JSON from message for azure.mariadb (database-for-mariadb)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.media_services-default",
    dataset: "azure.media_services",
    group: "iot-media",
    description: "Parse JSON from message for azure.media_services (media-services)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.migrate-default",
    dataset: "azure.migrate",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.migrate (migrate)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.monitor-default",
    dataset: "azure.monitor",
    group: "management",
    description: "Parse JSON from message for azure.monitor (monitor)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.mysql-default",
    dataset: "azure.mysql",
    group: "databases",
    description: "Parse JSON from message for azure.mysql (database-for-mysql)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.nat_gateway-default",
    dataset: "azure.nat_gateway",
    group: "networking",
    description: "Parse JSON from message for azure.nat_gateway (nat-gateway)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.netapp_files-default",
    dataset: "azure.netapp_files",
    group: "storage",
    description: "Parse JSON from message for azure.netapp_files (netapp-files)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.network_security_groups-default",
    dataset: "azure.network_security_groups",
    group: "networking",
    description: "Parse JSON from message for azure.network_security_groups (network-security-groups)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.network_watcher-default",
    dataset: "azure.network_watcher",
    group: "networking",
    description: "Parse JSON from message for azure.network_watcher (network-watcher)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.notification_hubs-default",
    dataset: "azure.notification_hubs",
    group: "iot-media",
    description: "Parse JSON from message for azure.notification_hubs (notification-hubs)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.openai-default",
    dataset: "azure.openai",
    group: "data-ai",
    description: "Parse JSON from message for azure.openai (openai)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.oracle_on_azure-default",
    dataset: "azure.oracle_on_azure",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.oracle_on_azure (oracle-on-azure)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.policy-default",
    dataset: "azure.policy",
    group: "management",
    description: "Parse JSON from message for azure.policy (policy)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.postgresql-default",
    dataset: "azure.postgresql",
    group: "databases",
    description: "Parse JSON from message for azure.postgresql (database-for-postgresql)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.power_bi_embedded-default",
    dataset: "azure.power_bi_embedded",
    group: "data-ai",
    description: "Parse JSON from message for azure.power_bi_embedded (power-bi-embedded)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.private_dns-default",
    dataset: "azure.private_dns",
    group: "networking",
    description: "Parse JSON from message for azure.private_dns (private-dns)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.private_link-default",
    dataset: "azure.private_link",
    group: "networking",
    description: "Parse JSON from message for azure.private_link (private-link)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.proximity_placement_groups-default",
    dataset: "azure.proximity_placement_groups",
    group: "compute",
    description: "Parse JSON from message for azure.proximity_placement_groups (proximity-placement)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.purview-default",
    dataset: "azure.purview",
    group: "data-ai",
    description: "Parse JSON from message for azure.purview (purview)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.queue_storage-default",
    dataset: "azure.queue_storage",
    group: "storage",
    description: "Parse JSON from message for azure.queue_storage (queue-storage)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.redis_cache-default",
    dataset: "azure.redis_cache",
    group: "databases",
    description: "Parse JSON from message for azure.redis_cache (cache-for-redis)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.relay-default",
    dataset: "azure.relay",
    group: "integration",
    description: "Parse JSON from message for azure.relay (relay)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.resource_graph-default",
    dataset: "azure.resource_graph",
    group: "management",
    description: "Parse JSON from message for azure.resource_graph (resource-graph)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.route_server-default",
    dataset: "azure.route_server",
    group: "networking",
    description: "Parse JSON from message for azure.route_server (route-server)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.sap_on_azure-default",
    dataset: "azure.sap_on_azure",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.sap_on_azure (sap-on-azure)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.sentinel-default",
    dataset: "azure.sentinel",
    group: "identity-security",
    description: "Parse JSON from message for azure.sentinel (sentinel)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.service_bus-default",
    dataset: "azure.service_bus",
    group: "integration",
    description: "Parse JSON from message for azure.service_bus (service-bus)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.signalr-default",
    dataset: "azure.signalr",
    group: "iot-media",
    description: "Parse JSON from message for azure.signalr (signalr)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.site_recovery-default",
    dataset: "azure.site_recovery",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.site_recovery (site-recovery)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.speech-default",
    dataset: "azure.speech",
    group: "data-ai",
    description: "Parse JSON from message for azure.speech (speech)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.spring_apps-default",
    dataset: "azure.spring_apps",
    group: "serverless-apps",
    description: "Parse JSON from message for azure.spring_apps (spring-apps)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.sql_database-default",
    dataset: "azure.sql_database",
    group: "databases",
    description: "Parse JSON from message for azure.sql_database (sql-database)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.sql_managed_instance-default",
    dataset: "azure.sql_managed_instance",
    group: "databases",
    description: "Parse JSON from message for azure.sql_managed_instance (sql-managed-instance)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.static_web_apps-default",
    dataset: "azure.static_web_apps",
    group: "serverless-apps",
    description: "Parse JSON from message for azure.static_web_apps (static-web-apps)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.storage_sync-default",
    dataset: "azure.storage_sync",
    group: "storage",
    description: "Parse JSON from message for azure.storage_sync (storage-sync)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.stream_analytics-default",
    dataset: "azure.stream_analytics",
    group: "data-ai",
    description: "Parse JSON from message for azure.stream_analytics (stream-analytics)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.synapse-default",
    dataset: "azure.synapse",
    group: "data-ai",
    description: "Parse JSON from message for azure.synapse (synapse-workspace)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.table_storage-default",
    dataset: "azure.table_storage",
    group: "storage",
    description: "Parse JSON from message for azure.table_storage (table-storage)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.time_series_insights-default",
    dataset: "azure.time_series_insights",
    group: "iot-media",
    description: "Parse JSON from message for azure.time_series_insights (time-series-insights)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.traffic_manager-default",
    dataset: "azure.traffic_manager",
    group: "networking",
    description: "Parse JSON from message for azure.traffic_manager (traffic-manager)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.translator-default",
    dataset: "azure.translator",
    group: "data-ai",
    description: "Parse JSON from message for azure.translator (translator)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.virtual_machines-default",
    dataset: "azure.virtual_machines",
    group: "compute",
    description: "Parse JSON from message for azure.virtual_machines (virtual-machines)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.virtual_network-default",
    dataset: "azure.virtual_network",
    group: "networking",
    description: "Parse JSON from message for azure.virtual_network (virtual-network)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.virtual_wan-default",
    dataset: "azure.virtual_wan",
    group: "networking",
    description: "Parse JSON from message for azure.virtual_wan (virtual-wan)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.vision-default",
    dataset: "azure.vision",
    group: "data-ai",
    description: "Parse JSON from message for azure.vision (vision)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.vm_scale_sets-default",
    dataset: "azure.vm_scale_sets",
    group: "compute",
    description: "Parse JSON from message for azure.vm_scale_sets (vm-scale-sets)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.vmware_solution-default",
    dataset: "azure.vmware_solution",
    group: "resilience-migration",
    description: "Parse JSON from message for azure.vmware_solution (vmware-solution)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.vpn_client-default",
    dataset: "azure.vpn_client",
    group: "networking",
    description: "Parse JSON from message for azure.vpn_client (vpn-client)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.vpn_gateway-default",
    dataset: "azure.vpn_gateway",
    group: "networking",
    description: "Parse JSON from message for azure.vpn_gateway (vpn-gateway)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
  {
    id: "logs-azure.waf-default",
    dataset: "azure.waf",
    group: "networking",
    description: "Parse JSON from message for azure.waf (waf-policy)",
    processors: [
      { json: { field: "message", target_field: "azure.parsed", ignore_failure: true } },
    ],
  },
];
