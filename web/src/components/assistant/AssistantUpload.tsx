import { ChangeEvent, useRef, useState } from 'react';
import type { AssistantIndexingStatus } from '@ship/shared';
import { useQueryClient } from '@tanstack/react-query';
import { documentKeys } from '@/hooks/useDocumentsQuery';
import { uploadFile } from '@/services/upload';
import { cn } from '@/lib/cn';

interface AssistantUploadProps {
  documentId?: string;
  disabled?: boolean;
}

const ACCEPTED_ASSISTANT_FILES = [
  '.txt',
  '.md',
  '.csv',
  '.pdf',
  '.docx',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
].join(',');

export function AssistantUpload({ documentId, disabled = false }: AssistantUploadProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState<AssistantIndexingStatus | 'uploading' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setFilename(file.name);
    setStatus('uploading');
    setError(null);

    try {
      const result = await uploadFile(file, undefined, undefined, {
        documentId,
        createDocument: !documentId,
      });
      setStatus(result.assistantIndexingStatus ?? 'indexed');
      if (result.documentId && !documentId) {
        await queryClient.invalidateQueries({ queryKey: documentKeys.wikiList() });
      }
    } catch (uploadError) {
      setStatus('failed');
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    }
  };

  return (
    <div className="border-t border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_ASSISTANT_FILES}
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          disabled={disabled || status === 'uploading'}
          onClick={() => inputRef.current?.click()}
          title={documentId ? 'Upload documentation for this document' : 'Upload workspace documentation for Ask Ship'}
          className="flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-border/50 disabled:cursor-not-allowed disabled:text-muted"
        >
          <UploadIcon />
          Upload Doc
        </button>
        {status ? (
          <span
            className={cn(
              'rounded-full border px-2 py-1 text-xs',
              status === 'indexed' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
              status === 'uploading' || status === 'indexing'
                ? 'border-blue-500/30 bg-blue-500/10 text-blue-200'
                : '',
              status === 'unsupported' && 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200',
              status === 'failed' && 'border-red-500/30 bg-red-500/10 text-red-200',
              status === 'not_indexed' && 'border-border text-muted',
            )}
          >
            {statusLabel(status)}
          </span>
        ) : null}
      </div>
      {filename || error ? (
        <p className={cn('mt-1 truncate text-xs text-muted', error && 'text-red-200')}>
          {error ?? filename}
        </p>
      ) : null}
    </div>
  );
}

function statusLabel(status: AssistantIndexingStatus | 'uploading'): string {
  if (status === 'not_indexed') return 'Queued';
  if (status === 'indexing' || status === 'uploading') return 'Indexing';
  if (status === 'indexed') return 'Indexed';
  if (status === 'unsupported') return 'Unsupported';
  return 'Failed';
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 16V4m0 0l-4 4m4-4l4 4" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}
