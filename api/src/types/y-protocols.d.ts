declare module 'y-protocols/sync' {
  import * as yjs from 'yjs';
  import * as encoding from 'lib0/encoding';
  import * as decoding from 'lib0/decoding';

  export function writeSyncStep1(encoder: encoding.Encoder, doc: yjs.Doc): void;
  export function writeSyncStep2(encoder: encoding.Encoder, doc: yjs.Doc, encodedStateVector?: Uint8Array): void;
  export function readSyncStep1(decoder: decoding.Decoder, encoder: encoding.Encoder, doc: yjs.Doc): void;
  export function readSyncStep2(decoder: decoding.Decoder, doc: yjs.Doc, transactionOrigin?: unknown): void;
  export function readSyncMessage(
    decoder: decoding.Decoder,
    encoder: encoding.Encoder,
    doc: yjs.Doc,
    transactionOrigin: unknown
  ): number;
  export function writeUpdate(encoder: encoding.Encoder, update: Uint8Array): void;
}

declare module 'y-protocols/awareness' {
  import * as yjs from 'yjs';

  interface AwarenessChange {
    added: number[];
    updated: number[];
    removed: number[];
  }

  export class Awareness {
    doc: yjs.Doc;
    clientID: number;
    states: Map<number, Record<string, unknown>>;
    constructor(doc: yjs.Doc);
    getStates(): Map<number, Record<string, unknown>>;
    getLocalState(): Record<string, unknown> | null;
    setLocalState(state: Record<string, unknown> | null): void;
    setLocalStateField(field: string, value: unknown): void;
    on(event: 'update' | 'change', callback: (change: AwarenessChange, origin?: unknown) => void): void;
    on(event: string, callback: (...args: unknown[]) => void): void;
    off(event: 'update' | 'change', callback: (change: AwarenessChange, origin?: unknown) => void): void;
    off(event: string, callback: (...args: unknown[]) => void): void;
    destroy(): void;
  }

  export function encodeAwarenessUpdate(awareness: Awareness, clients: number[]): Uint8Array;
  export function applyAwarenessUpdate(awareness: Awareness, update: Uint8Array, origin: unknown): void;
  export function removeAwarenessStates(awareness: Awareness, clients: number[], origin: unknown): void;
}
