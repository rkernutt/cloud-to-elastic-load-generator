import React from "react";
import packageJson from "../../package.json";
import K from "../theme";
import {
  EuiPageTemplate,
  EuiSideNav,
  EuiIcon,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiStepsHorizontal,
  EuiHeader,
  EuiHeaderSectionItem,
  EuiTitle,
} from "@elastic/eui";
import { PipelineLogo } from "./Logo";

interface AppLayoutProps {
  branding: { headerLogoSrc: string; headerLogoAlt: string };
  /** Linear wizard steps (Start through Ship); order matches the horizontal stepper */
  wizardSteps: readonly { id: string; title: string }[];
  /** When set (multi-cloud UI), replaces the default “Load Generator” title */
  headerAppTitle?: string;
  /** Active hyperscaler mark next to the title (icon only; text label optional for badges) */
  headerVendorBadge?: { logoSrc: string; logoAlt: string; label?: string };
  /** Default `/elastic-logo.svg`; optional neutral wordmark for dark header */
  headerWordmarkSrc?: string;
  activePage: string;
  onNavigate: (page: string) => void;
  children: React.ReactNode;
  /** Optional footer below main content (wizard “Next”, etc.) */
  footer?: React.ReactNode;
  status: "running" | "done" | "aborted" | null;
  totalSelected: number;
  totalServices: number;
  scheduleActive: boolean;
  scheduleCurrentRun: number;
  scheduleRunsCompleted: number;
  scheduleTotalRuns: number;
  isConnected: boolean;
  hasServicesSelected: boolean;
  isSetupDone: boolean;
}

/** Secondary nav items. */
const EXTRA_NAV = [
  { id: "anomalies", label: "Anomalies", icon: "bug" },
  { id: "log", label: "Activity Log", icon: "list" },
] as const;

const OVERVIEW_NAV = [{ id: "welcome", label: "Welcome", icon: "home" }] as const;

