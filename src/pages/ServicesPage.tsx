import { EuiPanel, EuiTitle, EuiSpacer, EuiFieldSearch } from "@elastic/eui";
import { ServiceGrid, serviceIconPublicUrl } from "../components/ServiceGrid";
import { Card, QuickBtn } from "../components/Card";
import K from "../theme";
import { SimpleBrandIcon } from "../components/SimpleBrandIcon";
import { useMemo, useState } from "react";
import { serviceIdsInGroup, type ServiceGroup } from "../data/serviceGroups";
import type { TraceServiceMeta, ServiceIconMode } from "../cloud/types";

function findAccentServiceGroup(
  items: TraceServiceMeta[],
  serviceGroups: ServiceGroup[],
  sectionTitle: string
): ServiceGroup {
  for (const it of items) {
    const g = serviceGroups.find((gr) => gr.services.some((s) => s.id === it.id));
    if (g) return g;
  }

  const titleLc = sectionTitle.toLowerCase();
  const words = titleLc
    .replace(/\//g, " ")
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !["service", "services", "multi", "single"].includes(w));
  const byLabel =
    words.length > 0
      ? serviceGroups.find((gr) => {
          const l = gr.label.toLowerCase();
          return words.some((w) => l.includes(w));
        })
      : undefined;
  if (byLabel) return byLabel;

  const explicitPredicates: Array<(g: ServiceGroup) => boolean> = [];
  if (/workflow/i.test(sectionTitle)) {
    explicitPredicates.push(
      (g) =>
        /serverless|integration|devtools|streaming|messaging/i.test(g.id) ||
        /serverless|workflow/i.test(g.label.toLowerCase())
    );
  }
  if (/single-service/i.test(titleLc)) {
    explicitPredicates.push((g) => /compute|storage|containers/i.test(g.id));
  }
  if (/multi-service workflow/i.test(titleLc)) {
    explicitPredicates.push((g) => /serverless|integration|networking|streaming/i.test(g.id));
  }
  if (/data pipeline/i.test(titleLc)) {
    explicitPredicates.push((g) =>
      /analytics|datawarehouse|data-ai|streaming|integration/i.test(g.id)
    );
  }
  if (/scenarios/i.test(titleLc)) {
    explicitPredicates.push((g) => /security|findings|management|identity/i.test(g.id));
  }
  for (const pred of explicitPredicates) {
    const g = serviceGroups.find(pred);
    if (g) return g;
  }

  return serviceGroups[0]!;
}

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
  /** Clears per-group collapse so every category is open */
  onExpandAllGroups?: () => void;
  /** Wizard step heading (default: Services) */
  pageTitle?: string;
  /** Card toolbar label for the grid (default: Select Services) */
  gridHeading?: string;
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
  onExpandAllGroups,
  pageTitle = "Services",
  gridHeading = "Select services",
}: ServicesPageProps) {
  const [searchTerm, setSearchTerm] = useState("");

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

  const filteredTraceServiceGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return traceServiceGroups;
    return traceServiceGroups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (svc) => svc.label.toLowerCase().includes(q) || svc.id.toLowerCase().includes(q)
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [traceServiceGroups, searchTerm]);

  const tracesVisibleTotal = useMemo(() => {
    if (!searchTerm.trim()) return totalServices;
    return filteredTraceServiceGroups.reduce((acc, g) => acc + g.items.length, 0);
  }, [searchTerm, filteredTraceServiceGroups, totalServices]);

  const filteredServiceGroups = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return serviceGroups;
    return serviceGroups
      .map((g) => ({
        ...g,
        services: g.services.filter(
          (svc) => svc.label.toLowerCase().includes(q) || svc.id.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.services.length > 0);
  }, [serviceGroups, searchTerm]);

  const gridTotalServices = useMemo(() => {
    if (!searchTerm.trim()) return totalServices;
    return filteredServiceGroups.reduce((acc, g) => {
      const ids = serviceIdsInGroup(g);
      const selectable =
        eventType === "metrics" ? ids.filter((id) => metricsSupportedServiceIds.has(id)) : ids;
      return acc + selectable.length;
    }, 0);
  }, [searchTerm, filteredServiceGroups, eventType, metricsSupportedServiceIds, totalServices]);

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
    const traceApmColor = K.primary;
    return (
      <>
        <EuiTitle size="s">
          <h2>{pageTitle}</h2>
        </EuiTitle>
        <EuiSpacer size="m" />

        <EuiPanel>
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: K.textHeading }}>
                {gridHeading}
              </span>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <QuickBtn onClick={selectAllTraces}>All {tracesVisibleTotal}</QuickBtn>
                <QuickBtn onClick={selectNoTraces}>None</QuickBtn>
                {selectedTraceServices.length > 0 && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: K.success,
                      background: K.successBg,
                      border: `1px solid ${K.successBorder}`,
                      borderRadius: 99,
                      padding: "2px 10px",
                    }}
                  >
                    {selectedTraceServices.length} selected
                  </span>
                )}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 12,
                padding: "8px 10px",
                background: K.subdued,
                borderRadius: K.radiusSm,
                border: `1px solid ${K.border}`,
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: K.textSubdued,
                  marginRight: 4,
                  alignSelf: "center",
                }}
              >
                Delivery:
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: traceApmColor,
                  background: `${traceApmColor}18`,
                  border: `1px solid ${traceApmColor}44`,
                  borderRadius: K.radiusSm,
                  padding: "2px 7px",
                }}
              >
                OpenTelemetry → APM
              </span>
              <span style={{ fontSize: 9, color: K.textSubdued, alignSelf: "center" }}>
                Data in <code style={{ fontSize: 9 }}>traces-apm*</code>
              </span>
            </div>

            <div style={{ marginBottom: 12 }}>
              <EuiFieldSearch
                placeholder="Filter services…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                isClearable
                fullWidth
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredTraceServiceGroups.map((group) => {
                const accent = findAccentServiceGroup(group.items, serviceGroups, group.title);
                const ids = group.items.map((i) => i.id);
                const selCount = ids.filter((id) => selectedTraceServices.includes(id)).length;
                const allSel = ids.length > 0 && selCount === ids.length;
                const someSel = selCount > 0 && !allSel;
                const setGroupSelection = (select: boolean) => {
                  if (select) {
                    onSelectedTraceServicesChange([...new Set([...selectedTraceServices, ...ids])]);
                  } else {
                    onSelectedTraceServicesChange(
                      selectedTraceServices.filter((s) => !ids.includes(s))
                    );
                  }
                };
                return (
                  <div
                    key={group.title}
                    style={{
                      border: `1px solid ${allSel ? accent.color + "88" : someSel ? accent.color + "66" : K.border}`,
                      borderRadius: K.radius,
                      overflow: "hidden",
                      background: allSel
                        ? `${accent.color}12`
                        : someSel
                          ? `${accent.color}08`
                          : K.plain,
                      transition: "border-color 0.2s",
                      boxShadow: K.shadow,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "10px 14px",
                      }}
                    >
                      {serviceIcons.mode === "file-icons" ? (
                        serviceIcons.categoryFiles[accent.id] ? (
                          <img
                            src={serviceIconPublicUrl(
                              serviceIcons.iconBaseUrl,
                              serviceIcons.categoryFiles[accent.id]
                            )}
                            alt=""
                            style={{ width: 22, height: 22, objectFit: "contain" }}
                          />
                        ) : serviceIcons.serviceFiles[accent.services[0]?.id] ? (
                          <img
                            src={serviceIconPublicUrl(
                              serviceIcons.iconBaseUrl,
                              serviceIcons.serviceFiles[accent.services[0]!.id]
                            )}
                            alt=""
                            style={{ width: 18, height: 18, objectFit: "contain" }}
                          />
                        ) : (
                          <span
                            style={{
                              fontSize: 14,
                              minWidth: 18,
                              color: selCount > 0 ? accent.color : K.textSubdued,
                            }}
                          >
                            {accent.icon}
                          </span>
                        )
                      ) : (
                        <SimpleBrandIcon icon={serviceIcons.getCategoryIcon(accent.id)} size={22} />
                      )}
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: selCount > 0 ? accent.color : "#475569",
                          flex: 1,
                        }}
                      >
                        {group.title}
                      </span>
                      <span style={{ fontSize: 10, color: K.textSubdued }}>
                        {group.items.length} scenarios
                      </span>
                      {selCount > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: accent.color,
                            background: `${accent.color}20`,
                            border: `1px solid ${accent.color}44`,
                            borderRadius: 99,
                            padding: "1px 8px",
                          }}
                        >
                          {selCount}/{ids.length}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setGroupSelection(!allSel)}
                        style={{
                          fontSize: 10,
                          padding: "3px 10px",
                          borderRadius: 6,
                          border: `1px solid ${accent.color}44`,
                          background: allSel ? `${accent.color}22` : "transparent",
                          color: accent.color,
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontWeight: 600,
                          transition: "all 0.15s",
                        }}
                      >
                        {allSel ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                        gap: 6,
                        padding: "0 10px 10px",
                      }}
                    >
                      {group.items.map((svc) => {
                        const sel = selectedTraceServices.includes(svc.id);
                        return (
                          <button
                            type="button"
                            key={svc.id}
                            onClick={() => toggleTraceService(svc.id)}
                            style={{
                              border: `1px solid ${sel ? accent.color + "99" : K.borderPlain}`,
                              borderRadius: K.radiusSm,
                              padding: "8px",
                              background: sel ? `${accent.color}18` : K.subdued,
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 0.15s",
                              position: "relative",
                              overflow: "hidden",
                            }}
                          >
                            {sel && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  height: 2,
                                  background: accent.color,
                                  borderRadius: "8px 8px 0 0",
                                }}
                              />
                            )}
                            {serviceIcons.mode === "file-icons" ? (
                              serviceIcons.serviceFiles[svc.id] ? (
                                <img
                                  src={serviceIconPublicUrl(
                                    serviceIcons.iconBaseUrl,
                                    serviceIcons.serviceFiles[svc.id]
                                  )}
                                  alt=""
                                  style={{ width: 28, height: 28, objectFit: "contain" }}
                                />
                              ) : (
                                <div style={{ fontSize: 15, marginBottom: 4 }}>{svc.icon}</div>
                              )
                            ) : (
                              <div style={{ marginBottom: 4 }}>
                                <SimpleBrandIcon
                                  icon={serviceIcons.getServiceIcon(svc.id)}
                                  size={28}
                                />
                              </div>
                            )}
                            <div
                              style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: sel ? accent.color : "#475569",
                                marginBottom: 2,
                              }}
                            >
                              {svc.label}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                color: "#64748b",
                                lineHeight: 1.3,
                                marginBottom: 5,
                              }}
                            >
                              {svc.desc}
                            </div>
                            <div
                              style={{
                                fontSize: 10,
                                fontWeight: 600,
                                color: traceApmColor,
                                background: `${traceApmColor}18`,
                                border: `1px solid ${traceApmColor}44`,
                                borderRadius: 4,
                                padding: "1px 5px",
                                display: "inline-block",
                              }}
                            >
                              Traces
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </EuiPanel>
      </>
    );
  }

  return (
    <>
      <EuiTitle size="s">
        <h2>{pageTitle}</h2>
      </EuiTitle>
      <EuiSpacer size="m" />

      <EuiPanel>
        <div style={{ marginBottom: 12 }}>
          <EuiFieldSearch
            placeholder="Filter services…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            isClearable
            fullWidth
          />
        </div>
        <ServiceGrid
          eventType={eventType}
          selectedServices={selectedServices}
          totalServices={gridTotalServices}
          totalSelected={totalSelected}
          collapsedGroups={collapsedGroups}
          ingestionSource={ingestionSource}
          serviceGroups={filteredServiceGroups}
          ingestionMeta={ingestionMeta}
          metricsSupportedServiceIds={metricsSupportedServiceIds}
          serviceIcons={serviceIcons}
          gridHeading={gridHeading}
          selectAll={selectAll}
          selectNone={selectNone}
          toggleService={toggleService}
          toggleGroup={toggleGroupSelection}
          toggleCollapse={onToggleGroup}
          getEffectiveSource={getEffectiveSource}
          expandAllGroups={onExpandAllGroups}
        />
      </EuiPanel>
    </>
  );
}
