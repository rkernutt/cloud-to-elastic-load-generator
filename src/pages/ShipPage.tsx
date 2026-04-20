import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiButtonEmpty,
  EuiSwitch,
  EuiProgress,
  EuiStat,
  EuiCallOut,
  EuiCodeBlock,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
} from "@elastic/eui";
import { ScheduleSection } from "../components/ScheduleSection";

interface ShipPageProps {
  status: "running" | "done" | "aborted" | null;
  progress: { sent: number; total: number; errors: number; phase: string };
  pct: number;
  totalSelected: number;
  estimatedDocs: number;
  estimatedMB: number;
  estimatedBatches: number;
  isTracesMode: boolean;
  eventType: string;
  tracesPerService: number;
  logsPerService: number;
  dryRun: boolean;
  scheduleEnabled: boolean;
  scheduleTotalRuns: number;
  scheduleIntervalMin: number;
  scheduleActive: boolean;
  scheduleCurrentRun: number;
  scheduleRunsCompleted: number;
  nextRunAt: Date | null;
  countdown: number;
  /** Shown after a page refresh restored or failed to restore an in-progress schedule */
  scheduleResumeNotice?: string | null;
  canShip: boolean;
  onShip: () => void;
  onStop: () => void;
  onPreview: () => void;
  onDryRunChange: (checked: boolean) => void;
  onScheduleEnabledChange: (checked: boolean) => void;
  onScheduleTotalRunsChange: (n: number) => void;
  onScheduleIntervalMinChange: (n: number) => void;
  /** Return to Start to pick another data type and run the wizard again */
  onRestartWizard: () => void;
  /** Reset ship status so the user can ship the same config again */
  onShipAgain: () => void;
  /** Jump to the Config step to tweak settings before shipping again */
  onReconfigure: () => void;
  preview: string | null;
}

