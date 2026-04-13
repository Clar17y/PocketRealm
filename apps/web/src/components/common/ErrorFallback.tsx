import type { CSSProperties } from 'react';

interface ErrorFallbackProps {
  message: string;
  actionLabel: string;
  onAction: () => void;
}

const containerStyle: CSSProperties = {
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
};

const titleStyle: CSSProperties = {
  color: '#d4a84b',
  fontSize: '1.5rem',
  marginBottom: '1rem',
};

const messageStyle: CSSProperties = {
  color: '#8a8878',
  maxWidth: '320px',
  marginBottom: '1.5rem',
};

const buttonStyle: CSSProperties = {
  padding: '0.5rem 1.5rem',
  backgroundColor: '#1e1c18',
  border: '1px solid #3a3830',
  borderRadius: '0.5rem',
  color: '#d4a84b',
  cursor: 'pointer',
  fontSize: '1rem',
};

export function ErrorFallback({ message, actionLabel, onAction }: ErrorFallbackProps) {
  return (
    <div role="alert" style={containerStyle}>
      <h1 style={titleStyle}>Something went wrong</h1>
      <p style={messageStyle}>{message}</p>
      <button onClick={onAction} style={buttonStyle}>
        {actionLabel}
      </button>
    </div>
  );
}
