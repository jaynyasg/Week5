import { getAssistantModel, getAssistantProvider } from './config.js';

export interface AssistantLlmInput {
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  citationIds: string[];
}

export class AssistantProviderError extends Error {
  constructor(message = 'Assistant provider request failed') {
    super(message);
    this.name = 'AssistantProviderError';
  }
}

export async function generateAssistantAnswer(input: AssistantLlmInput): Promise<string> {
  const provider = getAssistantProvider();

  if (provider === 'mock') {
    return mockAnswer(input.citationIds);
  }

  if (provider !== 'openai') {
    throw new AssistantProviderError('Unsupported assistant provider');
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new AssistantProviderError('OpenAI API key is not configured');
  }

  const response = await fetch(`${process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: getAssistantModel() ?? 'gpt-4o-mini',
      messages: input.messages,
      temperature: 0.2,
      max_tokens: 700,
    }),
  });

  if (!response.ok) {
    throw new AssistantProviderError();
  }

  const body = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new AssistantProviderError('Assistant provider returned an empty response');
  }

  return content;
}

function mockAnswer(citationIds: string[]): string {
  if (citationIds.length === 0) {
    return 'I could not find enough Ship context to answer that.';
  }

  const primary = citationIds[0];
  const secondary = citationIds[1];
  return secondary
    ? `Based on the available Ship context, the most relevant evidence is in [${primary}] and [${secondary}].`
    : `Based on the available Ship context, the most relevant evidence is in [${primary}].`;
}
