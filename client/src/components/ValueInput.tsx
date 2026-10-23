import { useEffect, useState } from 'react';

// Text input that shows a formatted value and commits a parsed one on blur / Enter.
// Invalid input is reverted instead of being saved.
export function ValueInput({
  value,
  format,
  parse,
  onCommit,
  label,
  inputMode = 'decimal',
  className = 'cell-input',
  disabled = false,
}: {
  value: number | undefined;
  format: (v: number | undefined) => string;
  parse: (s: string) => number | null;
  onCommit: (v: number) => void;
  label: string;
  inputMode?: 'decimal' | 'numeric' | 'text';
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(format(value));
  useEffect(() => setText(format(value)), [value, format]);

  const commit = () => {
    const parsed = parse(text);
    if (parsed === null) setText(format(value));
    else if (parsed !== value) onCommit(parsed);
  };

  return (
    <input
      className={className}
      aria-label={label}
      inputMode={inputMode}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}
