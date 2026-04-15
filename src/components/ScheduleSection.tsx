import {
  EuiSwitch,
  EuiFormRow,
  EuiRange,
  EuiCallOut,
  EuiText,
  EuiSpacer,
  EuiTitle,
} from "@elastic/eui";

export interface ScheduleSectionProps {
  scheduleEnabled: boolean;
  scheduleTotalRuns: number;
  scheduleIntervalMin: number;
  onScheduleEnabledChange: (val: boolean) => void;
  onScheduleTotalRunsChange: (val: number) => void;
  onScheduleIntervalMinChange: (val: number) => void;
  /** When false, hides the section title (e.g. when embedded on Ship page). */
  showTitle?: boolean;
}

/**
 * Scheduled shipping controls — shared by Ship page (primary) and optional standalone views.
 */
export function ScheduleSection({
  scheduleEnabled,
  scheduleTotalRuns,
  scheduleIntervalMin,
  onScheduleEnabledChange,
  onScheduleTotalRunsChange,
  onScheduleIntervalMinChange,
  showTitle = true,
}: ScheduleSectionProps) {
  const totalMinutes = scheduleTotalRuns * scheduleIntervalMin;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <>
      {showTitle && (
        <>
          <EuiTitle size="s">
            <h2>Scheduling</h2>
          </EuiTitle>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiCallOut title="Scheduled shipping" color="primary" iconType="clock" size="s">
        <p>
          When enabled, Ship (or Start Schedule) repeats at the interval below. Useful for steady
          load over time. On the Ship step, the summary and header badge show how many runs have
          finished and how many are still queued.
        </p>
      </EuiCallOut>

      <EuiSpacer size="m" />

      <EuiSwitch
        label="Enable scheduled shipping"
        checked={scheduleEnabled}
        onChange={(e) => onScheduleEnabledChange(e.target.checked)}
      />

      <EuiSpacer size="m" />

      <EuiFormRow label="Total runs" helpText={`Will ship ${scheduleTotalRuns} times`}>
        <EuiRange
          min={2}
          max={100}
          step={1}
          value={scheduleTotalRuns}
          onChange={(e) => onScheduleTotalRunsChange(Number(e.currentTarget.value))}
          showInput
          showLabels
          disabled={!scheduleEnabled}
        />
      </EuiFormRow>

      <EuiFormRow
        label="Interval (minutes)"
        helpText={`${scheduleIntervalMin} minutes between runs`}
      >
        <EuiRange
          min={1}
          max={120}
          step={1}
          value={scheduleIntervalMin}
          onChange={(e) => onScheduleIntervalMinChange(Number(e.currentTarget.value))}
          showInput
          showLabels
          disabled={!scheduleEnabled}
        />
      </EuiFormRow>

      <EuiSpacer size="m" />

      <EuiText size="s" color="subdued">
        <p>
          <strong>Estimated total span:</strong> {scheduleTotalRuns} runs × {scheduleIntervalMin}{" "}
          min = <strong>{timeStr}</strong>
        </p>
      </EuiText>
    </>
  );
}
