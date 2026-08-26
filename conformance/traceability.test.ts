import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const spec = readFileSync(join(root, 'conversation-identity-sep-draft.md'), 'utf8');
const trace = parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'sep-0000.yaml'), 'utf8')) as {
  requirements: Array<{ text: string; check?: string; excluded?: string }>;
};

const specificationSection = spec.split('## Specification')[1]?.split('## Worked example')[0] ?? '';
const rfc2119 = [...specificationSection.matchAll(/\b(MUST NOT|MUST|SHOULD NOT|SHOULD|REQUIRED)\b/g)].length;

describe('sep-0000 traceability', () => {
  it('maps primary specification requirements to checks or exclusions', () => {
    expect(trace.requirements.length).toBeGreaterThan(15);
    for (const row of trace.requirements) {
      expect(row.check || row.excluded, row.text).toBeTruthy();
    }
  });

  it('documents coverage against specification RFC 2119 density', () => {
    const mapped = trace.requirements.filter((r) => r.check).length;
    const excluded = trace.requirements.filter((r) => r.excluded).length;
    expect(mapped + excluded).toBeGreaterThanOrEqual(20);
    expect(rfc2119).toBeGreaterThan(mapped);
  });
});
