import type { ReactNode } from "react";
import {
  EuiPanel,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSwitch,
  EuiText,
  EuiBadge,
  EuiSpacer,
} from "@elastic/eui";

export interface InstallerRowProps {
  label: string;
  badge: "Kibana" | "Elasticsearch";
  description: ReactNode;
  enabled: boolean;
  onToggle: (val: boolean) => void;
  children?: ReactNode;
}

export function InstallerRow({
  label,
  badge,
  description,
  enabled,
  onToggle,
  children,
}: InstallerRowProps) {
  return (
    <EuiPanel paddingSize="m" hasBorder>
      <EuiFlexGroup alignItems="flexStart" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false} style={{ paddingTop: 2 }}>
          <EuiSwitch
            label={label}
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            showLabel={false}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiText size="s">
                <strong>{label}</strong>
              </EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiBadge color={badge === "Kibana" ? "primary" : "hollow"}>{badge}</EuiBadge>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
          <EuiText size="xs" color="subdued">
            <p>{description}</p>
          </EuiText>
          {children}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
