import {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  EuiTitle,
  EuiSpacer,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiCheckbox,
  EuiPanel,
  EuiCode,
  EuiHorizontalRule,
  EuiConfirmModal,
  EuiSwitch,
  EuiFieldSearch,
  EuiBadge,
  EuiLoadingSpinner,
} from "@elastic/eui";

import type { CloudId } from "../cloud/types";
import K from "../theme";
import type { ServiceGroup } from "../data/serviceGroups";
import type {
  AlertRuleEntry,
  AlertRuleFile,
  CloudSetupBundle,
  MlJobEntry,
  MlJobFile,
  PipelineEntry,
} from "../setup/types";
import { dashboardDefToSavedObjectId } from "../setup/dashboardToImportNdjson";
import { stableDashboardKey } from "../setup/stableDashboardKey";
import { runSetupInstall } from "../setup/runSetupInstall";
import {
  proxyCall,
  resolveFleetPackageVersion,
  deleteKibanaDashboard,
  SAVED_OBJECT_DELETE_UNSUPPORTED_HINT,
} from "../setup/setupProxy";
import { InstallerRow } from "../components/InstallerRow";
import {
  loadSetupLog,
  saveSetupLog,
  clearSetupLog,
  MAX_SETUP_LOG_ENTRIES,
} from "../utils/sessionActivityLog";
import { dashboardTitleServiceFragment } from "../setup/setupAssetMatch";
import { polishSetupCategoryLabel, polishSetupDashboardTitle } from "../setup/setupDisplayPolish";

interface SetupPageProps {
  setupBundle: CloudSetupBundle;
  /** Resets asset lists when switching vendor (AWS / GCP / Azure). */
  cloudId: CloudId;
  /** Services (or trace services) chosen on the Services step — drives “Align with Services”. */
  selectedShipServiceIds: string[];
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  onInstallComplete: () => void;
  onUninstallComplete?: () => void;
  onReinstallComplete?: () => void;
  /** sessionStorage key — survives refresh; omit to disable persistence (tests). */
  setupLogPersistenceKey?: string;
  /**
   * Same groups as the Services step — dashboard lists are grouped under these labels.
   * When empty, grouping falls back to polished dashboard title fragments.
   */
  serviceGroups?: ServiceGroup[];
}

type LogLine = { text: string; type: "info" | "ok" | "error" | "warn"; at?: string };

/**
 * Simple expand/collapse for setup asset groups. EuiAccordion uses height animation +
 * ResizeObserver; with blockSize:0 while closed the observer can stay at 0 so opening
 * shows no content — this pattern matches ServiceGrid (collapsed === true hides body).
 *
 * **`expandedSections.has(k)`** means the user opened that group. Default = all collapsed (empty Set).
 */
