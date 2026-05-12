"use client";

import * as React from "react";
import { AlertTriangleIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError && this.props.fallback) {
      return this.props.fallback;
    }
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-destructive/30 bg-destructive/5 p-12 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangleIcon className="size-5 text-destructive" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold">Something went wrong</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              This section encountered an error. Your data is safe — try refreshing.
            </p>
          </div>
          <Button
            onClick={() => this.setState({ hasError: false })}
            variant="outline"
            size="sm"
            className="gap-2"
          >
            <RefreshCwIcon className="size-3.5" />
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
