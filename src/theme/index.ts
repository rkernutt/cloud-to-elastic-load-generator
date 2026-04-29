// Kibana / EUI design tokens (Elastic UI Framework)
const K = {
  primary: "#0B64DD",
  primaryText: "#1750BA",
  body: "#F6F9FC",
  plain: "#FFFFFF",
  subdued: "#F6F9FC",
  border: "#E3E8F2",
  borderPlain: "#CAD3E2",
  text: "#1D2A3E",
  textHeading: "#111C2C",
  textSubdued: "#516381",
  textMuted: "#516381",
  success: "#008A5E",
  successBg: "#E2F8F0",
  successBorder: "#AEE8D2",
  warning: "#966B03",
  warningBg: "#FDF3D8",
  warningBorder: "#FCD883",
  danger: "#C61E25",
  dangerBg: "#FFE8E5",
  dangerBorder: "#FFC9C2",
  accent: "#BC1E70",
  accentSecondary: "#008B87",
  highlight: "#E8F1FF",
  controlBg: "#FFFFFF",
  controlDisabled: "#ECF1F9",
  radius: 6,
  radiusSm: 4,
  shadow: "0 1px 2px rgba(7,16,31,0.06)",
  shadowMd: "0 2px 4px rgba(7,16,31,0.08)",
  // Header bar: mid-slate so the animated pipeline mark and AWS/GCP/Azure
  // logos read clearly. Distinctly lighter than EUI's default dark header
  // (#1D1E24) but still dark enough that white headerText stays high-contrast.
  headerBg: "#3A3D4A",
  headerText: "#FFFFFF",
  headerSubdued: "rgba(255,255,255,0.72)",
} as const;

export default K;
