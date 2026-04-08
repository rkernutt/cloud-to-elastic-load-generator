import {
  EuiPanel,
  EuiTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiButton,
  EuiBadge,
  EuiSpacer,
  EuiAccordion,
  EuiCheckableCard,
  EuiText,
} from "@elastic/eui";
import { ServiceGrid } from "../components/ServiceGrid";
import { useMemo } from "react";
import type { ServiceGroup } from "../data/serviceGroups";
import type { TraceServiceMeta, ServiceIconMode } from "../cloud/types";

interface ServicesPageProps {
  isTracesMode: boolean;
  eventType: string;
  selectedServices: string[];
  selectedTraceServices: string[];
  onSelectedServicesChange: (services: string[]) => void;
  onSelectedTraceServicesChange: (services: string[]) => void;
  totalSelected: number;
  totalServices: number;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (gid: string) => void;
  ingestionSource: string;
  serviceGroups: ServiceGroup[];
  traceServices: TraceServiceMeta[];
  ingestionMeta: Record<string, { label: string; color: string; inputType?: string }>;
  metricsSupportedServiceIds: Set<string>;
  serviceIcons: ServiceIconMode;
  selectAll: () => void;
  selectNone: () => void;
  toggleService: (id: string) => void;
  toggleGroupSelection: (gid: string) => void;
  getEffectiveSource: (id: string) => string;
}

export function ServicesPage({
  isTracesMode,
  eventType,
  selectedServices,
  selectedTraceServices,
  onSelectedServicesChange: _onSelectedServicesChange,
  onSelectedTraceServicesChange,
  totalSelected,
  totalServices,
  collapsedGroups,
  onToggleGroup,
  ingestionSource,
  serviceGroups,
  traceServices,
  ingestionMeta,
  metricsSupportedServiceIds,
  serviceIcons,
  selectAll,
  selectNone,
  toggleService,
  toggleGroupSelection,
  getEffectiveSource,
}: ServicesPageProps) {
  const traceServiceGroups = useMemo(() => {
    const order = [
      "Single-Service",
      "Multi-Service Workflow",
      "Data Pipeline",
      "Serverless",
      "Containers",
      "Database",
      "Messaging",
      "Analytics",
      "AI/ML",
      "Workflows",
      "Scenarios",
    ];
    const m = new Map<string, TraceServiceMeta[]>();
    for (const s of traceServices) {
      const g = s.group;
      const list = m.get(g) ?? [];
      list.push(s);
      m.set(g, list);
    }
    const tail = [...m.keys()].filter((g) => !order.includes(g));
    return [...order.filter((g) => m.has(g)), ...tail].map((title) => ({
      title,
      items: m.get(title)!,
    }));
  }, [traceServices]);

  const toggleTraceService = (id: string) => {
    const next = selectedTraceServices.includes(id)
      ? selectedTraceServices.filter((s) => s !== id)
      : [...selectedTraceServices, id];
    onSelectedTraceServicesChange(next);
  };

  const selectAllTraces = () => {
    onSelectedTraceServicesChange(traceServices.map((s) => s.id));
  };

  const selectNoTraces = () => {
    onSelectedTraceServicesChange([]);
  };

  if (isTracesMode) {
    return (
      <>
        <EuiTitle size="s">
          <h2>Trace Services</h2>
        </EuiTitle>
        <EuiSpacer size="m" />

        <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={selectAllTraces}>
              All
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton size="s" onClick={selectNoTraces}>
              None
            </EuiButton>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiBadge color="hollow">{selectedTraceServices.length} selected</EuiBadge>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="m" />

        {traceServiceGroups.map((group) => (
          <div key={group.title} style={{ marginBottom: 12 }}>
            <EuiAccordion
              id={`trace-group-${group.title}`}
              buttonContent={
                <EuiText size="s">
                  <strong>{group.title}</strong>{" "}
                  <EuiBadge color="hollow">{group.items.length}</EuiBadge>
                </EuiText>
              }
              initialIsOpen
              paddingSize="s"
            >
              <EuiFlexGroup gutterSize="s" wrap responsive={false}>
                {group.items.map((svc) => {
                  const checked = selectedTraceServices.includes(svc.id);
                  return (
                    <EuiFlexItem key={svc.id} grow={false} style={{ minWidth: 220, maxWidth: 300 }}>
                      <EuiCheckableCard
                        id={`trace-svc-${svc.id}`}
                        label={
                          <>
                            <strong>{svc.label}</strong>
                            <br />
                            <EuiText size="xs" color="subdued">
                              {svc.desc}
                            </EuiText>
                          </>
                        }
                        checked={checked}
                        onChange={() => toggleTraceService(svc.id)}
                      />
                    </EuiFlexItem>
                  );
                })}
              </EuiFlexGroup>
            </EuiAccordion>
          </div>
        ))}
      </>
    );
  }

  return (
    <>
      <EuiTitle size="s">
        <h2>Services</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiPanel>
        <ServiceGrid
          eventType={eventType}
          selectedServices={selectedServices}
          totalServices={totalServices}
          totalSelected={totalSelected}
          collapsedGroups={collapsedGroups}
          ingestionSource={ingestionSource}
          serviceGroups={serviceGroups}
          ingestionMeta={ingestionMeta}
          metricsSupportedServiceIds={metricsSupportedServiceIds}
          serviceIcons={serviceIcons}
          selectAll={selectAll}
          selectNone={selectNone}
          toggleService={toggleService}
          toggleGroup={toggleGroupSelection}
          toggleCollapse={onToggleGroup}
          getEffectiveSource={getEffectiveSource}
        />
      </EuiPanel>
    </>
  );
}
