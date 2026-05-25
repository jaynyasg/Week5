import { FormEvent, useState } from 'react';

interface FleetGraphComposerProps {
  disabled: boolean;
  maxLength?: number;
  findingId?: string;
  onSend: (message: string, findingId?: string) => void;
}

export function FleetGraphComposer({ disabled, maxLength = 4000, findingId, onSend }: FleetGraphComposerProps) {
  const [value, setValue] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed, findingId);
    setValue('');
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-3">
      <div className="flex items-end gap-2 rounded-lg border border-border bg-background p-2 focus-within:border-accent">
        <textarea
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={disabled}
          maxLength={maxLength}
          rows={2}
          className="max-h-36 min-h-12 flex-1 resize-none bg-transparent px-1 py-1 text-sm text-foreground outline-none placeholder:text-muted disabled:cursor-not-allowed"
          placeholder="Ask FleetGraph..."
          aria-label="FleetGraph message"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:bg-border disabled:text-muted"
          aria-label="Send FleetGraph message"
        >
          <SendIcon />
        </button>
      </div>
    </form>
  );
}

function SendIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14m0 0l-5-5m5 5l-5 5" />
    </svg>
  );
}
