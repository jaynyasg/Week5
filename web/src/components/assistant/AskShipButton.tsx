import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';

interface AskShipButtonProps {
  active: boolean;
  onClick: () => void;
}

export function AskShipButton({ active, onClick }: AskShipButtonProps) {
  return (
    <Tooltip content="Ask Ship" side="right">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-border/50 hover:text-foreground',
        )}
        aria-label="Ask Ship"
        aria-pressed={active}
      >
        <AskShipIcon />
      </button>
    </Tooltip>
  );
}

function AskShipIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h8M8 14h5" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 4h14a2 2 0 012 2v9a2 2 0 01-2 2h-6l-4 3v-3H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.5 3.5l.5-1 .5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5z" />
    </svg>
  );
}
