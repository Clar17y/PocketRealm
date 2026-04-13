'use client';

import { Component, type ReactNode } from 'react';
import * as Sentry from '@sentry/nextjs';

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
        <div
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0c0a08',
            color: '#e8e8e0',
            fontFamily: 'serif',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <h1 style={{ color: '#d4a84b', fontSize: '1.5rem', marginBottom: '1rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#8a8878', maxWidth: '320px', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Try reloading the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '0.5rem 1.5rem',
              backgroundColor: '#1e1c18',
              border: '1px solid #3a3830',
              borderRadius: '0.5rem',
              color: '#d4a84b',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