export function ShipPage({
  status,
  progress,
  pct,
  totalSelected,
  estimatedDocs,
  estimatedMB,
  estimatedBatches,
  isTracesMode,
  eventType,
  tracesPerService,
  logsPerService,
  dryRun,
  scheduleEnabled,
  scheduleTotalRuns,
  scheduleIntervalMin,
  scheduleActive,
  scheduleCurrentRun,
  scheduleRunsCompleted,
  nextRunAt,
  countdown,
  scheduleResumeNotice,
  canShip,
  onShip,
  onStop,
  onPreview,
  onDryRunChange,
  onScheduleEnabledChange,
  onScheduleTotalRunsChange,
  onScheduleIntervalMinChange,
  onRestartWizard,
  onShipAgain,
  onReconfigure,
  preview,
}: ShipPageProps) {
  const isRunning = status === "running";
  const perService = isTracesMode ? tracesPerService : logsPerService;
  const scheduleRunsRemaining = Math.max(0, scheduleTotalRuns - scheduleRunsCompleted);
  const showScheduleProgress = scheduleEnabled && (scheduleActive || scheduleRunsCompleted > 0);

  const formatCountdown = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  return (
    <>
      <EuiTitle size="s">
        <h2>Ship &amp; Monitor</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiPanel paddingSize="m">
        <EuiTitle size="xs">
          <h3>Shipping schedule</h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <ScheduleSection
          scheduleEnabled={scheduleEnabled}
          scheduleTotalRuns={scheduleTotalRuns}
          scheduleIntervalMin={scheduleIntervalMin}
          onScheduleEnabledChange={onScheduleEnabledChange}
          onScheduleTotalRunsChange={onScheduleTotalRunsChange}
          onScheduleIntervalMinChange={onScheduleIntervalMinChange}
          showTitle={false}
        />
      </EuiPanel>

      <EuiSpacer size="l" />

      {showScheduleProgress && (
        <>
          <EuiCallOut
            title={scheduleActive ? "Scheduled shipping progress" : "Last scheduled shipping"}
            color={scheduleActive ? "primary" : "success"}
            iconType="clock"
          >
            <p>
              <strong>{scheduleRunsCompleted}</strong> of {scheduleTotalRuns} runs completed ·{" "}
              <strong>{scheduleRunsRemaining}</strong> remaining
              {scheduleActive && isRunning && scheduleCurrentRun > 0 && (
                <>
                  {" "}
                  (shipping run {scheduleCurrentRun} of {scheduleTotalRuns})
                </>
              )}
            </p>
            {scheduleActive && nextRunAt && !isRunning && (
              <p>
                Next run starts round <strong>{scheduleCurrentRun + 1}</strong> of{" "}
                {scheduleTotalRuns} in <strong>{formatCountdown(countdown)}</strong>.
              </p>
            )}
            {!scheduleActive && scheduleRunsCompleted >= scheduleTotalRuns && (
              <p>All scheduled runs finished.</p>
            )}
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {scheduleResumeNotice && (
        <>
          <EuiCallOut title="Schedule" color="warning" iconType="clock">
            <p>{scheduleResumeNotice}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {/* Action buttons */}
      <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            iconType="play"
            onClick={onShip}
            isDisabled={!canShip || isRunning}
            isLoading={isRunning}
          >
            {scheduleEnabled ? "Start Schedule" : "Ship"}
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton color="danger" iconType="stop" onClick={onStop} isDisabled={!isRunning}>
            Stop
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty iconType="eye" onClick={onPreview}>
            Preview
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiSwitch
            label="Dry run"
            checked={dryRun}
            onChange={(e) => onDryRunChange(e.target.checked)}
          />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* Estimate callout */}
      <EuiCallOut title="Estimated output" color="primary" iconType="iInCircle" size="s">
        <p>
          {totalSelected} services x {perService} {eventType}/service ={" "}
          <strong>~{estimatedDocs.toLocaleString()} docs</strong> (~{estimatedMB.toFixed(1)} MB in ~
          {estimatedBatches} batches)
        </p>
      </EuiCallOut>

      <EuiSpacer size="m" />

      {/* Progress section */}
      {isRunning && (
        <EuiPanel>
          <EuiProgress
            value={pct}
            max={100}
            size="l"
            color={progress.errors > 0 ? "danger" : "primary"}
            label={
              progress.phase === "injection" ? "Injecting anomalies..." : `Shipping ${eventType}...`
            }
            valueText={`${pct}%`}
          />
          <EuiSpacer size="m" />
          <EuiFlexGroup gutterSize="l">
            <EuiFlexItem>
              <EuiStat title={progress.sent.toLocaleString()} description="Indexed" titleSize="s" />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiStat title={progress.total.toLocaleString()} description="Total" titleSize="s" />
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiStat
                title={progress.errors.toLocaleString()}
                description="Errors"
                titleSize="s"
                titleColor={progress.errors > 0 ? "danger" : "default"}
              />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      )}

      {/* Completion/abort status */}
      {status === "done" && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Shipping complete" color="success" iconType="check">
            <p>
              {progress.sent.toLocaleString()} documents indexed
              {progress.errors > 0 && ` with ${progress.errors} errors`}.
            </p>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" wrap>
              <EuiFlexItem grow={false}>
                <EuiButton iconType="refresh" onClick={onShipAgain}>
                  Ship Again
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty iconType="gear" onClick={onReconfigure}>
                  Reconfigure
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty iconType="home" onClick={onRestartWizard}>
                  Back to Start
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiCallOut>
        </>
      )}
      {status === "aborted" && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut title="Shipping aborted" color="danger" iconType="cross">
            <p>
              {progress.sent.toLocaleString()} of {progress.total.toLocaleString()} documents
              indexed before abort.
            </p>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" wrap>
              <EuiFlexItem grow={false}>
                <EuiButton iconType="refresh" onClick={onShipAgain}>
                  Retry
                </EuiButton>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty iconType="gear" onClick={onReconfigure}>
                  Reconfigure
                </EuiButtonEmpty>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiCallOut>
        </>
      )}

      {/* Preview JSON */}
      {preview && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xs">
            <h3>Sample Document Preview</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiCodeBlock language="json" overflowHeight={400} isCopyable>
            {preview}
          </EuiCodeBlock>
        </>
      )}
    </>
  );
}
