'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          minHeight: '100vh',
          margin: 0,
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
        <div role="alert">
          <h1 style={{ color: '#d4a84b', fontSize: '1.5rem', marginBottom: '1rem' }}>
            Something went wrong
          </h1>
          <p style={{ color: '#8a8878', maxWidth: '320px', marginBottom: '1.5rem' }}>
            An unexpected error occurred. Try again.
          </p>
          <button
            onClick={reset}
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
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
