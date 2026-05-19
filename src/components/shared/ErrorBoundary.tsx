import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: unknown): State {
    const message =
      error instanceof Error ? error.message : "An unexpected error occurred.";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[HubLead] Render error caught by boundary:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "16px",
            color: "#e53e3e",
            fontSize: "13px",
            border: "1px solid #feb2b2",
            borderRadius: "6px",
            background: "#fff5f5",
            margin: "8px",
          }}
        >
          <strong>Something went wrong.</strong> {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}
