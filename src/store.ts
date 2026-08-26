import { CID_BYTE_LENGTH } from './schema/draft/schema.js';

export interface ConversationRecord {
  cid: Uint8Array;
  principal: string;
  latestSeq: number;
  memory: string[];
  parentCid?: Uint8Array;
  createdAtMs: number;
  retired: boolean;
}

export interface ConversationStore {
  get(cid: Uint8Array): ConversationRecord | undefined;
  has(cid: Uint8Array): boolean;
  create(record: ConversationRecord): void;
  update(cid: Uint8Array, patch: Partial<Pick<ConversationRecord, 'latestSeq' | 'memory' | 'retired'>>): void;
  isRetired(cid: Uint8Array): boolean;
  markRetired(cid: Uint8Array): void;
  listRecords(): ConversationRecord[];
}

function cidKey(cid: Uint8Array): string {
  return Buffer.from(cid).toString('hex');
}

export class InMemoryConversationStore implements ConversationStore {
  private readonly records = new Map<string, ConversationRecord>();
  private readonly retiredCids = new Set<string>();

  get(cid: Uint8Array): ConversationRecord | undefined {
    return this.records.get(cidKey(cid));
  }

  has(cid: Uint8Array): boolean {
    return this.records.has(cidKey(cid));
  }

  create(record: ConversationRecord): void {
    const key = cidKey(record.cid);
    if (this.retiredCids.has(key)) {
      throw new Error('cid has been retired and cannot be reused');
    }
    if (this.records.has(key)) {
      throw new Error('conversation already exists');
    }
    this.records.set(key, { ...record, memory: [...record.memory] });
  }

  update(
    cid: Uint8Array,
    patch: Partial<Pick<ConversationRecord, 'latestSeq' | 'memory' | 'retired'>>,
  ): void {
    const key = cidKey(cid);
    const existing = this.records.get(key);
    if (!existing) {
      throw new Error('conversation not found');
    }
    if (patch.latestSeq !== undefined) {
      existing.latestSeq = patch.latestSeq;
    }
    if (patch.memory !== undefined) {
      existing.memory = [...patch.memory];
    }
    if (patch.retired !== undefined) {
      existing.retired = patch.retired;
      if (patch.retired) {
        this.retiredCids.add(key);
      }
    }
  }

  isRetired(cid: Uint8Array): boolean {
    const key = cidKey(cid);
    return this.retiredCids.has(key) || this.records.get(key)?.retired === true;
  }

  markRetired(cid: Uint8Array): void {
    this.update(cid, { retired: true });
  }

  listRecords(): ConversationRecord[] {
    return [...this.records.values()];
  }
}

export function generateCid(): Uint8Array {
  const bytes = new Uint8Array(CID_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return bytes;
}
