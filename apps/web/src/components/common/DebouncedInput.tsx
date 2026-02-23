'use client';

import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react';

interface DebouncedInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onDebouncedChange: (value: string) => void;
  debounceMs?: number;
}

export function DebouncedInput({
  value,
  onChange,
  onDebouncedChange,
  debounceMs = 300,
  ...inputProps
}: DebouncedInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync external value changes (e.g. parent reset)
  useEffect(() => { setLocalValue(value); }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setLocalValue(next);
    onChange(next);

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onDebouncedChange(next), debounceMs);
  };

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  return <input {...inputProps} value={localValue} onChange={handleChange} />;
}
