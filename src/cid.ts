import { CID_BYTE_LENGTH } from './schema/draft/schema.js';

export function cidToHex(cid: Uint8Array): string {
  return Buffer.from(cid).toString('hex');
}

export function cidToConversationId(cid: Uint8Array): string {
  if (cid.length !== CID_BYTE_LENGTH) {
    throw new Error(`cid must be ${CID_BYTE_LENGTH} bytes`);
  }
  return cidToHex(cid);
}

export function conversationIdToCid(conversationId: string): Uint8Array {
  const bytes = Buffer.from(conversationId, 'hex');
  if (bytes.length !== CID_BYTE_LENGTH) {
    throw new Error(`conversationId must decode to ${CID_BYTE_LENGTH} bytes`);
  }
  return new Uint8Array(bytes);
}
