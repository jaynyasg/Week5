import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from './errorHandler.js';

function requestStub(): Request {
  return {
    method: 'POST',
    path: '/api/auth/login',
  } as Request;
}

function responseStub(): Response & {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const response = {
    headersSent: false,
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };

  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);

  return response;
}

describe('errorHandler', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a generic message for malformed JSON parse errors', () => {
    const error = Object.assign(
      new SyntaxError("Expected ':' after property name in JSON at position 11 (line 1 column 12)"),
      { status: 400, type: 'entity.parse.failed' }
    );
    const response = responseStub();

    errorHandler(error, requestStub(), response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'REQUEST_ERROR',
        message: 'Invalid JSON body',
      },
    });
  });

  it('preserves non-parse request error messages', () => {
    const error = Object.assign(new Error('invalid csrf token'), { status: 403 });
    const response = responseStub();

    errorHandler(error, requestStub(), response, vi.fn());

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: 'REQUEST_ERROR',
        message: 'invalid csrf token',
      },
    });
  });
});
