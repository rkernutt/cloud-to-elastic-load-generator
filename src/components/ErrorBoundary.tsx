import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: (error: unknown) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary to catch rendering errors and display a fallback UI.
 * Prevents the whole app from unmounting on component tree errors.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error);
      }
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
            background: "#F6F9FC",
            color: "#1D1E24",
          }}
        >
          <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h1>
          <p
            style={{
              fontSize: 14,
              color: "#64748b",
              marginBottom: 16,
              maxWidth: 480,
              textAlign: "center",
            }}
          >
            The application encountered an error. You can try refreshing the page.
          </p>
          <pre
            style={{
              fontSize: 12,
              background: "#E3E8F2",
              padding: 12,
              borderRadius: 8,
              overflow: "auto",
              maxWidth: "100%",
              maxHeight: 200,
              textAlign: "left",
              border: "1px solid #CAD3E2",
            }}
          >
            {this.state.error?.message ?? String(this.state.error)}
          </pre>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 16,
              padding: "10px 20px",
              borderRadius: 6,
              border: "none",
              background: "#0B64DD",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
