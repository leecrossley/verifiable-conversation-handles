import { decodeVersionedJsonHead, encodeVersionedJsonHead } from './versioned-json-head.js';

export const MEMORY_HEAD_VERSION = 1;

export function encodeMemoryHead(memory: readonly string[]): Uint8Array {
  return encodeVersionedJsonHead(MEMORY_HEAD_VERSION, 'memory', [...memory]);
}

export function decodeMemoryHead(bytes: Uint8Array): string[] {
  return decodeVersionedJsonHead(
    bytes,
    MEMORY_HEAD_VERSION,
    'memory',
    (raw) => (Array.isArray(raw) ? (raw as string[]) : []),
    (parsed) => (Array.isArray(parsed) ? (parsed as string[]) : undefined),
  );
}
