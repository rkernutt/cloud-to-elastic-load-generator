import { Fragment, useMemo, type ReactNode } from "react";
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiFieldText,
  EuiFieldPassword,
  EuiFormRow,
  EuiCallOut,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiText,
  EuiCheckableCard,
} from "@elastic/eui";
import type { CloudId } from "../cloud/types";
import { UNIFIED_VENDOR_CARDS } from "../cloud/unifiedVendorMeta";

type DeploymentType = "self-managed" | "cloud-hosted" | "serverless";

interface ConnectionPageProps {
  deploymentType: DeploymentType;
  elasticUrl: string;
  kibanaUrl: string;
  apiKey: string;
  indexPrefix: string;
  isTracesMode: boolean;
  eventType: string;
  connectionStatus: "idle" | "testing" | "ok" | "fail";
  connectionMsg: string;
  validationErrors: { elasticUrl: string; apiKey: string; indexPrefix: string };
  ingestionSource: string;
  onDeploymentTypeChange: (val: DeploymentType) => void;
  onElasticUrlChange: (val: string) => void;
  onKibanaUrlChange: (val: string) => void;
  onApiKeyChange: (val: string) => void;
  onIndexPrefixChange: (val: string) => void;
  onEventTypeChange: (val: string) => void;
  onTestConnection: () => void;
  onIngestionSourceChange: (val: string) => void;
  onExportConfig: () => void;
  onImportConfig: () => void;
  onResetConfig: () => void;
  onBlurElasticUrl: () => void;
  onBlurApiKey: () => void;
  onBlurIndexPrefix: () => void;
  ingestionOverrideOptions: { id: string; label: string }[];
  /** Shown after auto-reset when override conflicted with selected services */
  ingestionResetNotice?: string | null;
  /** Shown when a non-default override fits every selected service (logs/metrics) */
  ingestionOverrideCompatibleHint?: string | null;
  unifiedCloudPicker?: { vendor: CloudId; onChange: (id: CloudId) => void };
}

const DEPLOYMENT_OPTIONS = [
  { id: "self-managed", label: "Self-Managed" },
  { id: "cloud-hosted", label: "Cloud Hosted" },
  { id: "serverless", label: "Cloud Serverless" },
];

const EVENT_TYPE_OPTIONS = [
  { id: "logs", label: "Logs" },
  { id: "metrics", label: "Metrics" },
  { id: "traces", label: "Traces" },
];

/** Same typography for every subsection title on Start. */
function ConnectionSubheading({ children }: { children: ReactNode }) {
  return (
    <EuiTitle size="xs">
      <h3>{children}</h3>
    </EuiTitle>
  );
}

function esUrlPlaceholder(deploymentType: DeploymentType): string {
  if (deploymentType === "serverless")
    return "https://my-deployment.es.eu-west-2.aws.elastic.cloud";
  if (deploymentType === "cloud-hosted")
    return "https://my-deployment.es.us-east-1.aws.elastic-cloud.com:9243";
  return "http://localhost:9200";
}

function kbUrlPlaceholder(deploymentType: DeploymentType): string {
  if (deploymentType === "serverless")
    return "https://my-deployment.kb.eu-west-2.aws.elastic.cloud";
  if (deploymentType === "cloud-hosted")
    return "https://my-deployment.kb.us-east-1.aws.elastic-cloud.com:9243";
  return "http://localhost:5601";
}

