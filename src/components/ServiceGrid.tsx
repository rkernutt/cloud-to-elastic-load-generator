import { memo } from "react";
import K from "../theme";
import type { ServiceGroup } from "../data/serviceGroups";
import { serviceIdsInGroup } from "../data/serviceGroups";
import type { ServiceIconMode } from "../cloud/types";
import { SimpleBrandIcon } from "./SimpleBrandIcon";
import { Card, QuickBtn } from "./Card";

interface ServiceGridProps {
  eventType: string;
  selectedServices: string[];
  totalServices: number;
  totalSelected: number;
  collapsedGroups: Record<string, boolean>;
  ingestionSource: string;
  serviceGroups: ServiceGroup[];
  ingestionMeta: Record<string, { label: string; color: string; inputType?: string }>;
  metricsSupportedServiceIds: Set<string>;
  serviceIcons: ServiceIconMode;
  selectAll: () => void;
  selectNone: () => void;
  toggleService: (id: string) => void;
  toggleGroup: (gid: string) => void;
  toggleCollapse: (gid: string) => void;
  getEffectiveSource: (id: string) => string;
}

/** Public URL for a file under `iconBaseUrl`: AWS flat names or encoded `Cloud Icons/...` paths. */
function fileIconUrl(base: string, file: string): string {
  const b = base.replace(/\/$/, "");
  if (file.includes("/")) {
    return `${b}/${file.split("/").map(encodeURIComponent).join("/")}`;
  }
  const name = file.includes(".") ? file : `${file}.svg`;
  return `${b}/${encodeURIComponent(name)}`;
}

