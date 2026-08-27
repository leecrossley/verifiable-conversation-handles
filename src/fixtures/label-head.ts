import { decodeVersionedJsonHead, encodeVersionedJsonHead } from './versioned-json-head.js';

export const LABEL_HEAD_VERSION = 1;

export type TaintLabel = 'pii';

export function encodeLabelHead(labels: Iterable<TaintLabel>): Uint8Array {
  const sorted = [...labels].sort();
  return encodeVersionedJsonHead(LABEL_HEAD_VERSION, 'labels', sorted);
}

export function decodeLabelHead(bytes: Uint8Array): TaintLabel[] {
  return decodeVersionedJsonHead(
    bytes,
    LABEL_HEAD_VERSION,
    'labels',
    (raw) => (Array.isArray(raw) ? (raw as TaintLabel[]) : []),
    (parsed) => (Array.isArray(parsed) ? (parsed as TaintLabel[]) : undefined),
  );
}