function SetupCollapsible({
  sectionKey,
  expandedSections,
  setExpandedSections,
  header,
  children,
  variant = "default",
}: {
  sectionKey: string;
  expandedSections: Set<string>;
  setExpandedSections: Dispatch<SetStateAction<Set<string>>>;
  header: ReactNode;
  children: ReactNode;
  variant?: "default" | "category";
}) {
  const expanded = expandedSections.has(sectionKey);
  const isCategory = variant === "category";
  return (
    <div style={{ marginBottom: isCategory ? 10 : 6 }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() =>
          setExpandedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionKey)) next.delete(sectionKey);
            else next.add(sectionKey);
            return next;
          })
        }
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          cursor: "pointer",
          border: isCategory
            ? "1px solid var(--euiColorMediumShade, #98a2b3)"
            : "1px solid var(--euiColorLightShade, #d3dae6)",
          borderRadius: 6,
          padding: isCategory ? "10px 14px" : "8px 12px",
          background: isCategory
            ? "var(--euiColorLightestShade, #f5f7fa)"
            : "var(--euiColorEmptyShade, #fff)",
          font: "inherit",
        }}
      >
        <span
          style={{
            fontSize: isCategory ? 11 : 10,
            color: "var(--euiColorSubdued, #69707d)",
            flexShrink: 0,
          }}
        >
          {expanded ? "\u25BC" : "\u25B6"}
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>{header}</span>
      </button>
      {expanded && (
        <div
          style={{
            padding: isCategory ? "8px 8px 0 8px" : "8px 4px 0 4px",
            borderLeft: `2px solid ${isCategory ? "var(--euiColorMediumShade, #98a2b3)" : "var(--euiColorLightShade, #d3dae6)"}`,
            marginLeft: 10,
            marginTop: 4,
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function SetupPage({
  setupBundle,
  cloudId,
  selectedShipServiceIds,
  elasticUrl,
  kibanaUrl,
  apiKey,
  onInstallComplete,
  onUninstallComplete,
  onReinstallComplete,
  setupLogPersistenceKey,
  serviceGroups: _serviceGroups = [],
}: SetupPageProps) {
  void _serviceGroups;
  const PIPELINES: PipelineEntry[] = setupBundle.pipelines;
  const ML_JOB_FILES: MlJobFile[] = setupBundle.mlJobFiles;
  const DASHBOARDS = setupBundle.dashboards;
  const ALERT_RULE_FILES = setupBundle.alertRuleFiles;

  const [removeMode, setRemoveMode] = useState(false);

  const [enableIntegration, setEnableIntegration] = useState(false);
  const [enableApm, setEnableApm] = useState(false);
  const [enablePipelines, setEnablePipelines] = useState(false);
  const [enableDashboards, setEnableDashboards] = useState(false);
  const [enableMlJobs, setEnableMlJobs] = useState(false);
  const [enableLoadgenIntegrations, setEnableLoadgenIntegrations] = useState(false);
  /** Pipeline / dashboard / ML group section keys the user has expanded (default: none). */
  const [expandedSetupSections, setExpandedSetupSections] = useState<Set<string>>(() => new Set());

  const [selectedPipelineIds, setSelectedPipelineIds] = useState<Set<string>>(
    () => new Set(PIPELINES.map((p) => p.id))
  );
  const [assetFilterQuery, setAssetFilterQuery] = useState("");

  const [selectedDashboardKeys, setSelectedDashboardKeys] = useState<Set<string>>(
    () => new Set(setupBundle.dashboards.map((d, i) => stableDashboardKey(d, i)))
  );

  const [selectedMlJobIds, setSelectedMlJobIds] = useState<Set<string>>(
    () => new Set(ML_JOB_FILES.flatMap((f) => f.jobs.map((j) => j.id)))
  );

  useEffect(() => {
    setSelectedPipelineIds(new Set(setupBundle.pipelines.map((p) => p.id)));
    setSelectedDashboardKeys(
      new Set(setupBundle.dashboards.map((d, i) => stableDashboardKey(d, i)))
    );
    setSelectedMlJobIds(new Set(setupBundle.mlJobFiles.flatMap((f) => f.jobs.map((j) => j.id))));
    setAssetFilterQuery("");
    setExpandedSetupSections(new Set());
  }, [cloudId, setupBundle.fleetPackage]); // eslint-disable-line react-hooks/exhaustive-deps -- reset only on vendor switch

  const [isRunning, setIsRunning] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [currentPhaseLabel, setCurrentPhaseLabel] = useState("");
  const initialSetupSnap = setupLogPersistenceKey ? loadSetupLog(setupLogPersistenceKey) : null;
  const [log, setLog] = useState<LogLine[]>(
    () => initialSetupSnap?.entries.map((e) => ({ text: e.text, type: e.type, at: e.at })) ?? []
  );
  const [showInterruptedBanner, setShowInterruptedBanner] = useState(
    () => !!(initialSetupSnap?.installRunActive && (initialSetupSnap.entries?.length ?? 0) > 0)
  );
  const [confirmUninstallOpen, setConfirmUninstallOpen] = useState(false);
  const [confirmReinstallOpen, setConfirmReinstallOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const installRunActiveRef = useRef(false);
  const logRef = useRef<LogLine[]>(log);
  logRef.current = log;

  useEffect(() => {
    if (!setupLogPersistenceKey) return;
    const s = loadSetupLog(setupLogPersistenceKey);
    if (s?.installRunActive) {
      saveSetupLog(setupLogPersistenceKey, { ...s, installRunActive: false });
    }
  }, [setupLogPersistenceKey]);

  useEffect(() => {
    setLog([]);
    setIsDone(false);
    setCurrentPhaseLabel("");
    setConfirmUninstallOpen(false);
    setConfirmReinstallOpen(false);
    setConfirmResetOpen(false);
    if (setupLogPersistenceKey) clearSetupLog(setupLogPersistenceKey);
  }, [removeMode, setupLogPersistenceKey]);

  const flushSetupSnapshot = useCallback(() => {
    if (!setupLogPersistenceKey) return;
    const entries = logRef.current.map((e) => ({
      text: e.text,
      type: e.type,
      at: e.at ?? new Date().toISOString(),
    }));
    saveSetupLog(setupLogPersistenceKey, {
      v: 1,
      installRunActive: installRunActiveRef.current,
      entries,
    });
  }, [setupLogPersistenceKey]);

  const addLog = useCallback(
    (text: string, type: LogLine["type"] = "info") => {
      if (
        text.startsWith("Installing ") ||
        text.startsWith("Removing ") ||
        text.startsWith("Creating TSDS index templates")
      ) {
        setCurrentPhaseLabel(text);
      }
      const at = new Date().toISOString();
      setLog((prev) => {
        const next = [...prev, { text, type, at }].slice(-MAX_SETUP_LOG_ENTRIES);
        logRef.current = next;
        if (setupLogPersistenceKey) {
          saveSetupLog(setupLogPersistenceKey, {
            v: 1,
            installRunActive: installRunActiveRef.current,
            entries: next.map((e) => ({
              text: e.text,
              type: e.type,
              at: e.at ?? at,
            })),
          });
        }
        return next;
      });
    },
    [setupLogPersistenceKey]
  );

  const clearSetupActivityLog = () => {
    setLog([]);
    logRef.current = [];
    setShowInterruptedBanner(false);
    setCurrentPhaseLabel("");
    if (setupLogPersistenceKey) clearSetupLog(setupLogPersistenceKey);
  };

  const hasEs = !!elasticUrl.trim() && !!apiKey.trim();
  const hasKb = !!kibanaUrl.trim() && !!apiKey.trim();
  const needsKb = enableIntegration || enableApm || enableLoadgenIntegrations;
  const anyEnabled = enableIntegration || enableApm || enableLoadgenIntegrations;
  const canRun = anyEnabled && hasEs && (!needsKb || hasKb);

  function toggleGroup<T>(set: Set<T>, val: T): Set<T> {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  }

  const uid = removeMode ? "rm" : "in";

  const descIntegration: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> the Elastic {setupBundle.fleetPackage} integration package from
      Fleet (force=true).
    </>
  ) : (
    <>
      Installs the official Elastic {setupBundle.fleetPackage} integration package via Kibana Fleet
      (templates, ILM, dashboards).
    </>
  );

  const descApm: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> the APM Fleet package.
    </>
  ) : (
    <>
      Installs the Elastic APM integration via Kibana Fleet. Required to receive OpenTelemetry trace
      data from the generator.
    </>
  );

  // ── Per-service integration packs ──────────────────────────────────────────
  // Merge pipelines, dashboards, and ML jobs into unified per-service packs.

  type ServiceCategory =
    | "Compute"
    | "Networking"
    | "Storage"
    | "Databases"
    | "Streaming & Messaging"
    | "Analytics"
    | "AI & Machine Learning"
    | "Security & Identity"
    | "Developer Tools"
    | "IoT"
    | "Management & Governance"
    | "End User & Media"
    | "Chained Events"
    | "Other";

  const SERVICE_CATEGORY: Record<string, ServiceCategory> = {
    // Compute
    lambda: "Compute",
    ec2: "Compute",
    ecs: "Compute",
    eks: "Compute",
    fargate: "Compute",
    batch: "Compute",
    elasticbeanstalk: "Compute",
    ecr: "Compute",
    autoscaling: "Compute",
    imagebuilder: "Compute",
    outposts: "Compute",
    wavelength: "Compute",
    apprunner: "Compute",
    mainframemodernization: "Compute",
    parallelcomputing: "Compute",
    evs: "Compute",
    simspaceweaver: "Compute",
    lightsail: "Compute",

    // Networking
    elb: "Networking",
    cloudfront: "Networking",
    waf: "Networking",
    route53: "Networking",
    networkfirewall: "Networking",
    shield: "Networking",
    globalaccelerator: "Networking",
    transitgateway: "Networking",
    directconnect: "Networking",
    vpn: "Networking",
    privatelink: "Networking",
    networkmanager: "Networking",
    natgateway: "Networking",
    vpc: "Networking",
    vpclattice: "Networking",
    appmesh: "Networking",
    clientvpn: "Networking",
    cloudmap: "Networking",
    vpcipam: "Networking",
    private5g: "Networking",
    apigateway: "Networking",

    // Storage
    s3: "Storage",
    storagelens: "Storage",
    s3intelligenttier: "Storage",
    s3batchops: "Storage",
    ebs: "Storage",
    efs: "Storage",
    fsx: "Storage",
    datasync: "Storage",
    backup: "Storage",
    storagegateway: "Storage",

    // Databases
    dynamodb: "Databases",
    elasticache: "Databases",
    redshift: "Databases",
    opensearch: "Databases",
    docdb: "Databases",
    aurora: "Databases",
    neptune: "Databases",
    timestream: "Databases",
    qldb: "Databases",
    dax: "Databases",
    keyspaces: "Databases",
    memorydb: "Databases",
    rds: "Databases",

    // Streaming & Messaging
    kinesis: "Streaming & Messaging",
    firehose: "Streaming & Messaging",
    msk: "Streaming & Messaging",
    sqs: "Streaming & Messaging",
    sns: "Streaming & Messaging",
    amazonmq: "Streaming & Messaging",
    eventbridge: "Streaming & Messaging",
    stepfunctions: "Streaming & Messaging",
    kinesisanalytics: "Streaming & Messaging",
    endusermessaging: "Streaming & Messaging",

    // Analytics
    emr: "Analytics",
    glue: "Analytics",
    athena: "Analytics",
    lakeformation: "Analytics",
    quicksight: "Analytics",
    databrew: "Analytics",
    appflow: "Analytics",
    mwaa: "Analytics",
    cleanrooms: "Analytics",
    datazone: "Analytics",
    entityresolution: "Analytics",
    dataexchange: "Analytics",
    appfabric: "Analytics",
    b2bi: "Analytics",
    "data-pipeline": "Chained Events",

    // AI & Machine Learning
    sagemaker: "AI & Machine Learning",
    bedrock: "AI & Machine Learning",
    bedrockagent: "AI & Machine Learning",
    bedrockdataautomation: "AI & Machine Learning",
    rekognition: "AI & Machine Learning",
    textract: "AI & Machine Learning",
    comprehend: "AI & Machine Learning",
    comprehendmedical: "AI & Machine Learning",
    translate: "AI & Machine Learning",
    transcribe: "AI & Machine Learning",
    polly: "AI & Machine Learning",
    forecast: "AI & Machine Learning",
    personalize: "AI & Machine Learning",
    lex: "AI & Machine Learning",
    lookoutmetrics: "AI & Machine Learning",
    qbusiness: "AI & Machine Learning",
    kendra: "AI & Machine Learning",
    a2i: "AI & Machine Learning",
    healthlake: "AI & Machine Learning",
    nova: "AI & Machine Learning",
    lookoutvision: "AI & Machine Learning",
    healthomics: "AI & Machine Learning",
    lookoutequipment: "AI & Machine Learning",
    monitron: "AI & Machine Learning",

    // Security & Identity
    guardduty: "Security & Identity",
    securityhub: "Security & Identity",
    macie: "Security & Identity",
    inspector: "Security & Identity",
    config: "Security & Identity",
    accessanalyzer: "Security & Identity",
    cognito: "Security & Identity",
    kms: "Security & Identity",
    secretsmanager: "Security & Identity",
    acm: "Security & Identity",
    identitycenter: "Security & Identity",
    detective: "Security & Identity",
    cloudtrail: "Security & Identity",
    verifiedaccess: "Security & Identity",
    securitylake: "Security & Identity",
    securityir: "Security & Identity",
    cloudhsm: "Security & Identity",
    auditmanager: "Security & Identity",
    verifiedpermissions: "Security & Identity",
    paymentcryptography: "Security & Identity",
    artifact: "Security & Identity",
    networkaccessanalyzer: "Security & Identity",
    incidentmanager: "Security & Identity",

    // Developer Tools
    codebuild: "Developer Tools",
    codepipeline: "Developer Tools",
    codedeploy: "Developer Tools",
    codecommit: "Developer Tools",
    codeartifact: "Developer Tools",
    amplify: "Developer Tools",
    xray: "Developer Tools",
    codeguru: "Developer Tools",
    codecatalyst: "Developer Tools",
    devicefarm: "Developer Tools",
    proton: "Developer Tools",
    qdeveloper: "Developer Tools",
    cloudshell: "Developer Tools",
    cloud9: "Developer Tools",
    robomaker: "Developer Tools",
    cicd: "Developer Tools",

    // IoT
    iotcore: "IoT",
    greengrass: "IoT",
    iotanalytics: "IoT",
    iotevents: "IoT",
    iotsitewise: "IoT",
    iotdefender: "IoT",
    iottwinmaker: "IoT",
    iotfleetwise: "IoT",
    groundstation: "IoT",
    kinesisvideo: "IoT",
    panorama: "IoT",
    freertos: "IoT",

    // Management & Governance
    cloudformation: "Management & Governance",
    ssm: "Management & Governance",
    cloudwatch: "Management & Governance",
    health: "Management & Governance",
    trustedadvisor: "Management & Governance",
    controltower: "Management & Governance",
    organizations: "Management & Governance",
    servicecatalog: "Management & Governance",
    servicequotas: "Management & Governance",
    computeoptimizer: "Management & Governance",
    budgets: "Management & Governance",
    billing: "Management & Governance",
    dms: "Management & Governance",
    fis: "Management & Governance",
    managedgrafana: "Management & Governance",
    supplychain: "Management & Governance",
    arc: "Management & Governance",
    appconfig: "Management & Governance",
    drs: "Management & Governance",
    licensemanager: "Management & Governance",
    chatbot: "Management & Governance",
    cloudwatchrum: "Management & Governance",
    ram: "Management & Governance",
    resiliencehub: "Management & Governance",
    migrationhub: "Management & Governance",

    // End User & Media
    mediaconvert: "End User & Media",
    medialive: "End User & Media",
    workspaces: "End User & Media",
    connect: "End User & Media",
    appstream: "End User & Media",
    deadlinecloud: "End User & Media",
    chimesdkvoice: "End User & Media",
    workmail: "End User & Media",
    wickr: "End User & Media",
    ses: "End User & Media",
    pinpoint: "End User & Media",
    transferfamily: "End User & Media",
    frauddetector: "End User & Media",
    gamelift: "End User & Media",
    locationservice: "End User & Media",
    managedblockchain: "End User & Media",
    devopsguru: "End User & Media",
    appsync: "End User & Media",

    // ── Azure services ──────────────────────────────────────────────────────
    "virtual-machines": "Compute",
    "vm-scale-sets": "Compute",
    "dedicated-host": "Compute",
    "proximity-placement": "Compute",
    "confidential-vm": "Compute",
    "compute-gallery": "Compute",
    "image-builder": "Compute",
    aks: "Compute",
    "container-apps": "Compute",
    "container-instances": "Compute",
    "kubernetes-fleet": "Compute",
    acr: "Compute",
    "app-service": "Compute",
    functions: "Compute",
    "static-web-apps": "Compute",
    "spring-apps": "Compute",
    "virtual-network": "Networking",
    "network-security-groups": "Networking",
    "load-balancer": "Networking",
    "application-gateway": "Networking",
    "front-door": "Networking",
    cdn: "Networking",
    "expressroute-circuit": "Networking",
    "expressroute-gateway": "Networking",
    "vpn-gateway": "Networking",
    "vpn-client": "Networking",
    "nat-gateway": "Networking",
    "private-link": "Networking",
    "private-dns": "Networking",
    "traffic-manager": "Networking",
    "azure-firewall": "Networking",
    "firewall-policy": "Networking",
    "ddos-protection": "Networking",
    bastion: "Networking",
    "waf-policy": "Networking",
    "virtual-wan": "Networking",
    "route-server": "Networking",
    "network-watcher": "Networking",
    "blob-storage": "Storage",
    "file-storage": "Storage",
    "queue-storage": "Storage",
    "table-storage": "Storage",
    "data-lake-storage": "Storage",
    "storage-sync": "Storage",
    "netapp-files": "Storage",
    "hpc-cache": "Storage",
    "data-box": "Storage",
    "sql-database": "Databases",
    "sql-managed-instance": "Databases",
    "cosmos-db": "Databases",
    "cache-for-redis": "Databases",
    "database-for-postgresql": "Databases",
    "database-for-mysql": "Databases",
    "database-for-mariadb": "Databases",
    "synapse-workspace": "Analytics",
    databricks: "Analytics",
    purview: "Analytics",
    "data-factory": "Analytics",
    "stream-analytics": "Analytics",
    "event-hubs": "Streaming & Messaging",
    "digital-twins": "Analytics",
    hdinsight: "Analytics",
    "analysis-services": "Analytics",
    "power-bi-embedded": "Analytics",
    "microsoft-fabric": "Analytics",
    "cognitive-services": "AI & Machine Learning",
    openai: "AI & Machine Learning",
    "machine-learning": "AI & Machine Learning",
    "ai-search": "AI & Machine Learning",
    "bot-service": "AI & Machine Learning",
    vision: "AI & Machine Learning",
    speech: "AI & Machine Learning",
    translator: "AI & Machine Learning",
    "document-intelligence": "AI & Machine Learning",
    "entra-id": "Security & Identity",
    m365: "Security & Identity",
    "key-vault": "Security & Identity",
    "managed-identity": "Security & Identity",
    "defender-for-cloud": "Security & Identity",
    sentinel: "Security & Identity",
    attestation: "Security & Identity",
    "confidential-ledger": "Security & Identity",
    "active-users-services": "Management & Governance",
    "teams-user-activity": "Management & Governance",
    "outlook-activity": "Management & Governance",
    "onedrive-usage-storage": "Management & Governance",
    "service-bus": "Streaming & Messaging",
    "event-grid": "Streaming & Messaging",
    "logic-apps": "Streaming & Messaging",
    "api-management": "Networking",
    "api-center": "Networking",
    relay: "Streaming & Messaging",
    "iot-hub": "IoT",
    "iot-central": "IoT",
    "device-provisioning": "IoT",
    "time-series-insights": "IoT",
    "media-services": "End User & Media",
    "communication-services": "End User & Media",
    signalr: "End User & Media",
    "notification-hubs": "End User & Media",
    monitor: "Management & Governance",
    "activity-log": "Management & Governance",
    policy: "Management & Governance",
    advisor: "Management & Governance",
    "cost-management": "Management & Governance",
    "resource-graph": "Management & Governance",
    blueprints: "Management & Governance",
    "automation-account": "Management & Governance",
    "app-configuration": "Management & Governance",
    "deployment-environments": "Developer Tools",
    maps: "End User & Media",
    "site-recovery": "Management & Governance",
    migrate: "Management & Governance",
    devcenter: "Developer Tools",
    "lab-services": "Developer Tools",
    "load-testing": "Developer Tools",
    pipeline: "Developer Tools",
    stack: "Management & Governance",
    "oracle-on-azure": "Databases",
    "sap-on-azure": "Compute",
    "vmware-solution": "Compute",
    "capacity-reservation": "Compute",
    "azure-security-chain": "Chained Events",
    "azure-cspm": "Security & Identity",
    "azure-kspm": "Security & Identity",
    "azure-iam-privesc-chain": "Chained Events",
    "azure-data-exfil-chain": "Chained Events",
    "azure-data-pipeline-chain": "Chained Events",

    // ── GCP services ────────────────────────────────────────────────────────
    "cloud-functions": "Compute",
    "cloud-run": "Compute",
    "app-engine": "Compute",
    "cloud-tasks": "Compute",
    "cloud-scheduler": "Compute",
    "cloud-run-jobs": "Compute",
    "serverless-vpc-access": "Networking",
    "compute-engine": "Compute",
    "vmware-engine": "Compute",
    "bare-metal": "Compute",
    "cloud-tpu": "AI & Machine Learning",
    "cloud-workstations": "Developer Tools",
    gke: "Compute",
    anthos: "Compute",
    "artifact-registry": "Developer Tools",
    "container-registry": "Developer Tools",
    "gke-autopilot": "Compute",
    "anthos-service-mesh": "Networking",
    "anthos-config-mgmt": "Management & Governance",
    "gke-enterprise": "Compute",
    "migrate-to-containers": "Compute",
    "vpc-flow": "Networking",
    "cloud-lb": "Networking",
    "cloud-cdn": "Networking",
    "cloud-dns": "Networking",
    "cloud-armor": "Security & Identity",
    "cloud-nat": "Networking",
    "cloud-vpn": "Networking",
    "cloud-interconnect": "Networking",
    "cloud-router": "Networking",
    "traffic-director": "Networking",
    "private-service-connect": "Networking",
    "network-connectivity-center": "Networking",
    "network-intelligence-center": "Networking",
    "cloud-ids": "Security & Identity",
    "cloud-domains": "Networking",
    "media-cdn": "Networking",
    "security-command-center": "Security & Identity",
    iam: "Security & Identity",
    "secret-manager": "Security & Identity",
    "cloud-kms": "Security & Identity",
    "certificate-authority": "Security & Identity",
    beyondcorp: "Security & Identity",
    "binary-authorization": "Security & Identity",
    "access-context-manager": "Security & Identity",
    "assured-workloads": "Security & Identity",
    chronicle: "Security & Identity",
    "recaptcha-enterprise": "Security & Identity",
    "web-security-scanner": "Security & Identity",
    "identity-aware-proxy": "Security & Identity",
    dlp: "Security & Identity",
    "web-risk": "Security & Identity",
    "cloud-identity": "Security & Identity",
    "managed-ad": "Security & Identity",
    "security-operations": "Security & Identity",
    "cloud-storage": "Storage",
    "persistent-disk": "Storage",
    filestore: "Storage",
    "backup-dr": "Storage",
    "cloud-sql": "Databases",
    "cloud-spanner": "Databases",
    firestore: "Databases",
    bigtable: "Databases",
    alloydb: "Databases",
    memorystore: "Databases",
    "database-migration": "Databases",
    bigquery: "Analytics",
    dataproc: "Analytics",
    "data-fusion": "Analytics",
    composer: "Analytics",
    looker: "Analytics",
    dataplex: "Analytics",
    "data-catalog": "Analytics",
    "analytics-hub": "Analytics",
    dataprep: "Analytics",
    datastream: "Analytics",
    pubsub: "Streaming & Messaging",
    dataflow: "Streaming & Messaging",
    "pubsub-lite": "Streaming & Messaging",
    "vertex-ai": "AI & Machine Learning",
    gemini: "AI & Machine Learning",
    "vision-ai": "AI & Machine Learning",
    "natural-language": "AI & Machine Learning",
    translation: "AI & Machine Learning",
    "speech-to-text": "AI & Machine Learning",
    "text-to-speech": "AI & Machine Learning",
    dialogflow: "AI & Machine Learning",
    "document-ai": "AI & Machine Learning",
    "recommendations-ai": "AI & Machine Learning",
    automl: "AI & Machine Learning",
    "vertex-ai-workbench": "AI & Machine Learning",
    "vertex-ai-pipelines": "AI & Machine Learning",
    "vertex-ai-feature-store": "AI & Machine Learning",
    "vertex-ai-matching-engine": "AI & Machine Learning",
    "vertex-ai-tensorboard": "AI & Machine Learning",
    "contact-center-ai": "AI & Machine Learning",
    "healthcare-api": "AI & Machine Learning",
    "retail-api": "AI & Machine Learning",
    "cloud-build": "Developer Tools",
    "cloud-deploy": "Developer Tools",
    firebase: "Developer Tools",
    "cloud-endpoints": "Networking",
    apigee: "Networking",
    "cloud-shell": "Developer Tools",
    "api-gateway": "Networking",
    "cloud-monitoring": "Management & Governance",
    "cloud-logging": "Management & Governance",
    "resource-manager": "Management & Governance",
    "deployment-manager": "Management & Governance",
    "cloud-asset-inventory": "Management & Governance",
    "org-policy": "Management & Governance",
    "service-directory": "Management & Governance",
    "cloud-audit-logs": "Management & Governance",
    "active-assist": "Management & Governance",
    "essential-contacts": "Management & Governance",
    "error-reporting": "Management & Governance",
    "iot-core": "IoT",
    transcoder: "End User & Media",
    "video-intelligence": "End User & Media",
    "application-integration": "Streaming & Messaging",
    workflows: "Compute",
    eventarc: "Streaming & Messaging",

    // GCP services with no direct match from pipeline datasets
    "access-transparency": "Security & Identity",
    "bms-oracle": "Databases",
    "carbon-footprint": "Management & Governance",
    "cloud-trace": "Management & Governance",
    "config-connector": "Management & Governance",
    "livestream-api": "End User & Media",
    "migrate-vms": "Compute",
    "network-service-tiers": "Networking",
    "os-login": "Security & Identity",
    "packet-mirroring": "Networking",
    "cloud-profiler": "Management & Governance",
    "shielded-vms": "Compute",
    "source-repositories": "Developer Tools",
    "storage-transfer": "Storage",
    "resource-tags": "Management & Governance",
    "vertex-ai-search": "AI & Machine Learning",
    "vpc-service-controls": "Security & Identity",
    "gcp-security-chain": "Chained Events",
    "gcp-cspm": "Security & Identity",
    "gcp-kspm": "Security & Identity",
    "gcp-iam-privesc-chain": "Chained Events",
    "gcp-data-exfil-chain": "Chained Events",
    "gcp-data-pipeline-chain": "Chained Events",
  };

  const CATEGORY_ORDER: ServiceCategory[] = [
    "Compute",
    "Networking",
    "Storage",
    "Databases",
    "Streaming & Messaging",
    "Analytics",
    "AI & Machine Learning",
    "Security & Identity",
    "Developer Tools",
    "IoT",
    "Management & Governance",
    "End User & Media",
    "Chained Events",
    "Other",
  ];

  interface ServicePack {
    serviceId: string;
    label: string;
    category: ServiceCategory;
    pipelines: PipelineEntry[];
    dashboardIndices: number[];
    mlJobs: MlJobEntry[];
    alertRules: AlertRuleEntry[];
  }

  interface CategoryGroup {
    category: ServiceCategory;
    packs: ServicePack[];
    totalPipelines: number;
    totalDashboards: number;
    totalMlJobs: number;
    totalAlertRules: number;
  }

  const servicePackIndex = useMemo((): ServicePack[] => {
    const SERVICE_ALIASES: Record<string, string> = {
      // Pipeline dataset & underscore/hyphen variants → canonical IDs
      vpcflow: "vpc",
      "vpc-flow": "vpc",
      "vpc-flow-logs": "vpc",
      s3storagelens: "storagelens",
      s3_storage_lens: "storagelens",
      "storage-lens": "storagelens",
      s3_intelligent_tiering: "s3intelligenttier",
      "s3-intelligent-tier": "s3intelligenttier",
      s3_batch_operations: "s3batchops",
      "s3-batch-ops": "s3batchops",
      sagemakerfeaturestore: "sagemaker",
      sagemakerpipelines: "sagemaker",
      sagemakermodelmonitor: "sagemaker",
      rdsproxy: "rds",
      rdscustom: "rds",
      neptuneanalytics: "neptune",
      neptune_analytics: "neptune",
      auroradsql: "aurora",
      aurora_dsql: "aurora",
      bedrockdataautomation: "bedrockdataautomation",
      dmsserverless: "dms",
      dms_serverless: "dms",
      elasticacheglobal: "elasticache",
      elasticache_global: "elasticache",
      mskconnect: "msk",
      kafka_metrics: "msk",
      kafka: "msk",
      cloudwatch_rum: "cloudwatchrum",
      kinesisvideo: "kinesisvideo",
      ecs_metrics: "ecs",
      ecs_logs: "ecs",
      inspector2: "inspector",
      "inspector-2": "inspector",
      securityhub_findings: "securityhub",
      wafv2: "waf",
      waf_logs: "waf",
      firewall_logs: "networkfirewall",
      elb_logs: "elb",
      elb: "elb",
      alb: "elb",
      nlb: "elb",
      apigateway_logs: "apigateway",
      cloudfront_logs: "cloudfront",
      emr_logs: "emr",
      emr_metrics: "emr",
      ec2_logs: "ec2",
      lambda_logs: "lambda",
      awshealth: "health",
      pcs: "parallelcomputing",
      hpc: "parallelcomputing",
      m2: "mainframemodernization",
      beanstalk: "elasticbeanstalk",
      blockchain: "managedblockchain",
      location: "locationservice",
      transfer: "transferfamily",
      iot: "iotcore",
      kubernetes: "eks",
      step_functions: "stepfunctions",
      simspace_weaver: "simspaceweaver",
      security_ir: "securityir",
      q_developer: "qdeveloper",
      payment_cryptography: "paymentcryptography",
      parallel_computing: "parallelcomputing",
      network_access_analyzer: "networkaccessanalyzer",
      nat_gateway: "natgateway",
      managed_grafana: "managedgrafana",
      mainframe_modernization: "mainframemodernization",
      lookout_vision: "lookoutvision",
      lookout_equipment: "lookoutequipment",
      license_manager: "licensemanager",
      kinesis_analytics: "kinesisanalytics",
      iot_fleetwise: "iotfleetwise",
      iot_twinmaker: "iottwinmaker",
      audit_manager: "auditmanager",
      b2b_data_interchange: "b2bi",
      bedrock_agent: "bedrockagent",
      chime_sdk_voice: "chimesdkvoice",
      clean_rooms: "cleanrooms",
      client_vpn: "clientvpn",
      data_exchange: "dataexchange",
      data_zone: "datazone",
      deadline_cloud: "deadlinecloud",
      device_farm: "devicefarm",
      end_user_messaging: "endusermessaging",
      entity_resolution: "entityresolution",
      ground_station: "groundstation",
      incident_manager: "incidentmanager",
      app_mesh: "appmesh",
      cloud_map: "cloudmap",
      code_catalyst: "codecatalyst",
      code_build: "codebuild",
      code_pipeline: "codepipeline",
      code_deploy: "codedeploy",
      code_commit: "codecommit",
      code_artifact: "codeartifact",
      code_guru: "codeguru",
      cloud_shell: "cloudshell",
      robo_maker: "robomaker",
      app_fabric: "appfabric",
      app_config: "appconfig",
      cloud_hsm: "cloudhsm",
      security_lake: "securitylake",
      security_hub: "securityhub",
      identity_center: "identitycenter",
      access_analyzer: "accessanalyzer",
      verified_access: "verifiedaccess",
      secrets_manager: "secretsmanager",
      guard_duty: "guardduty",
      vpc_ipam: "vpcipam",
      vpc_lattice: "vpclattice",
      private_5g: "private5g",
      direct_connect: "directconnect",
      global_accelerator: "globalaccelerator",
      network_firewall: "networkfirewall",
      network_manager: "networkmanager",
      private_link: "privatelink",
      elastic_beanstalk: "elasticbeanstalk",
      image_builder: "imagebuilder",
      auto_scaling: "autoscaling",
      health_lake: "healthlake",
      health_omics: "healthomics",
      app_flow: "appflow",
      data_brew: "databrew",
      lake_formation: "lakeformation",
      quick_sight: "quicksight",
      work_spaces: "workspaces",
      work_mail: "workmail",
      media_convert: "mediaconvert",
      media_live: "medialive",
      app_stream: "appstream",
      fraud_detector: "frauddetector",
      game_lift: "gamelift",
      location_service: "locationservice",
      managed_blockchain: "managedblockchain",
      devops_guru: "devopsguru",
      transfer_family: "transferfamily",
      resilience_hub: "resiliencehub",
      migration_hub: "migrationhub",
      compute_optimizer: "computeoptimizer",
      service_catalog: "servicecatalog",
      service_quotas: "servicequotas",
      control_tower: "controltower",
      trusted_advisor: "trustedadvisor",
      lookout_metrics: "lookoutmetrics",
      comprehend_medical: "comprehendmedical",
      q_business: "qbusiness",
      augmented_ai: "a2i",
      free_rtos: "freertos",
      iot_analytics: "iotanalytics",
      iot_events: "iotevents",
      iot_sitewise: "iotsitewise",
      iot_defender: "iotdefender",
      transit_gateway: "transitgateway",
      supply_chain: "supplychain",
      data: "data-pipeline",
      "data-&-analytics-pipeline": "data-pipeline",
      "data-analytics-pipeline": "data-pipeline",

      // Dashboard title fragment aliases (multi-word product names → canonical IDs)
      "application-load-balancer": "elb",
      "network-load-balancer": "elb",
      "elastic-load-balancing": "elb",
      "api-gateway": "apigateway",
      "database-migration-service": "dms",
      "route-53": "route53",
      "cloud-load-balancing": "cloud-lb",
      "365": "m365",
      "iam-access-analyzer": "accessanalyzer",
      "access-analyzer": "accessanalyzer",
      "certificate-manager": "acm",
      mq: "amazonmq",
      "app-mesh": "appmesh",
      "app-runner": "apprunner",
      "app-stream": "appstream",
      "appstream-2.0": "appstream",
      "app-fabric": "appfabric",
      "app-config": "appconfig",
      "app-flow": "appflow",
      "app-recovery-controller": "arc",
      "audit-manager": "auditmanager",
      "aurora-dsql": "aurora",
      "auto-scaling": "autoscaling",
      "ec2-auto-scaling": "autoscaling",
      "b2b-data-interchange": "b2bi",
      "bedrock-agent": "bedrockagent",
      "bedrock-agents": "bedrockagent",
      "bedrock-data-automation": "bedrockdataautomation",
      "chime-sdk-voice": "chimesdkvoice",
      "ci/cd": "cicd",
      "clean-rooms": "cleanrooms",
      "client-vpn": "clientvpn",
      "cloud-9": "cloud9",
      "cloud-hsm": "cloudhsm",
      "cloud-map": "cloudmap",
      "cloud-shell": "cloudshell",
      "cloudwatch-rum": "cloudwatchrum",
      "code-artifact": "codeartifact",
      "code-build": "codebuild",
      "code-catalyst": "codecatalyst",
      "code-commit": "codecommit",
      "code-deploy": "codedeploy",
      "code-guru": "codeguru",
      "code-pipeline": "codepipeline",
      "comprehend-medical": "comprehendmedical",
      "compute-optimizer": "computeoptimizer",
      "control-tower": "controltower",
      "data-brew": "databrew",
      "glue-databrew": "databrew",
      "data-exchange": "dataexchange",
      "data-firehose": "firehose",
      "data-zone": "datazone",
      "deadline-cloud": "deadlinecloud",
      "device-farm": "devicefarm",
      "devops-guru": "devopsguru",
      "direct-connect": "directconnect",
      "dms-serverless": "dms",
      documentdb: "docdb",
      "dynamodb-dax": "dax",
      "elastic-beanstalk": "elasticbeanstalk",
      "elastic-disaster-recovery": "drs",
      "elasticache-global": "elasticache",
      "elemental-mediaconvert": "mediaconvert",
      "elemental-medialive": "medialive",
      "end-user-messaging": "endusermessaging",
      "entity-resolution": "entityresolution",
      "fault-injection-service": "fis",
      "fraud-detector": "frauddetector",
      "free-rtos": "freertos",
      "game-lift": "gamelift",
      "global-accelerator": "globalaccelerator",
      "ground-station": "groundstation",
      "guard-duty": "guardduty",
      "health-lake": "healthlake",
      "health-omics": "healthomics",
      "iam-identity-center": "identitycenter",
      "identity-center": "identitycenter",
      "image-builder": "imagebuilder",
      "ec2-image-builder": "imagebuilder",
      "incident-manager": "incidentmanager",
      "iot-analytics": "iotanalytics",
      "iot-core": "iotcore",
      "iot-defender": "iotdefender",
      "iot-device-defender": "iotdefender",
      "iot-events": "iotevents",
      "iot-fleetwise": "iotfleetwise",
      "iot-greengrass": "greengrass",
      "iot-sitewise": "iotsitewise",
      "iot-twinmaker": "iottwinmaker",
      "kinesis-analytics": "kinesisanalytics",
      "kinesis-data-analytics": "kinesisanalytics",
      "kinesis-data-streams": "kinesis",
      "kinesis-streams": "kinesis",
      "kinesis-video": "kinesisvideo",
      "kinesis-video-streams": "kinesisvideo",
      "lake-formation": "lakeformation",
      "license-manager": "licensemanager",
      "location-service": "locationservice",
      "lookout-equipment": "lookoutequipment",
      "lookout-for-equipment": "lookoutequipment",
      "lookout-for-metrics": "lookoutmetrics",
      "lookout-for-vision": "lookoutvision",
      "lookout-metrics": "lookoutmetrics",
      "lookout-vision": "lookoutvision",
      "mainframe-modernization": "mainframemodernization",
      "managed-blockchain": "managedblockchain",
      "managed-grafana": "managedgrafana",
      "media-convert": "mediaconvert",
      "media-live": "medialive",
      "migration-hub": "migrationhub",
      "msk-connect": "msk",
      "nat-gateway": "natgateway",
      "neptune-analytics": "neptune",
      "network-access-analyzer": "networkaccessanalyzer",
      "network-firewall": "networkfirewall",
      "network-manager": "networkmanager",
      "openSearch-service": "opensearch",
      "opensearch-service": "opensearch",
      "parallel-computing": "parallelcomputing",
      "payment-cryptography": "paymentcryptography",
      "private-5g": "private5g",
      "private-link": "privatelink",
      "q-business": "qbusiness",
      "q-developer": "qdeveloper",
      "quick-sight": "quicksight",
      "rds-custom": "rds",
      "rds-proxy": "rds",
      "resilience-hub": "resiliencehub",
      "resource-access-manager": "ram",
      "robo-maker": "robomaker",
      "s3-batch-operations": "s3batchops",
      "s3-intelligent-tiering": "s3intelligenttier",
      "s3-storage-lens": "storagelens",
      "sagemaker-feature-store": "sagemaker",
      "sagemaker-model-monitor": "sagemaker",
      "sagemaker-pipelines": "sagemaker",
      "secrets-manager": "secretsmanager",
      "security-hub": "securityhub",
      "security-incident-response": "securityir",
      "security-ir": "securityir",
      "security-lake": "securitylake",
      "service-catalog": "servicecatalog",
      "service-quotas": "servicequotas",
      "simspace-weaver": "simspaceweaver",
      "step-functions": "stepfunctions",
      "storage-gateway": "storagegateway",
      "supply-chain": "supplychain",
      "systems-manager": "ssm",
      "transfer-family": "transferfamily",
      "transit-gateway": "transitgateway",
      "trusted-advisor": "trustedadvisor",
      "augmented-ai": "a2i",
      "verified-access": "verifiedaccess",
      "verified-permissions": "verifiedpermissions",
      "vpc-ipam": "vpcipam",
      "vpc-lattice": "vpclattice",
      "work-mail": "workmail",
      "work-spaces": "workspaces",
      "x-ray": "xray",
      x_ray: "xray",

      // ML job short-form aliases (for ID prefix matching)
      vm: "virtual-machines",
      sql: "sql-database",
      cosmos: "cosmos-db",
      spanner: "cloud-spanner",
      // ML job file-group fallback aliases
      "azure-compute": "virtual-machines",
      "azure-networking": "virtual-network",
      "azure-databases": "sql-database",
      "azure-streaming": "event-hubs",
      "azure-analytics": "data-factory",
      "azure-aiml": "openai",
      "azure-devtools": "logic-apps",
      "minimal-coverage": "other",
      "gcp-compute": "compute-engine",
      "gcp-networking": "vpc-flow",
      "gcp-databases": "cloud-sql",
      "gcp-streaming": "pubsub",
      "gcp-analytics": "bigquery",
      "gcp-aiml": "vertex-ai",
      "gcp-aiml-extended": "vertex-ai",
      "gcp-devtools": "cloud-build",

      // ── Azure dataset → service ID aliases ──
      "activity-log": "activity-log",
      "ai-search": "ai-search",
      "api-management": "api-management",
      "app-service": "app-service",
      "application-gateway": "application-gateway",
      "container-apps": "container-apps",
      "container-instances": "container-instances",
      "vm-scale-sets": "vm-scale-sets",
      "capacity-reservation": "capacity-reservation",

      // ── GCP dataset → service ID aliases ──
      appengine: "app-engine",
      artifactregistry: "artifact-registry",
      cloudfunctions: "cloud-functions",
      cloudrun: "cloud-run",
      cloudrunfunctions: "cloud-functions",
      cloudtasks: "cloud-tasks",
      cloudscheduler: "cloud-scheduler",
      computeengine: "compute-engine",
      vmwareengine: "vmware-engine",
      baremetal: "bare-metal",
      cloudtpu: "cloud-tpu",
      cloudworkstations: "cloud-workstations",
      gkeautopilot: "gke-autopilot",
      gkeenterprise: "gke-enterprise",
      anthosconfigmgmt: "anthos-config-mgmt",
      anthosservicemesh: "anthos-service-mesh",
      migratetocontainers: "migrate-to-containers",
      containerregistry: "container-registry",
      cloudlb: "cloud-lb",
      cloudcdn: "cloud-cdn",
      clouddns: "cloud-dns",
      cloudarmor: "cloud-armor",
      cloudnat: "cloud-nat",
      cloudvpn: "cloud-vpn",
      cloudinterconnect: "cloud-interconnect",
      cloudrouter: "cloud-router",
      trafficdirector: "traffic-director",
      privateserviceconnect: "private-service-connect",
      networkconnectivitycenter: "network-connectivity-center",
      networkintelligencecenter: "network-intelligence-center",
      cloudids: "cloud-ids",
      clouddomains: "cloud-domains",
      mediacdn: "media-cdn",
      securitycommandcenter: "security-command-center",
      secretmanager: "secret-manager",
      cloudkms: "cloud-kms",
      certificateauthority: "certificate-authority",
      binaryauthorization: "binary-authorization",
      accesscontextmanager: "access-context-manager",
      assuredworkloads: "assured-workloads",
      recaptchaenterprise: "recaptcha-enterprise",
      websecurityscanner: "web-security-scanner",
      identityawareproxy: "identity-aware-proxy",
      cloudidentity: "cloud-identity",
      managedad: "managed-ad",
      securityoperations: "security-operations",
      webrisk: "web-risk",
      cloudstorage: "cloud-storage",
      persistentdisk: "persistent-disk",
      backupdr: "backup-dr",
      cloudsql: "cloud-sql",
      cloudspanner: "cloud-spanner",
      databasemigration: "database-migration",
      datafusion: "data-fusion",
      datacatalog: "data-catalog",
      analyticshub: "analytics-hub",
      pubsublite: "pubsub-lite",
      vertexai: "vertex-ai",
      visionai: "vision-ai",
      naturallanguage: "natural-language",
      speechtotext: "speech-to-text",
      texttospeech: "text-to-speech",
      documentai: "document-ai",
      recommendationsai: "recommendations-ai",
      vertexaiworkbench: "vertex-ai-workbench",
      vertexaipipelines: "vertex-ai-pipelines",
      vertexaifeaturestore: "vertex-ai-feature-store",
      vertexaimatchingengine: "vertex-ai-matching-engine",
      vertexaitensorboard: "vertex-ai-tensorboard",
      contactcenterai: "contact-center-ai",
      healthcareapi: "healthcare-api",
      retailapi: "retail-api",
      cloudbuild: "cloud-build",
      clouddeploy: "cloud-deploy",
      cloudendpoints: "cloud-endpoints",

      cloudmonitoring: "cloud-monitoring",
      cloudlogging: "cloud-logging",
      resourcemanager: "resource-manager",
      deploymentmanager: "deployment-manager",
      cloudassetinventory: "cloud-asset-inventory",
      orgpolicy: "org-policy",
      servicedirectory: "service-directory",
      cloudauditlogs: "cloud-audit-logs",
      activeassist: "active-assist",
      essentialcontacts: "essential-contacts",
      errorreporting: "error-reporting",
      videointelligence: "video-intelligence",
      applicationintegration: "application-integration",
      monitoring: "cloud-monitoring",
    };

    const GCP_OVERRIDES: Record<string, string> = {
      // Shared slugs that collide with AWS/Azure canonical IDs
      vpcflow: "vpc-flow",
      "vpc-flow": "vpc-flow",
      "vpc-flow-logs": "vpc-flow",
      iot: "iot-core",
      "iot-core": "iot-core",
      kms: "cloud-kms",
      vpn: "cloud-vpn",
      cdn: "cloud-cdn",
      dms: "database-migration",
      dns: "cloud-dns",
      speech: "speech-to-text",
      translate: "translation",
      vision: "vision-ai",
      cloudshell: "cloud-shell",
      "cloud-shell": "cloud-shell",
      apigateway: "api-gateway",
      "api-gateway": "api-gateway",
      "load-balancer": "cloud-lb",
      loadbalancer: "cloud-lb",
      "pub/sub": "pubsub",
      "pubsub-lite": "pubsub-lite",
      // GCP dataset slugs → canonical GCP service IDs
      accesstransparency: "access-transparency",
      "anthos-config": "anthos-config-mgmt",
      "anthos-mesh": "anthos-service-mesh",
      apihub: "application-integration",
      appintegration: "application-integration",
      audit: "cloud-audit-logs",
      baremetalsolution: "bare-metal",
      "bms-oracle": "bms-oracle",
      carbon: "carbon-footprint",
      cas: "certificate-authority",
      ccai: "contact-center-ai",
      cloudasset: "cloud-asset-inventory",
      "cloud-asset": "cloud-asset-inventory",
      "cloudrun-jobs": "cloud-run-jobs",
      cloudrunjobs: "cloud-run-jobs",
      cloudtrace: "cloud-trace",
      "cloud-trace": "cloud-trace",
      compute: "compute-engine",
      "compute-sole-tenant": "compute-engine",
      "compute-spot": "compute-engine",
      "confidential-computing": "compute-engine",
      configconnector: "config-connector",
      "config-connector": "config-connector",
      domains: "cloud-domains",
      endpoints: "cloud-endpoints",
      featurestore: "vertex-ai-feature-store",
      "firebase-rtdb": "firebase",
      gcs: "cloud-storage",
      "gemini-code-assist": "gemini",
      healthcare: "healthcare-api",
      iap: "identity-aware-proxy",
      "integration-connectors": "application-integration",
      interconnect: "cloud-interconnect",
      language: "natural-language",
      livestream: "livestream-api",
      loadbalancing: "cloud-lb",
      logging: "cloud-logging",
      "matching-engine": "vertex-ai-matching-engine",
      "migrate-containers": "migrate-to-containers",
      "migrate-vms": "migrate-vms",
      nat: "cloud-nat",
      ncc: "network-connectivity-center",
      nic: "network-intelligence-center",
      nst: "network-service-tiers",
      oslogin: "os-login",
      packetmirroring: "packet-mirroring",
      profiler: "cloud-profiler",
      psc: "private-service-connect",
      recaptcha: "recaptcha-enterprise",
      recommendations: "recommendations-ai",
      recommender: "active-assist",
      retail: "retail-api",
      scc: "security-command-center",
      secops: "security-operations",
      "serverless-neg": "serverless-vpc-access",
      "shielded-vms": "shielded-vms",
      sourcerepo: "source-repositories",
      storagetransfer: "storage-transfer",
      tags: "resource-tags",
      tensorboard: "vertex-ai-tensorboard",
      tpu: "cloud-tpu",
      vertexaisearch: "vertex-ai-search",
      vpcaccess: "serverless-vpc-access",
      vpcsc: "vpc-service-controls",
      workbench: "vertex-ai-workbench",
      workstations: "cloud-workstations",
    };

    const AZURE_OVERRIDES: Record<string, string> = {
      firewall: "azure-firewall",
      "kubernetes-service": "aks",
      kubernetesservice: "aks",
      kubernetes: "aks",
      "container-registry": "acr",
      devops: "pipeline",
      "devops-pipeline": "pipeline",
      synapse: "synapse-workspace",
      "express-route": "expressroute-circuit",
      "proximity-placement-groups": "proximity-placement",
      "redis-cache": "cache-for-redis",
      postgresql: "database-for-postgresql",
      mysql: "database-for-mysql",
      mariadb: "database-for-mariadb",
      fabric: "microsoft-fabric",
      "microsoft-365": "m365",
      defender: "defender-for-cloud",
      automation: "automation-account",
      "dev-center": "devcenter",
      "azure-stack": "stack",
      waf: "waf-policy",
    };

    function normalize(raw: string, cloud?: CloudId): string {
      const lower = raw.toLowerCase().trim();
      if (cloud === "gcp" && GCP_OVERRIDES[lower]) return GCP_OVERRIDES[lower];
      if (cloud === "azure" && AZURE_OVERRIDES[lower]) return AZURE_OVERRIDES[lower];
      if (SERVICE_ALIASES[lower]) return SERVICE_ALIASES[lower];
      const stripped = lower.replace(/[-_\s/]+/g, "");
      if (cloud === "gcp" && GCP_OVERRIDES[stripped]) return GCP_OVERRIDES[stripped];
      if (cloud === "azure" && AZURE_OVERRIDES[stripped]) return AZURE_OVERRIDES[stripped];
      if (SERVICE_ALIASES[stripped]) return SERVICE_ALIASES[stripped];
      return lower;
    }

    const byService = new Map<string, ServicePack>();

    const ensure = (rawId: string) => {
      const id = normalize(rawId, cloudId);
      if (!byService.has(id)) {
        const label = polishSetupCategoryLabel(id, cloudId);
        const category: ServiceCategory = SERVICE_CATEGORY[id] || "Other";
        byService.set(id, {
          serviceId: id,
          label,
          category,
          pipelines: [],
          dashboardIndices: [],
          mlJobs: [],
          alertRules: [],
        });
      }
      return byService.get(id)!;
    };

    for (const p of PIPELINES) {
      const ds = (p as { dataset?: string }).dataset;
      let serviceId = p.group;
      if (ds) {
        const vendorMatch = ds.match(/^(aws|azure|gcp)\.(.*)/);
        if (vendorMatch) {
          serviceId = vendorMatch[2]
            .replace(/_logs$/, "")
            .replace(/_metrics$/, "")
            .replace(/_/g, "-");
        }
      }
      if (!serviceId) {
        serviceId = p.group
          .replace("cloudloadgen-metrics", "")
          .replace("cloudloadgen-logs", "")
          .replace(/^-/, "");
        if (!serviceId)
          serviceId = p.id.replace(/^(logs|metrics)-(aws|azure|gcp)\./, "").replace(/-.*/, "");
      }
      ensure(serviceId).pipelines.push(p);
    }

    for (let i = 0; i < DASHBOARDS.length; i++) {
      const d = DASHBOARDS[i];
      const frag = dashboardTitleServiceFragment(d, cloudId);
      const serviceId = frag?.trim().toLowerCase().replace(/\s+/g, "-") || "other";
      ensure(serviceId).dashboardIndices.push(i);
    }

    const knownIds = new Set(Object.keys(SERVICE_CATEGORY));
    for (const f of ML_JOB_FILES) {
      for (const j of f.jobs) {
        let serviceId = f.group;
        const vendorMatch = j.id.match(/^(aws|azure|gcp)-(.+)/);
        if (vendorMatch) {
          const rest = vendorMatch[2];
          if (vendorMatch[1] === "aws") {
            const m = rest.match(/^([a-z0-9]+)-/);
            if (m) serviceId = m[1];
          } else {
            const parts = rest.split("-");
            for (let len = Math.min(parts.length - 1, 6); len >= 1; len--) {
              const candidate = parts.slice(0, len).join("-");
              const norm = normalize(candidate, cloudId);
              if (knownIds.has(norm)) {
                serviceId = candidate;
                break;
              }
            }
          }
        }
        ensure(serviceId).mlJobs.push(j);
      }
    }

    for (const f of ALERT_RULE_FILES) {
      for (const r of f.rules) {
        const tag = r.tags?.find((t) => t !== "cloudloadgen");
        const serviceId = tag || f.group;
        ensure(serviceId).alertRules.push(r);
      }
    }

    return [...byService.values()]
      .filter(
        (p) =>
          p.pipelines.length > 0 ||
          p.dashboardIndices.length > 0 ||
          p.mlJobs.length > 0 ||
          p.alertRules.length > 0
      )
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [PIPELINES, DASHBOARDS, ML_JOB_FILES, ALERT_RULE_FILES, cloudId]);

  const [selectedServiceIds, setSelectedServiceIds] = useState<Set<string>>(
    () => new Set(servicePackIndex.map((p) => p.serviceId))
  );

  useEffect(() => {
    setSelectedServiceIds(new Set(servicePackIndex.map((p) => p.serviceId)));
  }, [servicePackIndex]);

  // Derive which pipelines/dashboards/ML jobs are selected from service selection
  const derivedPipelineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pack of servicePackIndex) {
      if (selectedServiceIds.has(pack.serviceId)) {
        for (const p of pack.pipelines) ids.add(p.id);
      }
    }
    return ids;
  }, [servicePackIndex, selectedServiceIds]);

  const derivedDashboardKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const pack of servicePackIndex) {
      if (selectedServiceIds.has(pack.serviceId)) {
        for (const i of pack.dashboardIndices) keys.add(stableDashboardKey(DASHBOARDS[i], i));
      }
    }
    return keys;
  }, [servicePackIndex, selectedServiceIds, DASHBOARDS]);

  const derivedMlJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pack of servicePackIndex) {
      if (selectedServiceIds.has(pack.serviceId)) {
        for (const j of pack.mlJobs) ids.add(j.id);
      }
    }
    return ids;
  }, [servicePackIndex, selectedServiceIds]);

  const derivedAlertRuleIds = useMemo(() => {
    const ids = new Set<string>();
    for (const pack of servicePackIndex) {
      if (selectedServiceIds.has(pack.serviceId)) {
        for (const r of pack.alertRules) ids.add(r.id);
      }
    }
    return ids;
  }, [servicePackIndex, selectedServiceIds]);

  // Keep the underlying selection state in sync for the install/uninstall flows
  useEffect(() => {
    setSelectedPipelineIds(derivedPipelineIds);
    setSelectedDashboardKeys(derivedDashboardKeys);
    setSelectedMlJobIds(derivedMlJobIds);
    setEnablePipelines(enableLoadgenIntegrations);
    setEnableDashboards(enableLoadgenIntegrations);
    setEnableMlJobs(enableLoadgenIntegrations);
  }, [derivedPipelineIds, derivedDashboardKeys, derivedMlJobIds, enableLoadgenIntegrations]);

  const visibleServicePacks = useMemo(() => {
    if (!assetFilterQuery.trim()) return servicePackIndex;
    const q = assetFilterQuery.toLowerCase();
    return servicePackIndex.filter(
      (pack) =>
        pack.label.toLowerCase().includes(q) ||
        pack.serviceId.toLowerCase().includes(q) ||
        pack.category.toLowerCase().includes(q) ||
        pack.pipelines.some(
          (p) => p.id.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        ) ||
        pack.dashboardIndices.some((i) => (DASHBOARDS[i].title ?? "").toLowerCase().includes(q)) ||
        pack.mlJobs.some(
          (j) => j.id.toLowerCase().includes(q) || j.description.toLowerCase().includes(q)
        ) ||
        pack.alertRules.some(
          (r) => r.id.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
        )
    );
  }, [servicePackIndex, assetFilterQuery, DASHBOARDS]);

  const categoryGroups = useMemo((): CategoryGroup[] => {
    const byCat = new Map<ServiceCategory, ServicePack[]>();
    for (const pack of visibleServicePacks) {
      const list = byCat.get(pack.category) ?? [];
      list.push(pack);
      byCat.set(pack.category, list);
    }
    return CATEGORY_ORDER.filter((cat) => byCat.has(cat)).map((cat) => {
      const packs = byCat.get(cat)!;
      return {
        category: cat,
        packs,
        totalPipelines: packs.reduce((n, p) => n + p.pipelines.length, 0),
        totalDashboards: packs.reduce((n, p) => n + p.dashboardIndices.length, 0),
        totalMlJobs: packs.reduce((n, p) => n + p.mlJobs.length, 0),
        totalAlertRules: packs.reduce((n, p) => n + p.alertRules.length, 0),
      };
    });
  }, [visibleServicePacks]);

  const descIntegrations: ReactNode = removeMode ? (
    <>
      <strong>Uninstalls</strong> per-service Cloud Loadgen Integration assets (pipelines,
      dashboards, and ML jobs). Toggle services on/off below.
    </>
  ) : (
    <>
      Installs per-service <EuiBadge color="hollow">cloudloadgen</EuiBadge> integration packs. Each
      service bundle includes ingest pipelines (with TSDS metric routing for data streams), Kibana
      dashboards, and ML anomaly detection jobs — all tagged for easy management. Toggle services to
      include, or <strong>Align with Services</strong> to match the Services step.
    </>
  );

  const filteredPipelines = () => PIPELINES.filter((p) => selectedPipelineIds.has(p.id));

  const filteredDashboards = () =>
    DASHBOARDS.filter((d, i) => selectedDashboardKeys.has(stableDashboardKey(d, i)));
  const filteredMlJobPayload = (): MlJobFile[] =>
    ML_JOB_FILES.map((f) => ({
      ...f,
      jobs: f.jobs.filter((j) => selectedMlJobIds.has(j.id)),
    })).filter((f) => f.jobs.length > 0);

  const filteredAlertRulePayload = (): AlertRuleFile[] =>
    ALERT_RULE_FILES.map((f) => ({
      ...f,
      rules: f.rules.filter((r) => derivedAlertRuleIds.has(r.id)),
    })).filter((f) => f.rules.length > 0);

  const handleInstall = async () => {
    setIsRunning(true);
    setIsDone(false);
    setCurrentPhaseLabel("");
    installRunActiveRef.current = true;
    addLog(`── Install run started ${new Date().toLocaleString()} ──`, "info");
    try {
      await runSetupInstall({
        setupBundle,
        elasticUrl,
        kibanaUrl,
        apiKey,
        enableIntegration,
        enableApm,
        enablePipelines,
        enableDashboards,
        enableMlJobs,
        enableAlertRules: enableLoadgenIntegrations,
        pipelines: filteredPipelines(),
        dashboards: filteredDashboards(),
        mlJobFiles: filteredMlJobPayload(),
        alertRuleFiles: filteredAlertRulePayload(),
        addLog,
      });
      addLog("All selected installers complete.", "ok");
      setIsDone(true);
      onInstallComplete();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      installRunActiveRef.current = false;
      queueMicrotask(() => {
        if (setupLogPersistenceKey) {
          saveSetupLog(setupLogPersistenceKey, {
            v: 1,
            installRunActive: false,
            entries: logRef.current.map((e) => ({
              text: e.text,
              type: e.type,
              at: e.at ?? new Date().toISOString(),
            })),
          });
        }
      });
      setIsRunning(false);
      setCurrentPhaseLabel("");
    }
  };

  async function removeFleetPackage(pkgName: string, label: string) {
    addLog(`Removing ${label}…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    const version = await resolveFleetPackageVersion(kb, apiKey, pkgName);
    if (!version) {
      addLog(`  ✗ ${label}: could not resolve installed version to uninstall.`, "error");
      return;
    }
    const path = `/api/fleet/epm/packages/${encodeURIComponent(pkgName)}/${encodeURIComponent(
      version
    )}?force=true`;
    const deleted = await proxyCall({
      baseUrl: kb,
      apiKey,
      path,
      method: "DELETE",
      allow404: true,
    });
    if (deleted == null) {
      addLog(`  – ${label} not installed for this version (v${version})`, "warn");
    } else {
      addLog(`  ✓ ${label} uninstall completed (v${version})`, "ok");
    }
  }

  async function uninstallIntegration() {
    await removeFleetPackage(setupBundle.fleetPackage, setupBundle.fleetPackageLabel);
  }

  async function uninstallApm() {
    await removeFleetPackage("apm", "APM Integration");
  }

  async function uninstallPipelines() {
    const toRemove = filteredPipelines();
    addLog(`Removing ${toRemove.length} ingest pipelines…`);
    let ok = 0;
    let fail = 0;
    for (const pipeline of toRemove) {
      try {
        await proxyCall({
          baseUrl: elasticUrl,
          apiKey,
          path: `/_ingest/pipeline/${encodeURIComponent(pipeline.id)}`,
          method: "DELETE",
          allow404: true,
        });
        ok++;
      } catch (e) {
        fail++;
        addLog(`  ✗ Pipeline ${pipeline.id}: ${e}`, "error");
      }
    }
    addLog(
      `  ✓ Pipelines: ${ok} removed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  }

  async function uninstallDashboards() {
    const toRemove = filteredDashboards();
    addLog(`Removing ${toRemove.length} custom dashboards…`);
    let ok = 0;
    let fail = 0;
    let stoppedForApiDisabled = false;
    const kb = kibanaUrl.replace(/\/$/, "");
    for (let idx = 0; idx < toRemove.length; idx++) {
      const dash = toRemove[idx];
      try {
        const dashId = await dashboardDefToSavedObjectId(dash);
        const outcome = await deleteKibanaDashboard(kb, apiKey, dashId);
        if (outcome.result === "not_found") {
          addLog(
            `  – Dashboard "${dash.title}" — not found (may use a different id if created via Dashboards API only)`,
            "warn"
          );
          ok++;
        } else if (outcome.result === "deleted") {
          addLog(`  ✓ Dashboard "${dash.title}"`, "ok");
          ok++;
        } else if (outcome.result === "api_disabled") {
          stoppedForApiDisabled = true;
          addLog(
            `  ! Saved Object delete APIs are disabled on this Kibana (first hit: "${dash.title}").`,
            "warn"
          );
          const remaining = toRemove.length - idx - 1;
          if (remaining > 0) {
            addLog(
              `  – Skipped ${remaining} other dashboard(s); same limitation applies to all.`,
              "warn"
            );
          }
          break;
        } else if (outcome.result === "error") {
          fail++;
          addLog(`  ✗ Dashboard "${dash.title}": ${outcome.message}`, "error");
        }
      } catch (e) {
        fail++;
        addLog(`  ✗ Dashboard "${dash.title}": ${e}`, "error");
      }
    }
    if (stoppedForApiDisabled) {
      addLog(
        `  – Dashboards: ${toRemove.length - ok} not removed via API. ${SAVED_OBJECT_DELETE_UNSUPPORTED_HINT}`,
        "warn"
      );
    } else {
      addLog(
        `  ✓ Dashboards: ${ok} processed${fail > 0 ? `, ${fail} failed` : ""}`,
        fail > 0 ? "warn" : "ok"
      );
    }
  }

  async function uninstallOneMlJob(jobId: string) {
    const dfId = `datafeed-${jobId}`;
    const encJob = encodeURIComponent(jobId);
    const encDf = encodeURIComponent(dfId);

    try {
      await proxyCall({
        baseUrl: elasticUrl,
        apiKey,
        path: `/_ml/datafeeds/${encDf}/_stop`,
        method: "POST",
        body: { force: true },
      });
    } catch {
      /* already stopped or missing */
    }
    try {
      await proxyCall({
        baseUrl: elasticUrl,
        apiKey,
        path: `/_ml/anomaly_detectors/${encJob}/_close`,
        method: "POST",
        body: { force: true },
      });
    } catch {
      /* already closed or missing */
    }
    await proxyCall({
      baseUrl: elasticUrl,
      apiKey,
      path: `/_ml/datafeeds/${encDf}`,
      method: "DELETE",
      allow404: true,
    });
    await proxyCall({
      baseUrl: elasticUrl,
      apiKey,
      path: `/_ml/anomaly_detectors/${encJob}`,
      method: "DELETE",
      allow404: true,
    });
  }

  async function uninstallMlJobs() {
    const files = filteredMlJobPayload();
    const entries = files.flatMap((f) => f.jobs);
    const totalJobs = entries.length;
    /** Independent per-job calls; pool avoids head-of-line blocking (was ~4×N sequential round-trips). */
    const ML_UNINSTALL_CONCURRENCY = 12;
    addLog(`Removing ${totalJobs} ML jobs across ${files.length} groups…`);
    let ok = 0;
    let fail = 0;
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const i = next++;
        const entry = entries[i]!;
        try {
          await uninstallOneMlJob(entry.id);
          ok++;
        } catch (e) {
          fail++;
          addLog(`  ✗ ML job ${entry.id}: ${e}`, "error");
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(ML_UNINSTALL_CONCURRENCY, Math.max(1, entries.length)) }, () =>
        worker()
      )
    );
    addLog(
      `  ✓ ML jobs: ${ok} removed${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  }

  async function uninstallAlertRules() {
    const files = filteredAlertRulePayload();
    const entries = files.flatMap((f) => f.rules);
    if (entries.length === 0) return;
    addLog(`Removing ${entries.length} alerting rules…`);
    const kb = kibanaUrl.replace(/\/$/, "");
    let ok = 0;
    let fail = 0;
    let missing = 0;

    for (const rule of entries) {
      const rulePath = `/api/alerting/rule/${encodeURIComponent(rule.id)}`;
      try {
        const existing = await proxyCall({
          baseUrl: kb,
          apiKey,
          path: rulePath,
          method: "GET",
          allow404: true,
        });
        if (
          !existing ||
          typeof existing !== "object" ||
          !("id" in (existing as Record<string, unknown>))
        ) {
          missing++;
          continue;
        }
        await proxyCall({
          baseUrl: kb,
          apiKey,
          path: rulePath,
          method: "DELETE",
        });
        ok++;
      } catch (e) {
        const msg = String(e);
        if (msg.includes("404") || msg.includes("Not Found")) {
          missing++;
        } else {
          fail++;
          addLog(`  ✗ ${rule.name}: ${msg}`, "error");
        }
      }
    }
    addLog(
      `  ✓ Alerting rules: ${ok} removed${missing > 0 ? `, ${missing} not found` : ""}${fail > 0 ? `, ${fail} failed` : ""}`,
      fail > 0 ? "warn" : "ok"
    );
  }

  async function performUninstallSteps() {
    if (enableIntegration) await uninstallIntegration();
    if (enableApm) await uninstallApm();
    if (enablePipelines) await uninstallPipelines();
    if (enableDashboards) await uninstallDashboards();
    if (enableMlJobs) await uninstallMlJobs();
    if (enableLoadgenIntegrations) await uninstallAlertRules();
  }

  const runUninstall = async () => {
    setConfirmUninstallOpen(false);
    setIsRunning(true);
    setIsDone(false);
    setCurrentPhaseLabel("");
    installRunActiveRef.current = false;
    setLog([]);
    logRef.current = [];
    if (setupLogPersistenceKey) {
      saveSetupLog(setupLogPersistenceKey, { v: 1, installRunActive: false, entries: [] });
    }
    try {
      await performUninstallSteps();
      addLog("Uninstall finished.", "ok");
      setIsDone(true);
      onUninstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      queueMicrotask(flushSetupSnapshot);
      setIsRunning(false);
      setCurrentPhaseLabel("");
    }
  };

  const runReinstall = async () => {
    setConfirmReinstallOpen(false);
    setIsRunning(true);
    setIsDone(false);
    setCurrentPhaseLabel("");
    installRunActiveRef.current = true;
    setLog([]);
    logRef.current = [];
    if (setupLogPersistenceKey) {
      saveSetupLog(setupLogPersistenceKey, { v: 1, installRunActive: true, entries: [] });
    }
    try {
      addLog(`── Reinstall run started ${new Date().toLocaleString()} ──`, "info");
      await runSetupInstall({
        setupBundle,
        elasticUrl,
        kibanaUrl,
        apiKey,
        enableIntegration,
        enableApm,
        enablePipelines,
        enableDashboards,
        enableMlJobs,
        enableAlertRules: enableLoadgenIntegrations,
        pipelines: filteredPipelines(),
        dashboards: filteredDashboards(),
        mlJobFiles: filteredMlJobPayload(),
        alertRuleFiles: filteredAlertRulePayload(),
        addLog,
      });
      addLog("Reinstall finished.", "ok");
      setIsDone(true);
      onReinstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      installRunActiveRef.current = false;
      queueMicrotask(() => {
        if (setupLogPersistenceKey) {
          saveSetupLog(setupLogPersistenceKey, {
            v: 1,
            installRunActive: false,
            entries: logRef.current.map((e) => ({
              text: e.text,
              type: e.type,
              at: e.at ?? new Date().toISOString(),
            })),
          });
        }
      });
      setIsRunning(false);
      setCurrentPhaseLabel("");
    }
  };

  const runReset = async () => {
    setConfirmResetOpen(false);
    setIsRunning(true);
    setIsDone(false);
    setCurrentPhaseLabel("");
    installRunActiveRef.current = true;
    setLog([]);
    logRef.current = [];
    if (setupLogPersistenceKey) {
      saveSetupLog(setupLogPersistenceKey, { v: 1, installRunActive: true, entries: [] });
    }
    try {
      await performUninstallSteps();
      addLog("--- Reinstalling selected components ---", "info");
      await runSetupInstall({
        setupBundle,
        elasticUrl,
        kibanaUrl,
        apiKey,
        enableIntegration,
        enableApm,
        enablePipelines,
        enableDashboards,
        enableMlJobs,
        enableAlertRules: enableLoadgenIntegrations,
        pipelines: filteredPipelines(),
        dashboards: filteredDashboards(),
        mlJobFiles: filteredMlJobPayload(),
        alertRuleFiles: filteredAlertRulePayload(),
        addLog,
      });
      addLog("Uninstall and reinstall finished.", "ok");
      setIsDone(true);
      onReinstallComplete?.();
    } catch (e) {
      addLog(`Unexpected error: ${e}`, "error");
    } finally {
      installRunActiveRef.current = false;
      queueMicrotask(() => {
        if (setupLogPersistenceKey) {
          saveSetupLog(setupLogPersistenceKey, {
            v: 1,
            installRunActive: false,
            entries: logRef.current.map((e) => ({
              text: e.text,
              type: e.type,
              at: e.at ?? new Date().toISOString(),
            })),
          });
        }
      });
      setIsRunning(false);
      setCurrentPhaseLabel("");
    }
  };

  const missingKbWarning = needsKb && !hasKb && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut title="Kibana URL required" color="warning" iconType="warning" size="s">
        <p>
          {removeMode
            ? "Set a Kibana URL on the Start page to uninstall, reinstall, or reset Fleet integrations or dashboards."
            : "Set a Kibana URL on the Start page to install integrations and dashboards."}
        </p>
      </EuiCallOut>
    </>
  );

  const missingEsWarning = !hasEs && (
    <>
      <EuiSpacer size="s" />
      <EuiCallOut title="Connection required" color="warning" iconType="warning" size="s">
        <p>
          {removeMode
            ? "Set the Elasticsearch URL and API key on the Start page before uninstalling or reinstalling assets."
            : "Set the Elasticsearch URL and API key on the Start page before installing."}
        </p>
      </EuiCallOut>
    </>
  );

  return (
    <>
      <EuiTitle size="s">
        <h2>Setup</h2>
      </EuiTitle>

      <EuiSpacer size="m" />
      <EuiFlexGroup alignItems="flexStart" gutterSize="l" responsive={true}>
        <EuiFlexItem grow={true} style={{ flex: "1 1 0%", minWidth: 0 }}>
          {removeMode ? (
            <EuiText size="s" color="subdued">
              <p style={{ maxWidth: "min(100%, 48rem)", marginBottom: 0 }}>
                <strong>Uninstalls</strong>, reinstalls, or resets the selected components.
                <br />
                Choose categories below, then use <strong>Reinstall</strong>,{" "}
                <strong>Uninstall &amp; reinstall</strong>, or <strong>Uninstall only</strong> at
                the bottom.
              </p>
            </EuiText>
          ) : (
            <EuiText size="s" color="subdued">
              <p style={{ maxWidth: 540, marginBottom: 0 }}>
                Install Elastic components to get the most from the load generator.
                <br />
                Toggle each component required, then click <strong>Install Selected</strong>.
              </p>
            </EuiText>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ flex: "0 0 auto", maxWidth: "100%" }}>
          <EuiPanel paddingSize="m" hasBorder style={{ width: "fit-content", maxWidth: "100%" }}>
            <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="s">
                  <strong>Uninstall/Reinstall mode</strong>
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiSwitch
                  showLabel={false}
                  label="Uninstall/Reinstall mode"
                  checked={removeMode}
                  onChange={(e) => setRemoveMode(e.target.checked)}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              Turn on to remove or reinstall setup assets instead of installing them.
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {removeMode && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            title="Uninstall and reset are destructive"
            color="danger"
            iconType="alert"
            size="s"
          >
            <p>
              Uninstalling the integration package can remove Fleet policies and data streams tied
              to it. ML jobs are stopped and deleted. Reinstall alone does not remove assets first;
              use <strong>Uninstall &amp; reinstall</strong> for a clean reinstall of the same
              selection.
            </p>
          </EuiCallOut>
        </>
      )}

      {missingEsWarning}
      {missingKbWarning}

      {showInterruptedBanner && (
        <>
          <EuiSpacer size="s" />
          <EuiCallOut
            title="Setup may have been interrupted"
            color="warning"
            iconType="alert"
            size="s"
            onDismiss={() => setShowInterruptedBanner(false)}
          >
            <p>
              This tab was closed or reloaded while an install was in progress. The log below shows
              everything recorded up to that point. Work may still be running on the cluster—confirm
              in Kibana or Elasticsearch.
            </p>
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size="l" />

      <InstallerRow
        label={setupBundle.fleetPackageLabel}
        badge="Kibana"
        description={descIntegration}
        enabled={enableIntegration}
        onToggle={setEnableIntegration}
      />

      <EuiSpacer size="m" />

      {setupBundle.showApmToggle && (
        <>
          <InstallerRow
            label="APM Integration"
            badge="Kibana"
            description={descApm}
            enabled={enableApm}
            onToggle={setEnableApm}
          />
          <EuiSpacer size="m" />
        </>
      )}

      <InstallerRow
        label="Cloud Loadgen Integrations"
        badge="Elasticsearch"
        description={descIntegrations}
        enabled={enableLoadgenIntegrations}
        onToggle={(v) => {
          setEnableLoadgenIntegrations(v);
          if (v) setExpandedSetupSections(new Set());
        }}
      >
        <EuiSpacer size="s" />

        <EuiPanel paddingSize="s" hasBorder color="subdued">
          <EuiFieldSearch
            placeholder="Filter services…"
            value={assetFilterQuery}
            onChange={(e) => setAssetFilterQuery(e.target.value)}
            isClearable
            fullWidth
          />
          <EuiSpacer size="s" />
          <EuiFlexGroup gutterSize="s" alignItems="center" wrap responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="s"
                iconType="aggregate"
                onClick={() => {
                  const sel = new Set(selectedShipServiceIds.map((s) => s.trim()).filter(Boolean));
                  if (sel.size === 0) {
                    addLog("Choose at least one service on the Services step first.", "warn");
                    return;
                  }
                  const matching = servicePackIndex
                    .filter(
                      (p) =>
                        sel.has(p.serviceId) ||
                        [...sel].some((s) => p.serviceId.includes(s) || s.includes(p.serviceId))
                    )
                    .map((p) => p.serviceId);
                  setSelectedServiceIds(new Set(matching));
                  addLog(
                    `Aligned to Services step: ${matching.length} integration pack(s) selected.`,
                    "ok"
                  );
                }}
                disabled={selectedShipServiceIds.length === 0 || !enableLoadgenIntegrations}
              >
                Align with Services step
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {selectedShipServiceIds.length} service(s) on Services page
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="xs"
                onClick={() =>
                  setSelectedServiceIds(new Set(visibleServicePacks.map((p) => p.serviceId)))
                }
                disabled={!enableLoadgenIntegrations}
              >
                Select all visible
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="xs"
                onClick={() => {
                  const vis = new Set(visibleServicePacks.map((p) => p.serviceId));
                  setSelectedServiceIds((prev) => new Set([...prev].filter((id) => !vis.has(id))));
                }}
                disabled={!enableLoadgenIntegrations}
              >
                Clear visible
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                size="xs"
                onClick={() => {
                  const keys = new Set<string>();
                  for (const g of categoryGroups) {
                    keys.add(`cat:${g.category}:${uid}`);
                    for (const p of g.packs) keys.add(`svc:${p.serviceId}:${uid}`);
                  }
                  setExpandedSetupSections(keys);
                }}
              >
                Expand all
              </EuiButtonEmpty>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty size="xs" onClick={() => setExpandedSetupSections(new Set())}>
                Collapse all
              </EuiButtonEmpty>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>

        <EuiSpacer size="s" />
        <EuiText size="xs" color="subdued">
          <strong>{selectedServiceIds.size}</strong> of {servicePackIndex.length} services selected
          {" across "}
          {categoryGroups.length} categories
          {assetFilterQuery.trim() ? <> ({visibleServicePacks.length} visible)</> : null}
          {" — "}
          {derivedPipelineIds.size} pipeline(s), {derivedDashboardKeys.size} dashboard(s),{" "}
          {derivedMlJobIds.size} ML job(s), {derivedAlertRuleIds.size} alert rule(s)
        </EuiText>
        <EuiSpacer size="s" />

        {categoryGroups.map((group) => {
          const catKey = `cat:${group.category}:${uid}`;
          const catServiceIds = group.packs.map((p) => p.serviceId);
          const allCatSelected = catServiceIds.every((id) => selectedServiceIds.has(id));
          const someCatSelected =
            !allCatSelected && catServiceIds.some((id) => selectedServiceIds.has(id));

          return (
            <SetupCollapsible
              key={catKey}
              sectionKey={catKey}
              expandedSections={expandedSetupSections}
              setExpandedSections={setExpandedSetupSections}
              variant="category"
              header={
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                  <EuiFlexItem grow={false} style={{ minWidth: 28 }}>
                    <EuiCheckbox
                      id={`cat-check-${group.category}-${uid}`}
                      checked={allCatSelected}
                      indeterminate={someCatSelected}
                      disabled={!enableLoadgenIntegrations}
                      onChange={() => {
                        setSelectedServiceIds((prev) => {
                          const next = new Set(prev);
                          if (allCatSelected) {
                            for (const id of catServiceIds) next.delete(id);
                          } else {
                            for (const id of catServiceIds) next.add(id);
                          }
                          return next;
                        });
                      }}
                      label=""
                      aria-label={`Select all ${group.category}`}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="s">
                      <strong>{group.category}</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="default">
                      {group.packs.length} service{group.packs.length > 1 ? "s" : ""}
                    </EuiBadge>
                  </EuiFlexItem>
                  {group.totalPipelines > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="hollow">
                        {group.totalPipelines} pipeline{group.totalPipelines > 1 ? "s" : ""}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                  {group.totalDashboards > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="primary">
                        {group.totalDashboards} dashboard{group.totalDashboards > 1 ? "s" : ""}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                  {group.totalMlJobs > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="accent">
                        {group.totalMlJobs} ML job{group.totalMlJobs > 1 ? "s" : ""}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                  {group.totalAlertRules > 0 && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="warning">
                        {group.totalAlertRules} rule{group.totalAlertRules > 1 ? "s" : ""}
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              }
            >
              {group.packs.map((pack) => {
                const isSelected = selectedServiceIds.has(pack.serviceId);
                const nPipelines = pack.pipelines.length;
                const nDashboards = pack.dashboardIndices.length;
                const nMlJobs = pack.mlJobs.length;
                const nAlertRules = pack.alertRules.length;
                return (
                  <SetupCollapsible
                    key={`svc-${pack.serviceId}-${uid}`}
                    sectionKey={`svc:${pack.serviceId}:${uid}`}
                    expandedSections={expandedSetupSections}
                    setExpandedSections={setExpandedSetupSections}
                    header={
                      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                        <EuiFlexItem grow={false} style={{ minWidth: 28 }}>
                          <EuiCheckbox
                            id={`svc-check-${pack.serviceId}-${uid}`}
                            checked={isSelected}
                            disabled={!enableLoadgenIntegrations}
                            onChange={() =>
                              setSelectedServiceIds((prev) => toggleGroup(prev, pack.serviceId))
                            }
                            label=""
                            aria-label={`Select ${pack.label}`}
                            onClick={(e: React.MouseEvent) => e.stopPropagation()}
                          />
                        </EuiFlexItem>
                        <EuiFlexItem grow={false}>
                          <EuiText size="s">
                            <strong>{pack.label}</strong>
                          </EuiText>
                        </EuiFlexItem>
                        {nPipelines > 0 && (
                          <EuiFlexItem grow={false}>
                            <EuiBadge color="hollow">
                              {nPipelines} pipeline{nPipelines > 1 ? "s" : ""}
                            </EuiBadge>
                          </EuiFlexItem>
                        )}
                        {nDashboards > 0 && (
                          <EuiFlexItem grow={false}>
                            <EuiBadge color="primary">
                              {nDashboards} dashboard{nDashboards > 1 ? "s" : ""}
                            </EuiBadge>
                          </EuiFlexItem>
                        )}
                        {nMlJobs > 0 && (
                          <EuiFlexItem grow={false}>
                            <EuiBadge color="accent">
                              {nMlJobs} ML job{nMlJobs > 1 ? "s" : ""}
                            </EuiBadge>
                          </EuiFlexItem>
                        )}
                        {nAlertRules > 0 && (
                          <EuiFlexItem grow={false}>
                            <EuiBadge color="warning">
                              {nAlertRules} rule{nAlertRules > 1 ? "s" : ""}
                            </EuiBadge>
                          </EuiFlexItem>
                        )}
                      </EuiFlexGroup>
                    }
                  >
                    {nPipelines > 0 && (
                      <>
                        <EuiText size="xs">
                          <strong>Ingest Pipelines</strong>
                        </EuiText>
                        <EuiSpacer size="xs" />
                        {pack.pipelines.map((p) => (
                          <div key={p.id} style={{ marginLeft: 8, marginBottom: 4 }}>
                            <EuiText size="xs">
                              <EuiCode>{p.id}</EuiCode>
                              <span
                                style={{ marginLeft: 8, color: "var(--euiColorSubdued, #69707d)" }}
                              >
                                {p.description}
                              </span>
                            </EuiText>
                          </div>
                        ))}
                        <EuiSpacer size="s" />
                      </>
                    )}
                    {nDashboards > 0 && (
                      <>
                        <EuiText size="xs">
                          <strong>Dashboards</strong>
                        </EuiText>
                        <EuiSpacer size="xs" />
                        {pack.dashboardIndices.map((i) => {
                          const d = DASHBOARDS[i];
                          const title = polishSetupDashboardTitle(
                            d.title ?? `Dashboard ${i + 1}`,
                            cloudId
                          );
                          return (
                            <div key={`dash-${i}`} style={{ marginLeft: 8, marginBottom: 4 }}>
                              <EuiText size="xs">
                                <EuiCode>{title}</EuiCode>
                              </EuiText>
                            </div>
                          );
                        })}
                        <EuiSpacer size="s" />
                      </>
                    )}
                    {nMlJobs > 0 && (
                      <>
                        <EuiText size="xs">
                          <strong>ML Anomaly Detection Jobs</strong>
                        </EuiText>
                        <EuiSpacer size="xs" />
                        {pack.mlJobs.map((j) => (
                          <div key={j.id} style={{ marginLeft: 8, marginBottom: 4 }}>
                            <EuiText size="xs">
                              <EuiCode>{j.id}</EuiCode>
                              <span
                                style={{ marginLeft: 8, color: "var(--euiColorSubdued, #69707d)" }}
                              >
                                {j.description}
                              </span>
                            </EuiText>
                          </div>
                        ))}
                      </>
                    )}
                    {nAlertRules > 0 && (
                      <>
                        <EuiText size="xs">
                          <strong>Alerting Rules</strong>
                        </EuiText>
                        <EuiSpacer size="xs" />
                        {pack.alertRules.map((r) => (
                          <div key={r.id} style={{ marginLeft: 8, marginBottom: 4 }}>
                            <EuiText size="xs">
                              <EuiCode>{r.name}</EuiCode>
                              <span
                                style={{ marginLeft: 8, color: "var(--euiColorSubdued, #69707d)" }}
                              >
                                {r.enabled ? "enabled" : "disabled by default"} ·{" "}
                                {r.schedule.interval}
                              </span>
                            </EuiText>
                          </div>
                        ))}
                      </>
                    )}
                  </SetupCollapsible>
                );
              })}
            </SetupCollapsible>
          );
        })}
        {servicePackIndex.length === 0 ? (
          <EuiText size="s" color="danger">
            <p>No integration packs are available for this cloud in this build.</p>
          </EuiText>
        ) : visibleServicePacks.length === 0 ? (
          <EuiText size="s" color="subdued">
            <p>No services match the current filter — clear the search box.</p>
          </EuiText>
        ) : null}
      </InstallerRow>

      <EuiSpacer size="xl" />
      <EuiHorizontalRule margin="none" />
      <EuiSpacer size="m" />

      {removeMode ? (
        <EuiFlexGroup alignItems="center" gutterSize="m" wrap responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              iconType="importAction"
              onClick={() => setConfirmReinstallOpen(true)}
              isLoading={isRunning}
              isDisabled={!canRun || isRunning}
            >
              Reinstall selected…
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              color="warning"
              onClick={() => setConfirmResetOpen(true)}
              isLoading={isRunning}
              isDisabled={!canRun || isRunning}
            >
              Uninstall &amp; reinstall…
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              color="danger"
              iconType="trash"
              onClick={() => setConfirmUninstallOpen(true)}
              isLoading={isRunning}
              isDisabled={!canRun || isRunning}
            >
              Uninstall only…
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : (
        <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButton
              fill
              iconType="exportAction"
              onClick={handleInstall}
              isLoading={isRunning}
              isDisabled={!canRun || isRunning}
            >
              Install Selected
            </EuiButton>
          </EuiFlexItem>
          {isDone && !isRunning && (
            <EuiFlexItem grow={false}>
              <EuiCallOut color="success" iconType="check" size="s" title="Installation complete" />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      )}

      {removeMode && isDone && !isRunning && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut color="success" iconType="check" size="s" title="Last run completed" />
        </>
      )}

      {(log.length > 0 || isRunning || (isDone && !isRunning)) && (
        <>
          <EuiSpacer size="m" />
          <EuiPanel paddingSize="s" color="subdued">
            <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  Setup log ({log.length} lines, kept for this browser session)
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty size="xs" iconType="trash" onClick={clearSetupActivityLog}>
                  Clear log
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="xs" />
            {isRunning && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  marginBottom: 8,
                  background: K.subdued,
                  borderRadius: K.radiusSm,
                  border: `1px solid ${K.border}`,
                }}
              >
                <EuiLoadingSpinner size="s" />
                <span style={{ fontSize: 12, color: K.textSubdued }}>
                  {currentPhaseLabel || (removeMode ? "Uninstalling…" : "Installing…")}
                </span>
              </div>
            )}
            {isDone && !isRunning && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  marginBottom: 8,
                  background: `${K.success}12`,
                  borderRadius: K.radiusSm,
                  border: `1px solid ${K.success}44`,
                }}
              >
                <span style={{ color: K.success, fontWeight: 600, fontSize: 12 }}>✓ Complete</span>
              </div>
            )}
            <div
              style={{
                fontFamily: "monospace",
                fontSize: 12,
                maxHeight: 300,
                overflowY: "auto",
              }}
            >
              {log.map((line, i) => {
                const timeLabel = line.at
                  ? new Date(line.at).toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "";
                return (
                  <div
                    key={`${line.at ?? ""}-${i}-${line.text.slice(0, 24)}`}
                    style={{
                      color:
                        line.type === "ok"
                          ? K.success
                          : line.type === "error"
                            ? K.danger
                            : line.type === "warn"
                              ? K.warning
                              : "inherit",
                    }}
                  >
                    {timeLabel && (
                      <span style={{ opacity: 0.65, marginRight: 8 }}>{timeLabel}</span>
                    )}
                    {line.text}
                  </div>
                );
              })}
            </div>
          </EuiPanel>
        </>
      )}

      {confirmReinstallOpen && (
        <EuiConfirmModal
          title="Reinstall selected components?"
          onCancel={() => setConfirmReinstallOpen(false)}
          onConfirm={runReinstall}
          cancelButtonText="Cancel"
          confirmButtonText="Reinstall"
          buttonColor="primary"
          defaultFocusedButton="confirm"
        >
          <p>
            This runs the same install steps as normal Setup for your selection (Fleet, pipelines,
            dashboards, ML, alerting rules). Existing assets may already be present; the log will
            note skips or conflicts.
          </p>
        </EuiConfirmModal>
      )}

      {confirmResetOpen && (
        <EuiConfirmModal
          title="Uninstall, then reinstall?"
          onCancel={() => setConfirmResetOpen(false)}
          onConfirm={runReset}
          cancelButtonText="Cancel"
          confirmButtonText="Uninstall & reinstall"
          buttonColor="warning"
          defaultFocusedButton="confirm"
        >
          <p>
            This first removes the selected items, then installs them again. Use this for a clean
            reinstall when something is stuck or misconfigured.
          </p>
        </EuiConfirmModal>
      )}

      {confirmUninstallOpen && (
        <EuiConfirmModal
          title="Uninstall selected components?"
          onCancel={() => setConfirmUninstallOpen(false)}
          onConfirm={runUninstall}
          cancelButtonText="Cancel"
          confirmButtonText="Uninstall"
          buttonColor="danger"
          defaultFocusedButton="confirm"
        >
          <p>This will uninstall or delete the selected items from Elasticsearch / Kibana.</p>
        </EuiConfirmModal>
      )}
    </>
  );
}
