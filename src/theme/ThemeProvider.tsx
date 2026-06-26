import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { EuiProvider } from "@elastic/eui";
import { themes, type ColorMode, type ThemeTokens } from "./index";
import { ThemeContext, type ThemeContextValue } from "./themeContext";

const STORAGE_KEY = "loadgen:colorMode";

function readStoredMode(): ColorMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    /* ignore private-mode / quota errors */
  }
  return "light";
}

/** camelCase token key → `--brand-kebab-case` CSS variable name. */
function cssVarName(key: string): string {
  return `--brand-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
}

/** Inject the active palette as `:root` CSS variables for plain-CSS contexts. */
function applyCssVariables(tokens: ThemeTokens, mode: ColorMode): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tokens)) {
    const cssValue = typeof value === "number" ? `${value}px` : value;
    root.style.setProperty(cssVarName(key), cssValue);
  }
  root.setAttribute("data-theme", mode);
  // Keep the pre-React body background (set in index.html) in sync so there is
  // no light flash behind EUI surfaces when dark mode is active.
  document.body.style.backgroundColor = tokens.body;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ColorMode>(() => readStoredMode());
  const tokens = themes[mode];

  useLayoutEffect(() => {
    applyCssVariables(tokens, mode);
  }, [tokens, mode]);

  const setMode = useCallback((next: ColorMode) => {
    setModeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore private-mode / quota errors */
    }
  }, []);

  const toggle = useCallback(() => {
    setModeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, tokens, setMode, toggle }),
    [mode, tokens, setMode, toggle]
  );

  return (
    <ThemeContext.Provider value={value}>
      <EuiProvider colorMode={mode === "dark" ? "DARK" : "LIGHT"}>{children}</EuiProvider>
    </ThemeContext.Provider>
  );
}
