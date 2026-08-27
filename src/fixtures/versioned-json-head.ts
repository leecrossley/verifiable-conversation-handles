/** Shared versioned JSON encoding for §3 state-commitment fixture heads. */

export function encodeVersionedJsonHead<T>(version: number, field: string, value: T): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: version, [field]: value }));
}

export function decodeVersionedJsonHead<T>(
  bytes: Uint8Array,
  version: number,
  field: string,
  parseValue: (raw: unknown) => T | undefined,
  parseLegacy?: (parsed: unknown) => T | undefined,
): T {
  if (bytes.length === 0) {
    return parseValue([]) ?? (parseLegacy?.([]) as T);
  }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
  if (parsed && typeof parsed === 'object' && parsed !== null) {
    const record = parsed as { v?: number };
    if (record.v === version) {
      const value = parseValue((parsed as Record<string, unknown>)[field]);
      if (value !== undefined) {
        return value;
      }
    }
  }
  if (parseLegacy) {
    const legacy = parseLegacy(parsed);
    if (legacy !== undefined) {
      return legacy;
    }
  }
  return parseValue(undefined) as T;
}
