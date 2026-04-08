import type { CSSProperties, ReactNode } from "react";
import K from "../theme";

export function Card({ children, style = {} }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        background: K.plain,
        border: `1px solid ${K.border}`,
        borderRadius: K.radius,
        padding: 16,
        boxShadow: K.shadow,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  label,
  badge,
  badgeColor,
  children,
}: {
  label: ReactNode;
  badge?: ReactNode;
  badgeColor?: string;
  children?: ReactNode;
}) {
  const bc = badgeColor || K.primary;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 12,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 600, color: K.textHeading }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {children}
        {badge && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: bc,
              background: `${bc}18`,
              border: `1px solid ${bc}44`,
              borderRadius: 99,
              padding: "2px 8px",
            }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

export function QuickBtn({ children, onClick }: { children?: ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: K.radiusSm,
        border: `1px solid ${K.borderPlain}`,
        background: K.subdued,
        color: K.textSubdued,
        cursor: "pointer",
        fontFamily: "inherit",
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: ReactNode; children?: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: K.textSubdued, marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
  sublabel,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  display: ReactNode;
  sublabel?: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: K.textSubdued }}>{label}</span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: K.primaryText,
            background: K.highlight,
            border: `1px solid ${K.border}`,
            borderRadius: K.radiusSm,
            padding: "2px 8px",
          }}
        >
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: K.primary, cursor: "pointer" }}
      />
      {sublabel && (
        <div style={{ fontSize: 11, color: K.textSubdued, marginTop: 4 }}>{sublabel}</div>
      )}
    </div>
  );
}

export function StatCard({
  label,
  value,
  color,
}: {
  label: ReactNode;
  value: ReactNode;
  color: string;
}) {
  return (
    <div
      style={{
        background: K.subdued,
        border: `1px solid ${K.border}`,
        borderRadius: K.radiusSm,
        padding: "10px 12px",
      }}
    >
      <div style={{ fontSize: 11, color: K.textSubdued, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}
