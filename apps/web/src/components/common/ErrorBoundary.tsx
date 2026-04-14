'use client';

import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';
import { ErrorFallback } from './ErrorFallback';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    Sentry.captureException(error, {
      extra: {
        componentStack: info.componentStack,
      },
    });
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          message="An unexpected error occurred. Try reloading the page."
          actionLabel="Reload"
          onAction={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
