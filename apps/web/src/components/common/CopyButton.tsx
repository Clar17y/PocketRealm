'use client';

import { useState, useCallback } from 'react';

interface CopyButtonProps {
  text: string | undefined;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function CopyButton({ text, label = 'Copy Log', disabled, className }: CopyButtonProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = useCallback(async () => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
      setTimeout(() => setCopyState('idle'), 1500);
    } catch {
      setCopyState('error');
      setTimeout(() => setCopyState('idle'), 2000);
    }
  }, [text]);

  const buttonLabel = copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : label;

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      disabled={disabled || !text}
      className={className ?? 'px-2.5 py-1.5 rounded border border-[var(--rpg-border)] text-xs text-[var(--rpg-text-primary)] disabled:opacity-40'}
      title={`Copy formatted log for sharing`}
    >
      {buttonLabel}
    </button>
  );
}
