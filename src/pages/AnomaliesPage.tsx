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
          concentrated in a <strong>5-minute window</strong> with:
        </p>
        <ul>
          <li>
            <strong>100% error rate</strong> — all generated events use the maximum failure rate,
            producing a burst of <code>event.outcome: failure</code> documents
          </li>
          <li>
            <strong>15x duration scaling (logs &amp; traces)</strong> — all duration fields
            (duration_ms, execution_time_ms, total_time, etc.) are multiplied by 15
          </li>
          <li>
            <strong>20x metric scaling</strong> — all numeric metric fields are multiplied by 20
          </li>
        </ul>
        <p>
          These concentrated spikes are designed to trigger ML anomaly detection jobs that use{" "}
          <code>high_mean</code> (duration) and <code>high_count</code> (error) detectors with
          15-minute bucket spans.
        </p>
      </EuiCallOut>

      <EuiSpacer size="m" />

      <EuiCallOut title="Building a baseline first" color="primary" iconType="iInCircle">
        <p>
          ML anomaly detection requires a period of <strong>normal baseline data</strong> before it
          can identify anomalies. For best results:
        </p>
        <ol>
          <li>
            Ship <strong>3-5 batches</strong> of normal data with anomaly injection{" "}
            <strong>disabled</strong>
          </li>
          <li>
            Wait for the ML jobs to process at least <strong>4-6 bucket spans</strong> (1-2 hours
            with the default 15-minute buckets)
          </li>
          <li>
            Then ship <strong>one batch</strong> with anomaly injection <strong>enabled</strong> —
            the concentrated spike should trigger anomaly scores
          </li>
        </ol>
        <p>
          If you enable anomaly injection on every shipping run, the ML model learns the spikes as
          &ldquo;normal&rdquo; and won&rsquo;t flag them.
        </p>
      </EuiCallOut>
    </>
  );
}
