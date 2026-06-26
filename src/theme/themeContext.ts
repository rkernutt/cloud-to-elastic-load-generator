import { createContext, useContext } from "react";
import { lightTheme, type ColorMode, type ThemeTokens } from "./index";

export interface ThemeContextValue {
  mode: ColorMode;
  tokens: ThemeTokens;
  setMode: (mode: ColorMode) => void;
  toggle: () => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  mode: "light",
  tokens: lightTheme,
  setMode: () => {},
  toggle: () => {},
});

/** Active brand palette (hex values), adapting to the current color mode. */
export function useTheme(): ThemeTokens {
  return useContext(ThemeContext).tokens;
}

/** Current color mode plus setters for building a light/dark toggle. */
export function useColorMode(): Omit<ThemeContextValue, "tokens"> {
  const { mode, setMode, toggle } = useContext(ThemeContext);
  return { mode, setMode, toggle };
}