export function ConnectionPage({
  deploymentType,
  elasticUrl,
  kibanaUrl,
  apiKey,
  indexPrefix,
  isTracesMode,
  eventType,
  connectionStatus,
  connectionMsg,
  validationErrors,
  ingestionSource,
  onDeploymentTypeChange,
  onElasticUrlChange,
  onKibanaUrlChange,
  onApiKeyChange,
  onIndexPrefixChange,
  onEventTypeChange,
  onTestConnection,
  onIngestionSourceChange,
  onExportConfig,
  onImportConfig,
  onResetConfig,
  onBlurElasticUrl,
  onBlurApiKey,
  onBlurIndexPrefix,
  ingestionOverrideOptions,
  ingestionResetNotice,
  ingestionOverrideCompatibleHint,
  unifiedCloudPicker,
}: ConnectionPageProps) {
  /** Max 3 buttons per row so long labels (e.g. Azure Monitor Distro → EDOT GW) stay readable. */
  const ingestionRows = useMemo(() => {
    const opts = ingestionOverrideOptions;
    if (opts.length === 0) return [];
    const maxPerRow = 3;
    const rows: (typeof opts)[] = [];
    for (let i = 0; i < opts.length; i += maxPerRow) {
      rows.push(opts.slice(i, i + maxPerRow));
    }
    return rows;
  }, [ingestionOverrideOptions]);

  const prefixLabel = isTracesMode
    ? "Traces Index Prefix"
    : eventType === "metrics"
      ? "Metrics Index Prefix"
      : "Logs Index Prefix";

  return (
    <>
      <EuiTitle size="s">
        <h2>Start</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      {import.meta.env.DEV && (
        <>
          <EuiCallOut title="Bulk proxy (local development)" color="primary" iconType="iInCircle">
            <p>
              Shipping uses <code>/proxy/_bulk</code>, which Vite forwards to the bulk proxy (by
              default <code>proxy.cjs</code> on port 3001). Run that proxy alongside{" "}
              <code>npm run dev</code> or bulk requests will fail from the browser.
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {unifiedCloudPicker && (
        <>
          <ConnectionSubheading>Cloud Vendor</ConnectionSubheading>
          <EuiText size="s" color="subdued">
            <p>
              Choose AWS, GCP, or Azure. This reloads the app with that cloud&apos;s services and
              defaults.
            </p>
          </EuiText>
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="m" wrap responsive={false}>
            {UNIFIED_VENDOR_CARDS.map((c) => {
              const checked = unifiedCloudPicker.vendor === c.id;
              return (
                <EuiFlexItem key={c.id} grow={false} style={{ minWidth: 200, maxWidth: 280 }}>
                  <EuiCheckableCard
                    id={`unified-vendor-${c.id}`}
                    label={
                      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                        <EuiFlexItem grow={false} style={{ marginLeft: -10 }}>
                          <img
                            src={c.logoSrcLightBg}
                            alt={c.logoAlt}
                            style={{
                              height: c.id === "gcp" ? 36 : 28,
                              width: "auto",
                              display: "block",
                              objectFit: "contain",
                            }}
                          />
                        </EuiFlexItem>
                        <EuiFlexItem grow style={{ paddingLeft: 12 }}>
                          <strong>{c.shortLabel}</strong>
                          <br />
                          <EuiText size="xs" color="subdued">
                            {c.label}
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    }
                    checked={checked}
                    onChange={() => unifiedCloudPicker.onChange(c.id)}
                  />
                </EuiFlexItem>
              );
            })}
          </EuiFlexGroup>
          <EuiSpacer size="l" />
        </>
      )}

      {/* Deployment type */}
      <EuiFormRow
        label={<ConnectionSubheading>Deployment Type</ConnectionSubheading>}
        helpText="Determines how Kibana URL is derived and which features are available"
      >
        <EuiButtonGroup
          legend="Deployment type selection"
          options={DEPLOYMENT_OPTIONS}
          idSelected={deploymentType}
          onChange={(id) => onDeploymentTypeChange(id as DeploymentType)}
        />
      </EuiFormRow>

      <EuiSpacer size="l" />

      {/* Event type */}
      <EuiFormRow
        label={<ConnectionSubheading>Event Type</ConnectionSubheading>}
        helpText="Choose what type of data to generate"
      >
        <EuiButtonGroup
          legend="Event type selection"
          options={EVENT_TYPE_OPTIONS}
          idSelected={eventType}
          onChange={(id) => onEventTypeChange(id)}
        />
      </EuiFormRow>

      <EuiSpacer size="l" />

      <EuiFormRow
        label={<ConnectionSubheading>Elasticsearch URL</ConnectionSubheading>}
        error={validationErrors.elasticUrl || undefined}
        isInvalid={!!validationErrors.elasticUrl}
        helpText={`e.g. ${esUrlPlaceholder(deploymentType)}`}
      >
        <EuiFieldText
          value={elasticUrl}
          onChange={(e) => onElasticUrlChange(e.target.value)}
          onBlur={onBlurElasticUrl}
          isInvalid={!!validationErrors.elasticUrl}
          placeholder={esUrlPlaceholder(deploymentType)}
        />
      </EuiFormRow>

      {/* Kibana URL — auto-derived for cloud, manual for self-managed */}
      <EuiFormRow
        label={<ConnectionSubheading>Kibana URL</ConnectionSubheading>}
        helpText={
          deploymentType !== "self-managed"
            ? "Auto-derived from ES URL — edit to override. Required for Dashboard and Integration installs."
            : "Required for Dashboard and Integration installs."
        }
      >
        <EuiFieldText
          value={kibanaUrl}
          onChange={(e) => onKibanaUrlChange(e.target.value)}
          placeholder={kbUrlPlaceholder(deploymentType)}
        />
      </EuiFormRow>

      <EuiFormRow
        label={<ConnectionSubheading>API Key</ConnectionSubheading>}
        error={validationErrors.apiKey || undefined}
        isInvalid={!!validationErrors.apiKey}
      >
        <EuiFieldPassword
          type="dual"
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          onBlur={onBlurApiKey}
          isInvalid={!!validationErrors.apiKey}
          placeholder="Base64-encoded API key"
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButton
            onClick={onTestConnection}
            isLoading={connectionStatus === "testing"}
            iconType="link"
          >
            Test Connection
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {connectionStatus === "ok" && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Connection successful" color="success" iconType="check" size="s">
            <p>{connectionMsg}</p>
          </EuiCallOut>
        </>
      )}
      {connectionStatus === "fail" && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Connection failed" color="danger" iconType="cross" size="s">
            <p>{connectionMsg}</p>
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size="l" />

      {/* Index prefix */}
      {!isTracesMode && (
        <EuiFormRow
          label={<ConnectionSubheading>{prefixLabel}</ConnectionSubheading>}
          error={validationErrors.indexPrefix || undefined}
          isInvalid={!!validationErrors.indexPrefix}
        >
          <EuiFieldText
            value={indexPrefix}
            onChange={(e) => onIndexPrefixChange(e.target.value)}
            onBlur={onBlurIndexPrefix}
            isInvalid={!!validationErrors.indexPrefix}
          />
        </EuiFormRow>
      )}

      {/* APM index display for traces mode */}
      {isTracesMode && (
        <EuiPanel color="subdued">
          <ConnectionSubheading>APM Indices</ConnectionSubheading>
          <EuiSpacer size="s" />
          <EuiText size="s">
            <p>
              Traces are sent to the APM intake endpoint. Data appears in <code>traces-apm*</code>,{" "}
              <code>logs-apm*</code>, and <code>metrics-apm*</code> data streams.
            </p>
          </EuiText>
        </EuiPanel>
      )}

      <EuiSpacer size="l" />

      {/* Ingestion source — max 3 options per row so wide labels stay legible */}
      <EuiFormRow
        label={<ConnectionSubheading>Ingestion Source</ConnectionSubheading>}
        helpText="Override default per-service ingestion path"
        fullWidth
      >
        <>
          {ingestionRows.map((row, idx) => (
            <Fragment key={idx}>
              {idx > 0 && <EuiSpacer size="xs" />}
              <EuiButtonGroup
                legend={`Ingestion source selection (row ${idx + 1})`}
                options={row}
                idSelected={ingestionSource}
                onChange={(id) => onIngestionSourceChange(id)}
                isFullWidth
              />
            </Fragment>
          ))}
        </>
      </EuiFormRow>

      {ingestionOverrideCompatibleHint && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Ingestion override" color="success" iconType="check" size="s">
            <p>{ingestionOverrideCompatibleHint}</p>
          </EuiCallOut>
        </>
      )}

      {ingestionResetNotice && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Ingestion source adjusted" color="warning" iconType="alert" size="s">
            <p>{ingestionResetNotice}</p>
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size="l" />

      {/* Export / Import / Reset */}
      <EuiFlexGroup gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty iconType="exportAction" size="s" onClick={onExportConfig}>
            Export Config
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty iconType="importAction" size="s" onClick={onImportConfig}>
            Import Config
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty iconType="refresh" size="s" color="danger" onClick={onResetConfig}>
            Reset Config
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
}
