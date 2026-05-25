import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type {
  AssistantCitation,
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantRouteContext,
} from '@ship/shared';
import { getAssistantStatus, sendAssistantMessage } from '@/services/assistant';

export interface AssistantTranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  citations?: AssistantCitation[];
  response?: AssistantChatResponse;
}

export function useAssistant(context?: AssistantRouteContext) {
  const [messages, setMessages] = useState<AssistantTranscriptMessage[]>([]);

  const statusQuery = useQuery({
    queryKey: ['assistant', 'status'],
    queryFn: getAssistantStatus,
    staleTime: 60_000,
  });

  const chatMutation = useMutation({
    mutationFn: sendAssistantMessage,
    onSuccess: (response) => {
      setMessages((current) => [
        ...current,
        {
          id: response.message.id,
          role: 'assistant',
          content: response.message.content,
          createdAt: response.message.createdAt,
          citations: response.citations,
          response,
        },
      ]);
    },
  });

  const send = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || chatMutation.isPending) return;

    const userMessage: AssistantTranscriptMessage = {
      id: `client-${Date.now()}`,
      role: 'user',
      content: trimmed,
      createdAt: new Date().toISOString(),
    };

    const history: AssistantChatRequest['history'] = messages
      .slice(-6)
      .map((item) => ({
        role: item.role,
        content: item.content,
      }));

    setMessages((current) => [...current, userMessage]);
    chatMutation.mutate({
      message: trimmed,
      history,
      context,
    });
  };

  return {
    status: statusQuery.data,
    statusLoading: statusQuery.isLoading,
    statusError: statusQuery.error,
    messages,
    send,
    sending: chatMutation.isPending,
    sendError: chatMutation.error,
    reset: () => setMessages([]),
  };
}
