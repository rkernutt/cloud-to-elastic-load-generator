import { useMemo, useState } from "react";
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
import K from "../theme";

interface LogEntry {
  id: number;
  msg: string;
  type: string;
  ts: string;
  /** Full ISO timestamp when available (preferred for display). */
  at?: string;
}

interface ActivityPageProps {
  log: LogEntry[];
  preview: string | null;
  onDownloadLog: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  ok: K.success,
  error: K.danger,
  warn: K.warning,
  info: K.textSubdued,
};

type LogTypeFilter = "all" | "error" | "warn" | "ok";

const FILTER_PILLS: { id: LogTypeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "error", label: "Errors" },
  { id: "warn", label: "Warnings" },
  { id: "ok", label: "OK" },
];

function formatIsoTimestamp(entry: LogEntry): string {
  if (entry.at) return entry.at;
  const t = Date.parse(entry.ts);
  if (!Number.isNaN(t)) return new Date(t).toISOString();
  return entry.ts;
}

export function ActivityPage({ log, preview, onDownloadLog }: ActivityPageProps) {
  const [typeFilter, setTypeFilter] = useState<LogTypeFilter>("all");

  const filteredLog = useMemo(() => {
    if (typeFilter === "all") return log;
    return log.filter((e) => e.type === typeFilter);
  }, [log, typeFilter]);

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
              <strong>
                {typeFilter === "all" ? (
                  <>{log.length} entries</>
                ) : (
                  <>
                    {filteredLog.length} of {log.length} entries
                  </>
                )}
              </strong>
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

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {FILTER_PILLS.map((pill) => {
            const active = typeFilter === pill.id;
            const accent =
              pill.id === "all" ? K.textSubdued : (TYPE_COLORS[pill.id] ?? TYPE_COLORS.info);
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setTypeFilter(pill.id)}
                style={{
                  fontSize: 11,
                  lineHeight: 1.4,
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: `1px solid ${active ? accent : K.border}`,
                  background: active ? `${accent}26` : K.subdued,
                  color: active ? accent : K.textSubdued,
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        <EuiSpacer size="s" />

        {log.length === 0 ? (
          <EuiEmptyPrompt
            iconType="editorComment"
            title={<h3>No activity yet</h3>}
            body={<p>Ship some data to see activity entries here.</p>}
          />
        ) : filteredLog.length === 0 ? (
          <EuiEmptyPrompt
            iconType="filter"
            title={<h3>No matching entries</h3>}
            body={<p>Try a different filter or clear the filter to see all activity.</p>}
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
            {filteredLog.map((entry) => (
              <div
                key={entry.id}
                style={{
                  padding: "2px 8px",
                  borderLeft: `3px solid ${TYPE_COLORS[entry.type] ?? TYPE_COLORS.info}`,
                  marginBottom: 2,
                  color: TYPE_COLORS[entry.type] ?? TYPE_COLORS.info,
                }}
              >
                <span style={{ color: K.textSubdued, marginRight: 8 }}>
                  {formatIsoTimestamp(entry)}
                </span>
                {entry.msg}
              </div>
            ))}
          </div>
        )}
      </EuiPanel>
    </>
  );
}