export function AppLayout({
  branding,
  wizardSteps,
  headerAppTitle,
  headerVendorBadge,
  headerWordmarkSrc,
  activePage,
  onNavigate,
  children,
  footer,
  status,
  totalSelected,
  totalServices,
  scheduleActive,
  scheduleCurrentRun: _scheduleCurrentRun,
  scheduleRunsCompleted,
  scheduleTotalRuns,
  isConnected,
  hasServicesSelected,
  isSetupDone,
}: AppLayoutProps) {
  const stepIds = wizardSteps.map((s) => s.id);
  /** Determine step status for the horizontal stepper */
  const activeStepIdx = stepIds.indexOf(activePage);
  const onWizardStep = activeStepIdx >= 0;

  const stepStatuses = wizardSteps.map((step, idx) => {
    const isPast = onWizardStep && idx < activeStepIdx;
    let isComplete = false;
    if (isPast) {
      if (step.id === "connection") isComplete = isConnected;
      if (step.id === "setup") isComplete = isSetupDone;
      if (step.id === "services" || step.id === "security") isComplete = hasServicesSelected;
      if (step.id === "config") isComplete = hasServicesSelected;
      if (step.id === "ship") isComplete = status === "done";
    }

    let stepStatus: "complete" | "current" | "incomplete" | "disabled";
    if (onWizardStep && idx === activeStepIdx) {
      stepStatus = "current";
    } else if (isComplete) {
      stepStatus = "complete";
    } else {
      stepStatus = "incomplete";
    }

    return {
      title: step.title,
      status: stepStatus,
      onClick: () => onNavigate(step.id),
    };
  });

  const sideNavItems = [
    {
      name: "Overview",
      id: "nav-overview",
      items: OVERVIEW_NAV.map((item) => ({
        id: item.id,
        name: item.label,
        icon: <EuiIcon type={item.icon} />,
        isSelected: activePage === item.id,
        onClick: () => onNavigate(item.id),
      })),
    },
    {
      name: "More",
      id: "nav-extra",
      items: EXTRA_NAV.map((item) => ({
        id: item.id,
        name: item.label,
        icon: <EuiIcon type={item.icon} />,
        isSelected: activePage === item.id,
        onClick: () => onNavigate(item.id),
      })),
    },
  ];

  const statusBadge = (() => {
    if (status === "running") return <EuiBadge color="primary">Shipping</EuiBadge>;
    if (status === "done") return <EuiBadge color="success">Complete</EuiBadge>;
    if (status === "aborted") return <EuiBadge color="danger">Aborted</EuiBadge>;
    return null;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* ── Dark header bar ─────────────────────────────────────────── */}
      <EuiHeader
        theme="dark"
        position="fixed"
        sections={[
          {
            items: [
              <EuiHeaderSectionItem key="brand">
                <EuiFlexGroup gutterSize="m" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <img
                      src={branding.headerLogoSrc}
                      alt={branding.headerLogoAlt}
                      style={{
                        height: 32,
                        width: "auto",
                        display: "block",
                        objectFit: "contain",
                      }}
                    />
                  </EuiFlexItem>

                  {/* Pipeline logo */}
                  <EuiFlexItem grow={false}>
                    <PipelineLogo size={32} />
                  </EuiFlexItem>

                  {/* Elastic horizontal wordmark — color-reverse SVG from public/ */}
                  <EuiFlexItem grow={false}>
                    <img
                      src={headerWordmarkSrc ?? "/elastic-logo.svg"}
                      alt=""
                      style={{ height: 26, display: "block", objectFit: "contain" }}
                    />
                  </EuiFlexItem>

                  {/* App title */}
                  <EuiFlexItem grow={false}>
                    <EuiTitle size="s">
                      <h1
                        style={{
                          color: K.headerText,
                          fontWeight: 700,
                          letterSpacing: "-0.02em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {headerAppTitle ?? "Load Generator"}
                      </h1>
                    </EuiTitle>
                  </EuiFlexItem>

                  {headerVendorBadge && (
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
                        <EuiFlexItem grow={false}>
                          <img
                            src={headerVendorBadge.logoSrc}
                            alt={headerVendorBadge.logoAlt}
                            style={{
                              height: 28,
                              width: "auto",
                              maxWidth: 120,
                              display: "block",
                              objectFit: "contain",
                            }}
                          />
                        </EuiFlexItem>
                        {headerVendorBadge.label != null && headerVendorBadge.label !== "" && (
                          <EuiFlexItem grow={false}>
                            <EuiBadge color="hollow">{headerVendorBadge.label}</EuiBadge>
                          </EuiFlexItem>
                        )}
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiHeaderSectionItem>,
            ],
          },
          {
            items: [
              <EuiHeaderSectionItem key="badges">
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">
                      {totalSelected}/{totalServices} services
                    </EuiBadge>
                  </EuiFlexItem>
                  {statusBadge && <EuiFlexItem grow={false}>{statusBadge}</EuiFlexItem>}
                  {scheduleActive && (
                    <EuiFlexItem grow={false}>
                      <EuiBadge color="accent" title="Scheduled shipping: runs finished vs total">
                        {scheduleRunsCompleted}/{scheduleTotalRuns} done ·{" "}
                        {Math.max(0, scheduleTotalRuns - scheduleRunsCompleted)} left
                      </EuiBadge>
                    </EuiFlexItem>
                  )}
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">v{packageJson.version}</EuiBadge>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiHeaderSectionItem>,
            ],
          },
        ]}
      />

      {/* ── Main content area with sidebar ──────────────────────────── */}
      <EuiPageTemplate restrictWidth={false} grow style={{ paddingTop: 48 }}>
        <EuiPageTemplate.Sidebar sticky={{ offset: 48 }} minWidth={200}>
          <EuiSpacer size="m" />
          <EuiSideNav items={sideNavItems} />
        </EuiPageTemplate.Sidebar>

        <EuiPageTemplate.Section>
          {/* Wizard stepper */}
          <EuiStepsHorizontal steps={stepStatuses} />
          <EuiSpacer size="m" />
          {children}
          {footer}
        </EuiPageTemplate.Section>
      </EuiPageTemplate>
    </div>
  );
}
