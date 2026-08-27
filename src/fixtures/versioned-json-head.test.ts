import { describe, expect, it } from 'vitest';
import { decodeVersionedJsonHead, encodeVersionedJsonHead } from './versioned-json-head.js';

describe('versioned-json-head', () => {
  it('round-trips versioned payloads', () => {
    const encoded = encodeVersionedJsonHead(1, 'items', ['a']);
    const decoded = decodeVersionedJsonHead(
      encoded,
      1,
      'items',
      (raw) => (Array.isArray(raw) ? (raw as string[]) : []),
    );
    expect(decoded).toEqual(['a']);
  });

  it('supports legacy array decode when provided', () => {
    const legacy = new TextEncoder().encode(JSON.stringify(['legacy']));
    const decoded = decodeVersionedJsonHead(
      legacy,
      1,
      'items',
      () => [],
      (parsed) => (Array.isArray(parsed) ? (parsed as string[]) : undefined),
    );
    expect(decoded).toEqual(['legacy']);
  });
});
