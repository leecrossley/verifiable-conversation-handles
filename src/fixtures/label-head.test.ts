import { describe, expect, it } from 'vitest';
import { decodeLabelHead, encodeLabelHead } from './label-head.js';

describe('label-head codec', () => {
  it('round-trips empty and populated label sets', () => {
    expect(decodeLabelHead(encodeLabelHead([]))).toEqual([]);
    expect(decodeLabelHead(encodeLabelHead(['pii']))).toEqual(['pii']);
  });

  it('decodes legacy plain JSON array heads', () => {
    const legacy = new TextEncoder().encode(JSON.stringify(['pii']));
    expect(decodeLabelHead(legacy)).toEqual(['pii']);
  });
});