const ServiceGrid = memo(function ServiceGrid({
  eventType,
  selectedServices,
  totalServices,
  totalSelected,
  collapsedGroups,
  ingestionSource,
  serviceGroups,
  ingestionMeta,
  metricsSupportedServiceIds,
  serviceIcons,
  selectAll,
  selectNone,
  toggleService,
  toggleGroup,
  toggleCollapse,
  getEffectiveSource,
}: ServiceGridProps) {
  return (
    <Card>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: K.textHeading }}>Select Services</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <QuickBtn onClick={selectAll}>All {totalServices}</QuickBtn>
          <QuickBtn onClick={selectNone}>None</QuickBtn>
          {totalSelected > 0 && (
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
              {totalSelected} selected
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
          Ingestion:
        </span>
        {Object.entries(ingestionMeta).map(([key, m]) => (
          <span
            key={key}
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: m.color,
              background: `${m.color}18`,
              border: `1px solid ${m.color}44`,
              borderRadius: K.radiusSm,
              padding: "2px 7px",
            }}
          >
            {m.label}
          </span>
        ))}
        {ingestionSource !== "default" && (
          <span style={{ fontSize: 9, color: K.warning, marginLeft: 4, alignSelf: "center" }}>
            Override: all using {ingestionMeta[ingestionSource]?.label}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {serviceGroups.map((group) => {
          const groupIds = serviceIdsInGroup(group);
          const selectableInGroup =
            eventType === "metrics"
              ? groupIds.filter((id) => metricsSupportedServiceIds.has(id))
              : groupIds;
          const selCount = selectableInGroup.filter((id) => selectedServices.includes(id)).length;
          const allSel = selectableInGroup.length > 0 && selCount === selectableInGroup.length;
          const someSel = selCount > 0 && !allSel;
          const collapsed = collapsedGroups[group.id];
          return (
            <div
              key={group.id}
              style={{
                border: `1px solid ${allSel ? group.color + "88" : someSel ? group.color + "66" : K.border}`,
                borderRadius: K.radius,
                overflow: "hidden",
                background: allSel ? `${group.color}12` : someSel ? `${group.color}08` : K.plain,
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
                  cursor: "pointer",
                  userSelect: "none",
                }}
                onClick={() => toggleCollapse(group.id)}
              >
                {serviceIcons.mode === "file-icons" ? (
                  serviceIcons.categoryFiles[group.id] ? (
                    <img
                      src={fileIconUrl(serviceIcons.iconBaseUrl, serviceIcons.categoryFiles[group.id])}
                      alt=""
                      style={{ width: 22, height: 22, objectFit: "contain" }}
                    />
                  ) : serviceIcons.serviceFiles[group.services[0]?.id] ? (
                    <img
                      src={fileIconUrl(
                        serviceIcons.iconBaseUrl,
                        serviceIcons.serviceFiles[group.services[0].id]
                      )}
                      alt=""
                      style={{ width: 18, height: 18, objectFit: "contain" }}
                    />
                  ) : (
                    <span
                      style={{
                        fontSize: 14,
                        minWidth: 18,
                        color: selCount > 0 ? group.color : K.textSubdued,
                      }}
                    >
                      {group.icon}
                    </span>
                  )
                ) : (
                  <SimpleBrandIcon icon={serviceIcons.getCategoryIcon(group.id)} size={22} />
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: selCount > 0 ? group.color : "#475569",
                    flex: 1,
                  }}
                >
                  {group.label}
                </span>
                <span style={{ fontSize: 10, color: K.textSubdued }}>
                  {eventType === "metrics"
                    ? `${selectableInGroup.length} metrics`
                    : `${groupIds.length} services`}
                </span>
                {selCount > 0 && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: group.color,
                      background: `${group.color}20`,
                      border: `1px solid ${group.color}44`,
                      borderRadius: 99,
                      padding: "1px 8px",
                    }}
                  >
                    {selCount}/{selectableInGroup.length}
                  </span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleGroup(group.id);
                  }}
                  style={{
                    fontSize: 10,
                    padding: "3px 10px",
                    borderRadius: 6,
                    border: `1px solid ${group.color}44`,
                    background: allSel ? `${group.color}22` : "transparent",
                    color: group.color,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontWeight: 600,
                    transition: "all 0.15s",
                  }}
                >
                  {allSel ? "Deselect all" : "Select all"}
                </button>
                <span style={{ color: "#94a3b8", fontSize: 10, marginLeft: 2 }}>
                  {collapsed ? "▶" : "▼"}
                </span>
              </div>
              {!collapsed && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,1fr)",
                    gap: 6,
                    padding: "0 10px 10px",
                  }}
                >
                  {group.services.map((svc) => {
                    const sel = selectedServices.includes(svc.id);
                    const metricsDisabled =
                      eventType === "metrics" && !metricsSupportedServiceIds.has(svc.id);
                    const src = getEffectiveSource(svc.id);
                    const meta = ingestionMeta[src];
                    return (
                      <button
                        key={svc.id}
                        onClick={() => !metricsDisabled && toggleService(svc.id)}
                        style={{
                          border: `1px solid ${sel ? group.color + "99" : metricsDisabled ? K.border : K.borderPlain}`,
                          borderRadius: K.radiusSm,
                          padding: "8px",
                          background: sel
                            ? `${group.color}18`
                            : metricsDisabled
                              ? K.controlDisabled
                              : K.subdued,
                          cursor: metricsDisabled ? "not-allowed" : "pointer",
                          textAlign: "left",
                          transition: "all 0.15s",
                          position: "relative",
                          overflow: "hidden",
                          opacity: metricsDisabled ? 0.7 : 1,
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
                              background: group.color,
                              borderRadius: "8px 8px 0 0",
                            }}
                          />
                        )}
                        {serviceIcons.mode === "file-icons" ? (
                          serviceIcons.serviceFiles[svc.id] ? (
                            <img
                              src={fileIconUrl(serviceIcons.iconBaseUrl, serviceIcons.serviceFiles[svc.id])}
                              alt=""
                              style={{ width: 28, height: 28, objectFit: "contain" }}
                            />
                          ) : (
                            <div style={{ fontSize: 15, marginBottom: 4 }}>{svc.icon}</div>
                          )
                        ) : (
                          <div style={{ marginBottom: 4 }}>
                            <SimpleBrandIcon icon={serviceIcons.getServiceIcon(svc.id)} size={28} />
                          </div>
                        )}
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: sel ? group.color : metricsDisabled ? "#94a3b8" : "#475569",
                            marginBottom: 2,
                          }}
                        >
                          {svc.label}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: metricsDisabled ? "#94a3b8" : "#64748b",
                            lineHeight: 1.3,
                            marginBottom: 5,
                          }}
                        >
                          {svc.desc}
                        </div>
                        {metricsDisabled ? (
                          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600 }}>
                            No metrics
                          </div>
                        ) : (
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: meta?.color || "#64748b",
                              background: `${meta?.color || "#64748b"}18`,
                              border: `1px solid ${meta?.color || "#64748b"}44`,
                              borderRadius: 4,
                              padding: "1px 5px",
                              display: "inline-block",
                            }}
                          >
                            {meta?.label || src}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
});

export { ServiceGrid };
