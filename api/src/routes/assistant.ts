import { randomUUID } from 'crypto';
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { ensureAssistantUploadSchema } from '../db/assistant-upload-schema.js';
import { getAssistantStatus, ASSISTANT_LIMITS } from '../services/assistant/config.js';
import { answerAssistantQuestion } from '../services/assistant/chat.js';
import { getAssistantTrace } from '../services/assistant/tracing.js';
import type {
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantErrorCode,
  AssistantSourceCounts,
} from '@ship/shared';

type RouterType = ReturnType<typeof Router>;
const router: RouterType = Router();

function emptySourceCounts(): AssistantSourceCounts {
  return {
    documents: 0,
    projects: 0,
    programs: 0,
    issues: 0,
    weeks: 0,
    timeline: 0,
    files: 0,
    total: 0,
  };
}

function assistantResponse(
  status: AssistantChatResponse['status'],
  content: string,
  error?: { code: AssistantErrorCode; message: string },
): AssistantChatResponse {
  return {
    status,
    message: {
      id: randomUUID(),
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
    },
    citations: [],
    sourceCounts: emptySourceCounts(),
    error,
  };
}

router.get('/status', authMiddleware, async (_req: Request, res: Response) => {
  await ensureAssistantUploadSchema();
  res.json(getAssistantStatus());
});

router.get('/traces/:traceId', authMiddleware, async (req: Request, res: Response) => {
  await ensureAssistantUploadSchema();
  const traceId = req.params.traceId;
  if (typeof traceId !== 'string') {
    res.status(404).json({
      error: {
        code: 'TRACE_NOT_FOUND',
        message: 'Assistant trace not found',
      },
    });
    return;
  }

  const trace = await getAssistantTrace({
    traceId,
    workspaceId: req.workspaceId!,
    userId: req.userId!,
    canInspectWorkspaceTraces: req.isSuperAdmin || req.workspaceRole === 'admin',
  });

  if (!trace) {
    res.status(404).json({
      error: {
        code: 'TRACE_NOT_FOUND',
        message: 'Assistant trace not found',
      },
    });
    return;
  }

  res.json(trace);
});

router.post('/chat', authMiddleware, async (req: Request, res: Response) => {
  await ensureAssistantUploadSchema();
  const body = req.body as Partial<AssistantChatRequest>;
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!message) {
    res.status(400).json(assistantResponse(
      'error',
      'Ask Ship needs a question before it can help.',
      { code: 'MESSAGE_REQUIRED', message: 'message is required' },
    ));
    return;
  }

  if (message.length > ASSISTANT_LIMITS.maxMessageChars) {
    res.status(400).json(assistantResponse(
      'error',
      `Ask Ship questions are limited to ${ASSISTANT_LIMITS.maxMessageChars} characters.`,
      {
        code: 'MESSAGE_TOO_LONG',
        message: `message must be ${ASSISTANT_LIMITS.maxMessageChars} characters or fewer`,
      },
    ));
    return;
  }

  const status = getAssistantStatus();
  if (!status.available) {
    res.status(503).json(assistantResponse(
      'unavailable',
      'Ask Ship is not available yet. Configure the assistant model provider on the server, then try again.',
      {
        code: 'ASSISTANT_UNAVAILABLE',
        message: `Missing assistant configuration: ${status.missingConfiguration.join(', ') || 'unknown'}`,
      },
    ));
    return;
  }

  const response = await answerAssistantQuestion({
    request: {
      message,
      history: body.history,
      context: body.context,
      filters: body.filters,
    },
    userId: req.userId!,
    workspaceId: req.workspaceId!,
    workspaceRole: req.workspaceRole,
    isSuperAdmin: req.isSuperAdmin,
  });

  res.status(response.status === 'error' ? 500 : 200).json(response);
});

export default router;
