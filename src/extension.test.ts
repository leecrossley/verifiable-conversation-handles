import type { ServerContext } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as codec from './codec.js';
import { ConversationHandleError } from './errors.js';
import { conversationHandlePlugin, getActiveConversation } from './extension.js';
import { appendConversationMemory } from './fixtures/memory-tools.js';
import { encodeMemoryHead } from './fixtures/memory-head.js';
import { CLIENT_CAPABILITIES_META_KEY } from './meta-keys.js';
import { EXTENSION_ID } from './schema/draft/schema.js';

const TEST_KEYS: codec.HandleKey[] = [
  { keyId: 0, secret: Buffer.from('test-key-primary-32bytes!!!!!!') },
];

function extensionCtx(handle?: string): ServerContext {
  return {
    mcpReq: {
      envelope: {
        [CLIENT_CAPABILITIES_META_KEY]: {
          extensions: { [EXTENSION_ID]: {} },
        },
      },
      _meta: {
        ...(handle ? { [EXTENSION_ID]: { handle } } : {}),
      },
    },
  } as unknown as ServerContext;
}

function handleFromMeta(meta: Record<string, unknown> | undefined): string {
  const payload = meta?.[EXTENSION_ID] as { handle: string } | undefined;
  if (!payload?.handle) {
    throw new Error('expected handle in response meta');
  }
  return payload.handle;
}

describe('mint ordering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not advance latestSeq when encodeHandle throws after a successful mint', async () => {
    const manager = conversationHandlePlugin({
      keys: TEST_KEYS,
      resolvePrincipal: () => 'alice',
      stateCommitment: (record) => encodeMemoryHead(record.memory),
    });
    const conversationStore = manager.store;

    const append = (text: string, handle?: string) =>
      manager.invokeToolHandler(extensionCtx(handle), { text }, async () => {
        appendConversationMemory(conversationStore, text);
        return { content: [{ type: 'text', text: 'ok' }] };
      });

    const first = await append('seed');
    const handle = handleFromMeta(first._meta);
    const cid = conversationStore.listRecords()[0]!.cid;
    expect(conversationStore.get(cid)?.latestSeq).toBe(1);

    vi.spyOn(codec, 'encodeHandle').mockImplementation(() => {
      throw new ConversationHandleError('handle_too_large', 'minted handle exceeds maxHandleBytes');
    });

    await expect(append('more', handle)).rejects.toThrow(/maxHandleBytes/i);
    expect(conversationStore.get(cid)?.latestSeq).toBe(1);
  });
});
