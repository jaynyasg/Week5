import type { AssistantCitation } from '@ship/shared';

interface AssistantCitationsProps {
  citations: AssistantCitation[];
}

export function AssistantCitations({ citations }: AssistantCitationsProps) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {citations.map((citation) => (
        <a
          key={citation.id}
          href={citation.url}
          className="block rounded border border-border bg-background px-3 py-2 text-xs text-muted transition-colors hover:border-accent hover:text-foreground"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate font-medium text-foreground">{citation.title}</span>
            <span className="shrink-0 uppercase">{citation.sourceType}</span>
          </div>
          <p className="mt-1 line-clamp-2">{citation.excerpt}</p>
        </a>
      ))}
    </div>
  );
}
