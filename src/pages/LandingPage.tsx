import {
  EuiButton,
  EuiSpacer,
  EuiTitle,
  EuiText,
  EuiHorizontalRule,
  EuiDescriptionList,
} from "@elastic/eui";

interface LandingPageProps {
  /** Multi-cloud app title copy */
  isUnifiedCloud: boolean;
  onGetStarted: () => void;
}

export function LandingPage({ isUnifiedCloud, onGetStarted }: LandingPageProps) {
  const appLabel = isUnifiedCloud ? "Cloud to Elastic Load Generator" : "Load Generator";

  const wizardListItems = [
    {
      title: "Start",
      description: isUnifiedCloud
        ? "Select your cloud vendor so the right services and defaults load. Configure Elasticsearch, choose deployment type, event type (logs, metrics, or traces), and ingestion options."
        : "Configure Elasticsearch, choose deployment type, event type (logs, metrics, or traces), and ingestion options.",
    },
    {
      title: "Setup",
      description:
        "Install/Uninstall optional Fleet integrations, ingest pipelines, dashboards, and ML jobs. Use Uninstall/Reinstall mode on the same screen to reinstall or reset those assets.",
    },
    {
      title: "Select",
      description:
        "Pick which cloud services to simulate. Selection drives which generators run and how much data you ship per service.",
    },
    {
      title: "Configure",
      description:
        "Tune volume (documents or traces per service), error rate, batch size, pacing, and whether to inject anomalies for testing.",
    },
    {
      title: "Ship",
      description:
        "Run a one-off load or a scheduled series. Preview documents, monitor progress, and download an activity log if needed.",
    },
  ];

  const sidebarListItems = [
    {
      title: "Anomalies",
      description:
        "Toggle anomaly injection settings used during shipping (spikes and outliers for logs, metrics, or traces).",
    },
    {
      title: "Activity Log",
      description:
        "View recent messages from the generator and download a text log for troubleshooting or sharing.",
    },
  ];

  return (
    <>
      <EuiTitle size="l">
        <h1>Welcome</h1>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="m">
        <p>
          <strong>{appLabel}</strong> generates realistic synthetic telemetry and sends it to your
          Elastic stack so you can demo observability, test ingest capacity, or validate dashboards
          and detectors without production traffic.
        </p>
      </EuiText>

      <EuiSpacer size="l" />
      <EuiTitle size="s">
        <h2>Workflow — steps across the top</h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          Use the horizontal stepper to move in order, or jump back to any step when you need to.
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      <EuiDescriptionList type="responsiveColumn" compressed listItems={wizardListItems} />

      <EuiSpacer size="l" />
      <EuiHorizontalRule />
      <EuiSpacer size="l" />

      <EuiTitle size="s">
        <h2>Sidebar — under “More”</h2>
      </EuiTitle>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          Extra screens are listed in the left nav under <strong>More</strong>. Open them anytime;
          they do not replace the main workflow steps above.
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      <EuiDescriptionList type="responsiveColumn" compressed listItems={sidebarListItems} />

      <EuiSpacer size="xl" />
      <EuiButton fill iconType="arrowRight" iconSide="right" onClick={onGetStarted}>
        Get started
      </EuiButton>
    </>
  );
}
