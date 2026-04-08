import {
  EuiCodeBlock,
  EuiPanel,
  EuiButtonEmpty,
  EuiEmptyPrompt,
  EuiSpacer,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
} from "@elastic/eui";

interface LogEntry {
  id: number;
  msg: string;
  type: string;
  ts: string;
}

interface ActivityPageProps {
  log: LogEntry[];
  preview: string | null;
  onDownloadLog: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  ok: "#017D73",
  error: "#BD271E",
  warn: "#F5A700",
  info: "#98A2B3",
};

export function ActivityPage({ log, preview, onDownloadLog }: ActivityPageProps) {
  return (
    <>
      <EuiTitle size="s">
        <h2>Activity Log</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      {/* Preview JSON */}
      {preview && (
        <>
          <EuiTitle size="xs">
            <h3>Sample Document</h3>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiCodeBlock language="json" overflowHeight={300} isCopyable>
            {preview}
          </EuiCodeBlock>
          <EuiSpacer size="m" />
        </>
      )}

      {/* Log panel */}
      <EuiPanel>
        <EuiFlexGroup justifyContent="spaceBetween" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiText size="s">
              <strong>{log.length} entries</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty
              iconType="download"
              size="s"
              onClick={onDownloadLog}
              isDisabled={log.length === 0}
            >
              Download
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        {log.length === 0 ? (
          <EuiEmptyPrompt
            iconType="editorComment"
            title={<h3>No activity yet</h3>}
            body={<p>Ship some data to see activity entries here.</p>}
          />
        ) : (
          <div
            style={{
              maxHeight: 500,
              overflowY: "auto",
              fontFamily: "monospace",
              fontSize: 12,
              lineHeight: 1.6,
            }}
          >
            {log.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: "2px 8px",
                  borderLeft: `3px solid ${TYPE_COLORS[entry.type] ?? TYPE_COLORS.info}`,
                  marginBottom: 2,
                  color: TYPE_COLORS[entry.type] ?? TYPE_COLORS.info,
                }}
              >
                <span style={{ color: "#98A2B3", marginRight: 8 }}>{entry.ts}</span>
                {entry.msg}
              </div>
            ))}
          </div>
        )}
      </EuiPanel>
    </>
  );
}
