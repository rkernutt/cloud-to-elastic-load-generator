// Kibana / EUI design tokens (Elastic UI Framework), aligned to the official
// Elastic brand palette. Two palettes are exported — `lightTheme` and
// `darkTheme` — selected at runtime by the ThemeProvider. Consume the active
// palette via `useTheme()` (so colors adapt to dark mode); the CSS variables
// injected by the provider (`var(--brand-*)`) are also available for plain CSS.

export type ColorMode = "light" | "dark";

export interface ThemeTokens {
  primary: string;
  primaryText: string;
  body: string;
  plain: string;
  subdued: string;
  border: string;
  borderPlain: string;
  text: string;
  textHeading: string;
  textSubdued: string;
  textMuted: string;
  success: string;
  successBg: string;
  successBorder: string;
  warning: string;
  warningBg: string;
  warningBorder: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  accent: string;
  accentSecondary: string;
  highlight: string;
  controlBg: string;
  controlDisabled: string;
  radius: number;
  radiusSm: number;
  shadow: string;
  shadowMd: string;
  headerBg: string;
  headerText: string;
  headerSubdued: string;
}

export const lightTheme: ThemeTokens = {
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
  // Elastic brand accents (official palette): Pink + Light Teal.
  accent: "#F04E98",
  accentSecondary: "#48EFCF",
  highlight: "#E8F1FF",
  controlBg: "#FFFFFF",
  controlDisabled: "#ECF1F9",
  radius: 6,
  radiusSm: 4,
  shadow: "0 1px 2px rgba(7,16,31,0.06)",
  shadowMd: "0 2px 4px rgba(7,16,31,0.08)",
  // Brand web-navigation color: Developer Blue. The animated pipeline mark and
  // AWS/GCP/Azure logos read clearly against it, and white headerText stays
  // high-contrast.
  headerBg: "#101C3F",
  headerText: "#FFFFFF",
  headerSubdued: "rgba(255,255,255,0.72)",
};

export const darkTheme: ThemeTokens = {
  primary: "#5BA4F5",
  primaryText: "#7DB8F7",
  body: "#16171C",
  plain: "#1D1E24",
  subdued: "#25262E",
  border: "#343741",
  borderPlain: "#404252",
  text: "#DFE5EF",
  textHeading: "#FFFFFF",
  textSubdued: "#98A2B3",
  textMuted: "#8B95A7",
  success: "#34D399",
  successBg: "#102A22",
  successBorder: "#1F5B45",
  warning: "#FEC514",
  warningBg: "#2E2606",
  warningBorder: "#6B5410",
  danger: "#F66B6B",
  dangerBg: "#2E1416",
  dangerBorder: "#6B2A2E",
  accent: "#F77FB6",
  accentSecondary: "#48EFCF",
  highlight: "#16263F",
  controlBg: "#1D1E24",
  controlDisabled: "#2A2B33",
  radius: 6,
  radiusSm: 4,
  shadow: "0 1px 2px rgba(0,0,0,0.45)",
  shadowMd: "0 2px 6px rgba(0,0,0,0.5)",
  // Header keeps Developer Blue in both modes (it is always a dark surface).
  headerBg: "#101C3F",
  headerText: "#FFFFFF",
  headerSubdued: "rgba(255,255,255,0.72)",
};

export const themes: Record<ColorMode, ThemeTokens> = {
  light: lightTheme,
  dark: darkTheme,
};

// Default export = light palette, retained as a safe fallback for any
// non-component access. Components should prefer `useTheme()` for dark-mode
// awareness.
const K = lightTheme;
export default K;
