import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantStatusResponse,
} from '@ship/shared';
import { apiGet, apiPost } from '@/lib/api';

export async function getAssistantStatus(): Promise<AssistantStatusResponse> {
  const response = await apiGet('/api/assistant/status');
  if (!response.ok) {
    throw new Error('Failed to load Ask Ship status');
  }
  return response.json();
}

export async function sendAssistantMessage(
  request: AssistantChatRequest,
): Promise<AssistantChatResponse> {
  const response = await apiPost('/api/assistant/chat', request);
  const data = await response.json();

  if (!response.ok && !data?.status) {
    throw new Error('Ask Ship request failed');
  }

  return data;
}
