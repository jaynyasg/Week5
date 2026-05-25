import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

export interface ExtractedFileText {
  text: string;
  supported: boolean;
  reason?: string;
}

export async function extractTextFromFile(input: {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}): Promise<ExtractedFileText> {
  const mimeType = input.mimeType.toLowerCase();
  const extension = getExtension(input.filename);

  if (mimeType.startsWith('text/') || extension === '.txt' || extension === '.md' || extension === '.csv') {
    return { supported: true, text: input.buffer.toString('utf8') };
  }

  if (mimeType === 'application/pdf' || extension === '.pdf') {
    const parser = new PDFParse({ data: toUint8Array(input.buffer) });
    try {
      const parsed = await parser.getText();
      return { supported: true, text: parsed.text ?? '' };
    } finally {
      await parser.destroy();
    }
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === '.docx'
  ) {
    const parsed = await mammoth.extractRawText({ buffer: input.buffer });
    return { supported: true, text: parsed.value ?? '' };
  }

  return {
    supported: false,
    text: '',
    reason: 'File type is not supported for Ask Ship indexing',
  };
}

export function isSupportedAssistantFile(filename: string, mimeType: string): boolean {
  const extension = getExtension(filename);
  const normalizedMime = mimeType.toLowerCase();

  return normalizedMime.startsWith('text/') ||
    normalizedMime === 'application/pdf' ||
    normalizedMime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === '.txt' ||
    extension === '.md' ||
    extension === '.csv' ||
    extension === '.pdf' ||
    extension === '.docx';
}

function getExtension(filename: string): string {
  const index = filename.lastIndexOf('.');
  return index >= 0 ? filename.slice(index).toLowerCase() : '';
}

function toUint8Array(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer);
}
