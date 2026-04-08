import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { EuiProvider } from "@elastic/eui";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { UnifiedApp } from "./UnifiedApp";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EuiProvider colorMode="light">
      <ErrorBoundary>
        <UnifiedApp />
      </ErrorBoundary>
    </EuiProvider>
  </StrictMode>
);
