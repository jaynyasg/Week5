import { Tooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';

interface AskShipButtonProps {
  active: boolean;
  badgeCount?: number;
  onClick: () => void;
}

export function AskShipButton({ active, badgeCount = 0, onClick }: AskShipButtonProps) {
  const label = badgeCount > 0 ? `Ask Ship, ${badgeCount} FleetGraph findings` : 'Ask Ship';
  return (
    <Tooltip content="Ask Ship" side="right">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
          active ? 'bg-accent/20 text-accent' : 'text-muted hover:bg-border/50 hover:text-foreground',
        )}
        aria-label={label}
        aria-pressed={active}
      >
        <AskShipIcon />
        {badgeCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        ) : null}
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
