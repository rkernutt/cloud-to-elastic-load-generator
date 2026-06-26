import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "./theme/ThemeProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UnifiedApp } from "./UnifiedApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <UnifiedApp />
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>
);
