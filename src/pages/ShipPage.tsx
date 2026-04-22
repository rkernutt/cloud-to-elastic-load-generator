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
  EuiFieldNumber,
  EuiFormRow,
  EuiSteps,
  EuiIcon,
  EuiBadge,
  EuiText,
} from "@elastic/eui";
import { ScheduleSection } from "../components/ScheduleSection";
import type { MLTrainingState, MLTrainingConfig } from "../hooks/useMLTrainingLoop";

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

  mlState: MLTrainingState;
  mlTrainingConfig: MLTrainingConfig;
  onMLTrainingConfigChange: (cfg: MLTrainingConfig) => void;
  onStartMLTraining: () => void;
  onStopMLTraining: () => void;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function MLTrainingSection({
  mlState,
  mlTrainingConfig,
  onMLTrainingConfigChange,
  onStartMLTraining,
  onStopMLTraining,
  canShip,
  isRunning,
  scheduleEnabled,
}: {
  mlState: MLTrainingState;
  mlTrainingConfig: MLTrainingConfig;
  onMLTrainingConfigChange: (cfg: MLTrainingConfig) => void;
  onStartMLTraining: () => void;
  onStopMLTraining: () => void;
  canShip: boolean;
  isRunning: boolean;
  scheduleEnabled: boolean;
}) {
  const isMLActive = mlState.active;
  const isMLDone = mlState.phase === "done";

  const phaseLabel: Record<string, string> = {
    idle: "Not started",
    baseline: "Shipping baseline data",
    baseline_wait: "Waiting between baseline runs",
    ml_learning: "Waiting for ML to learn baseline",
    injection: "Shipping anomaly injection",
    done: "Complete",
  };

  const stepStatus = (phase: string, targetPhase: string, completedPhases: string[]) => {
    if (phase === targetPhase) return "current" as const;
    if (completedPhases.includes(phase) || mlState.phase === "done") return "complete" as const;
    return "incomplete" as const;
  };

  const baselineCompleted =
    mlState.phase === "ml_learning" || mlState.phase === "injection" || mlState.phase === "done";
  const mlWaitCompleted = mlState.phase === "injection" || mlState.phase === "done";

  const steps = [
    {
      title: `Baseline: ${mlTrainingConfig.baselineRuns} runs, ${mlTrainingConfig.baselineIntervalMin} min apart`,
      status: stepStatus(
        mlState.phase,
        "baseline",
        baselineCompleted ? ["baseline", "baseline_wait"] : []
      ),
      children:
        mlState.phase === "baseline" || mlState.phase === "baseline_wait" ? (
          <EuiText size="s">
            <p>
              Run <strong>{mlState.baselineRun}</strong> of {mlState.baselineTotal}
              {mlState.phase === "baseline_wait" && mlState.countdown > 0 && (
                <>
                  {" "}
                  — next run in <strong>{formatCountdown(mlState.countdown)}</strong>
                </>
              )}
              {mlState.phase === "baseline" && isRunning && " — shipping…"}
            </p>
          </EuiText>
        ) : baselineCompleted ? (
          <EuiBadge color="success">Complete</EuiBadge>
        ) : null,
    },
    {
      title: `ML learning: wait ${mlTrainingConfig.mlWaitMin} min`,
      status: stepStatus(mlState.phase, "ml_learning", mlWaitCompleted ? ["ml_learning"] : []),
      children:
        mlState.phase === "ml_learning" ? (
          <EuiText size="s">
            <p>
              ML jobs are processing the baseline.{" "}
              {mlState.countdown > 0 && (
                <>
                  Resuming in <strong>{formatCountdown(mlState.countdown)}</strong>
                </>
              )}
            </p>
          </EuiText>
        ) : mlWaitCompleted ? (
          <EuiBadge color="success">Complete</EuiBadge>
        ) : null,
    },
    {
      title: "Anomaly injection: 1 run with 15x duration spike",
      status: stepStatus(mlState.phase, "injection", mlState.phase === "done" ? ["injection"] : []),
      children:
        mlState.phase === "injection" ? (
          <EuiText size="s">
            <p>Shipping anomaly data with 100% error rate and 15x duration scaling…</p>
          </EuiText>
        ) : mlState.phase === "done" ? (
          <EuiBadge color="success">Complete</EuiBadge>
        ) : null,
    },
  ];

  return (
    <EuiPanel paddingSize="m" hasBorder>
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type="machineLearningApp" size="l" />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="xs">
            <h3>ML Training Mode</h3>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        <p>
          Automates the full ML anomaly detection workflow: builds a normal baseline, waits for ML
          to learn, then injects anomalies. After completion, check the{" "}
          <strong>Anomaly Explorer</strong> in Kibana.
        </p>
      </EuiText>
      <EuiSpacer size="m" />

      {!isMLActive && !isMLDone && (
        <>
          <EuiFlexGroup gutterSize="m" wrap>
            <EuiFlexItem style={{ minWidth: 140 }}>
              <EuiFormRow label="Baseline runs" helpText="Normal data batches to build baseline">
                <EuiFieldNumber
                  value={mlTrainingConfig.baselineRuns}
                  min={2}
                  max={20}
                  onChange={(e) =>
                    onMLTrainingConfigChange({
                      ...mlTrainingConfig,
                      baselineRuns: Math.max(2, Math.min(20, Number(e.target.value) || 2)),
                    })
                  }
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem style={{ minWidth: 140 }}>
              <EuiFormRow label="Interval (min)" helpText="Wait between baseline runs">
                <EuiFieldNumber
                  value={mlTrainingConfig.baselineIntervalMin}
                  min={1}
                  max={60}
                  onChange={(e) =>
                    onMLTrainingConfigChange({
                      ...mlTrainingConfig,
                      baselineIntervalMin: Math.max(1, Math.min(60, Number(e.target.value) || 1)),
                    })
                  }
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem style={{ minWidth: 140 }}>
              <EuiFormRow label="ML wait (min)" helpText="Wait for ML to learn baseline">
                <EuiFieldNumber
                  value={mlTrainingConfig.mlWaitMin}
                  min={5}
                  max={120}
                  onChange={(e) =>
                    onMLTrainingConfigChange({
                      ...mlTrainingConfig,
                      mlWaitMin: Math.max(5, Math.min(120, Number(e.target.value) || 5)),
                    })
                  }
                />
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="m" />
          <EuiCallOut title="Estimated duration" color="primary" iconType="clock" size="s">
            <p>
              {mlTrainingConfig.baselineRuns} baseline runs × {mlTrainingConfig.baselineIntervalMin}{" "}
              min + {mlTrainingConfig.mlWaitMin} min ML wait + 1 injection run ≈{" "}
              <strong>
                {Math.round(
                  (mlTrainingConfig.baselineRuns - 1) * mlTrainingConfig.baselineIntervalMin +
                    mlTrainingConfig.mlWaitMin +
                    5
                )}{" "}
                minutes
              </strong>{" "}
              total
            </p>
          </EuiCallOut>
          <EuiSpacer size="m" />
          <EuiButton
            fill
            color="success"
            iconType="play"
            onClick={onStartMLTraining}
            isDisabled={!canShip || isRunning || scheduleEnabled}
          >
            Start ML Training
          </EuiButton>
          {scheduleEnabled && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="xs" color="warning">
                <p>Disable the shipping schedule above to use ML Training Mode.</p>
              </EuiText>
            </>
          )}
        </>
      )}

      {(isMLActive || isMLDone) && (
        <>
          <EuiSteps steps={steps} titleSize="xs" />

          {isMLActive && (
            <>
              <EuiSpacer size="s" />
              <EuiText size="s">
                <p>
                  <strong>Phase:</strong> {phaseLabel[mlState.phase] ?? mlState.phase}
                </p>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiButton color="danger" iconType="stop" onClick={onStopMLTraining}>
                Stop ML Training
              </EuiButton>
            </>
          )}

          {isMLDone && (
            <>
              <EuiSpacer size="m" />
              <EuiCallOut title="ML Training complete" color="success" iconType="check">
                <p>
                  The baseline has been established and anomalies have been injected. Open the{" "}
                  <strong>Anomaly Explorer</strong> in Kibana to view detected anomalies. ML jobs
                  with 15-minute bucket spans should start scoring within a few minutes.
                </p>
              </EuiCallOut>
            </>
          )}
        </>
      )}
    </EuiPanel>
  );
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
  mlState,
  mlTrainingConfig,
  onMLTrainingConfigChange,
  onStartMLTraining,
  onStopMLTraining,
}: ShipPageProps) {
  const isRunning = status === "running";
  const perService = isTracesMode ? tracesPerService : logsPerService;
  const scheduleRunsRemaining = Math.max(0, scheduleTotalRuns - scheduleRunsCompleted);
  const showScheduleProgress = scheduleEnabled && (scheduleActive || scheduleRunsCompleted > 0);

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

      <MLTrainingSection
        mlState={mlState}
        mlTrainingConfig={mlTrainingConfig}
        onMLTrainingConfigChange={onMLTrainingConfigChange}
        onStartMLTraining={onStartMLTraining}
        onStopMLTraining={onStopMLTraining}
        canShip={canShip}
        isRunning={isRunning}
        scheduleEnabled={scheduleEnabled}
      />

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
            isDisabled={!canShip || isRunning || mlState.active}
            isLoading={isRunning && !mlState.active}
          >
            {scheduleEnabled ? "Start Schedule" : "Ship"}
          </EuiButton>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            color="danger"
            iconType="stop"
            onClick={onStop}
            isDisabled={!isRunning && !mlState.active}
          >
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
      {status === "done" && !mlState.active && (
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
      {status === "aborted" && !mlState.active && (
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
