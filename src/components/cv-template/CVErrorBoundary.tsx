import React from "react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class CVErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("CV Creator Rendering-Fehler:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 border border-destructive/30 rounded-lg bg-destructive/5 text-center space-y-2">
          <p className="text-sm font-medium text-destructive">
            CV-Vorschau konnte nicht geladen werden.
          </p>
          <p className="text-xs text-muted-foreground">
            Fehler: {this.state.error?.message || "Unbekannter Fehler"}
          </p>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Erneut versuchen
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
