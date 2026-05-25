import type { AssistantProvider, AssistantStatusResponse } from '@ship/shared';
import { getAssistantEmbeddingConfig } from './embeddings.js';

export const SUPPORTED_INDEX_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const ASSISTANT_LIMITS = {
  maxMessageChars: 4000,
  maxHistoryMessages: 12,
  maxContextChunks: 8,
  maxExtractionBytes: 5 * 1024 * 1024,
  maxPromptContextChars: 16_000,
} as const;

export function getAssistantProvider(): AssistantProvider {
  const provider = process.env.SHIP_ASSISTANT_PROVIDER?.toLowerCase();
  if (provider === 'openai' || provider === 'bedrock' || provider === 'mock') {
    return provider;
  }
  return process.env.OPENAI_API_KEY ? 'openai' : 'unconfigured';
}

export function getAssistantModel(): string | null {
  return process.env.SHIP_ASSISTANT_MODEL || (getAssistantProvider() === 'openai' ? 'gpt-4o-mini' : null);
}

export function getMissingConfiguration(provider: AssistantProvider = getAssistantProvider()): string[] {
  if (process.env.SHIP_ASSISTANT_ENABLED === 'false') {
    return ['SHIP_ASSISTANT_ENABLED'];
  }

  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    return ['OPENAI_API_KEY'];
  }

  if (provider === 'bedrock') {
    return ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
      .filter((key) => !process.env[key]);
  }

  if (provider === 'unconfigured') {
    return ['SHIP_ASSISTANT_PROVIDER', 'OPENAI_API_KEY'];
  }

  return [];
}

export function getAssistantStatus(): AssistantStatusResponse {
  const provider = getAssistantProvider();
  const missingConfiguration = getMissingConfiguration(provider);
  const enabled = process.env.SHIP_ASSISTANT_ENABLED !== 'false';

  return {
    enabled,
    available: enabled && missingConfiguration.length === 0 && provider !== 'unconfigured',
    provider,
    model: getAssistantModel(),
    missingConfiguration,
    embeddings: getAssistantEmbeddingConfig(),
    observability: {
      tracesEnabled: process.env.SHIP_ASSISTANT_TRACING_ENABLED !== 'false',
    },
    uploadIndexing: {
      enabled: process.env.SHIP_ASSISTANT_UPLOAD_INDEXING !== 'false',
      supportedMimeTypes: SUPPORTED_INDEX_MIME_TYPES,
      maxExtractionBytes: ASSISTANT_LIMITS.maxExtractionBytes,
      statuses: ['not_indexed', 'indexing', 'indexed', 'unsupported', 'failed'],
    },
    limits: {
      maxMessageChars: ASSISTANT_LIMITS.maxMessageChars,
      maxHistoryMessages: ASSISTANT_LIMITS.maxHistoryMessages,
      maxContextChunks: ASSISTANT_LIMITS.maxContextChunks,
    },
  };
}
