import { EuiSwitch, EuiText, EuiCallOut, EuiSpacer, EuiTitle } from "@elastic/eui";

interface AnomaliesPageProps {
  injectAnomalies: boolean;
  onInjectAnomaliesChange: (val: boolean) => void;
}

export function AnomaliesPage({ injectAnomalies, onInjectAnomaliesChange }: AnomaliesPageProps) {
  return (
    <>
      <EuiTitle size="s">
        <h2>Anomaly Injection</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiText>
        <p>
          Anomaly injection adds a second shipping pass after the main data generation. It creates
          documents with deliberately abnormal patterns that stand out from the baseline data,
          making them ideal targets for Elastic ML anomaly detection jobs.
        </p>
      </EuiText>

      <EuiSpacer size="m" />

      <EuiSwitch
        label="Enable anomaly injection"
        checked={injectAnomalies}
        onChange={(e) => onInjectAnomaliesChange(e.target.checked)}
      />

      <EuiSpacer size="m" />

      <EuiCallOut title="How anomaly injection works" color="warning" iconType="warning">
        <p>
          When enabled, after the normal data shipping completes, a second pass generates documents
          with:
        </p>
        <ul>
          <li>
            <strong>Elevated error rates</strong> -- 5x the configured error rate for targeted
            services
          </li>
          <li>
            <strong>Unusual latencies</strong> -- response times 10-50x higher than normal baselines
          </li>
          <li>
            <strong>Out-of-pattern values</strong> -- abnormal byte counts, request sizes, and
            status code distributions
          </li>
        </ul>
        <p>
          These anomalous patterns are designed to trigger ML anomaly detection jobs in Elastic
          Observability and Security. Use them to validate alerting rules, test dashboards, and
          demonstrate ML capabilities.
        </p>
      </EuiCallOut>
    </>
  );
}
