import { EuiFormRow, EuiRange, EuiSwitch, EuiCallOut, EuiSpacer, EuiTitle } from "@elastic/eui";

interface ConfigPageProps {
  eventType: string;
  isTracesMode: boolean;
  logsPerService: number;
  tracesPerService: number;
  errorRate: number;
  batchSize: number;
  batchDelayMs: number;
  injectAnomalies: boolean;
  onLogsPerServiceChange: (val: number) => void;
  onTracesPerServiceChange: (val: number) => void;
  onErrorRateChange: (val: number) => void;
  onBatchSizeChange: (val: number) => void;
  onBatchDelayMsChange: (val: number) => void;
  onInjectAnomaliesChange: (val: boolean) => void;
}

export function ConfigPage({
  eventType,
  isTracesMode,
  logsPerService,
  tracesPerService,
  errorRate,
  batchSize,
  batchDelayMs,
  injectAnomalies,
  onLogsPerServiceChange,
  onTracesPerServiceChange,
  onErrorRateChange,
  onBatchSizeChange,
  onBatchDelayMsChange,
  onInjectAnomaliesChange,
}: ConfigPageProps) {
  return (
    <>
      <EuiTitle size="s">
        <h2>Configuration</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      {isTracesMode ? (
        <EuiFormRow label="Traces per service" helpText={`${tracesPerService} traces`}>
          <EuiRange
            min={10}
            max={2000}
            step={10}
            value={tracesPerService}
            onChange={(e) => onTracesPerServiceChange(Number(e.currentTarget.value))}
            showInput
            showLabels
          />
        </EuiFormRow>
      ) : (
        <EuiFormRow
          label={`${eventType === "metrics" ? "Metrics" : "Logs"} per service`}
          helpText={`${logsPerService} ${eventType}/service`}
        >
          <EuiRange
            min={10}
            max={5000}
            step={10}
            value={logsPerService}
            onChange={(e) => onLogsPerServiceChange(Number(e.currentTarget.value))}
            showInput
            showLabels
          />
        </EuiFormRow>
      )}

      <EuiFormRow label="Error rate" helpText={`${(errorRate * 100).toFixed(1)}%`}>
        <EuiRange
          min={0}
          max={0.5}
          step={0.01}
          value={errorRate}
          onChange={(e) => onErrorRateChange(Number(e.currentTarget.value))}
          showInput
          showLabels
        />
      </EuiFormRow>

      <EuiFormRow label="Batch size" helpText={`${batchSize} docs/batch`}>
        <EuiRange
          min={50}
          max={2000}
          step={50}
          value={batchSize}
          onChange={(e) => onBatchSizeChange(Number(e.currentTarget.value))}
          showInput
          showLabels
        />
      </EuiFormRow>

      <EuiFormRow label="Batch delay (ms)" helpText={`${batchDelayMs}ms between batches`}>
        <EuiRange
          min={0}
          max={500}
          step={5}
          value={batchDelayMs}
          onChange={(e) => onBatchDelayMsChange(Number(e.currentTarget.value))}
          showInput
          showLabels
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiSwitch
        label="Inject anomalies"
        checked={injectAnomalies}
        onChange={(e) => onInjectAnomaliesChange(e.target.checked)}
      />

      {injectAnomalies && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Anomaly injection enabled" color="warning" iconType="warning" size="s">
            <p>
              After shipping, a second pass will inject anomalous documents with elevated error
              rates, unusual latencies, and out-of-pattern values. This is useful for testing ML
              anomaly detection jobs and alerting rules in Elastic.
            </p>
          </EuiCallOut>
        </>
      )}
    </>
  );
}
