import type { AssistantTranscriptMessage } from '@/hooks/useAssistant';
import { cn } from '@/lib/cn';
import { AssistantCitations } from './AssistantCitations';

interface AssistantMessagesProps {
  messages: AssistantTranscriptMessage[];
  sending: boolean;
}

export function AssistantMessages({ messages, sending }: AssistantMessagesProps) {
  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <div
          key={message.id}
          className={cn(
            'max-w-[88%] rounded-lg px-3 py-2 text-sm leading-6',
            message.role === 'user'
              ? 'ml-auto bg-accent text-white'
              : 'mr-auto border border-border bg-card text-foreground',
          )}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
          {message.citations && <AssistantCitations citations={message.citations} />}
        </div>
      ))}
      {sending && (
        <div className="mr-auto rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted">
          Thinking...
        </div>
      )}
    </div>
  );
}
