import { describe, expect, it } from 'vitest';
import { decodeMemoryHead, encodeMemoryHead } from './memory-head.js';

describe('memory-head', () => {
  it('round-trips memory entries', () => {
    const head = encodeMemoryHead(['a', 'b']);
    expect(decodeMemoryHead(head)).toEqual(['a', 'b']);
  });

  it('empty bytes decode to empty memory', () => {
    expect(decodeMemoryHead(new Uint8Array(0))).toEqual([]);
  });
});
