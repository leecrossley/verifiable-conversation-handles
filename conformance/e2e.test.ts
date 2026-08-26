import { describe, expect, it } from 'vitest';
import { flipHandleByte, mintHandle } from '../src/codec.js';
import {
  EXTENSION_ID,
  CID_BYTE_LENGTH,
  ERROR_CODE_HANDLE_NOT_RECOGNIZED,
} from '../src/schema/draft/schema.js';
import { parseCallToolHandleError } from '../src/errors.js';
import {
  callMemoryAppend,
  callMemoryRead,
  metaFromResult,
  startTestHarness,
  TEST_KEYS,
  textFromResult,
  withClient,
} from './harness.js';

describe('conversation-handle e2e', () => {
  it('sep-0000-s1-negotiation: server/discover advertises extension settings', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client) => {
        const discover = await client.discover();
        const ext = discover.capabilities?.extensions?.[EXTENSION_ID] as Record<string, unknown>;
        expect(ext?.handleLifetimeSeconds).toBe(3600);
        expect(ext?.onMissingHandle).toBe('new-conversation');
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s4.1-establishment: mints handle without prior handle', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        const { handleMeta } = await callMemoryAppend(client, handleClient, 'hello');
        expect(handleMeta).toMatchObject({ seq: 1, supersededHandlePresented: false });
        expect(typeof (handleMeta as { handle?: string }).handle).toBe('string');
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s4.2-rotation: seq increases on each response', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        const first = await callMemoryAppend(client, handleClient, 'a');
        const second = await callMemoryRead(client, handleClient);
        expect((second.handleMeta as { seq: number }).seq).toBeGreaterThan(
          (first.handleMeta as { seq: number }).seq,
        );
        expect((second.handleMeta as { conversationId: string }).conversationId).toBe(
          (first.handleMeta as { conversationId: string }).conversationId,
        );
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s2.1-client-opacity: client stores handle verbatim only', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        const { handleMeta } = await callMemoryAppend(client, handleClient, 'opaque');
        const stored = handleClient.getHandle();
        expect(stored).toBe((handleMeta as { handle: string }).handle);
        const mutated = flipHandleByte(stored!);
        handleClient.testOnlySetHandle(mutated);
        const read = await callMemoryRead(client, handleClient);
        expect(read.result).toMatchObject({ isError: true });
        expect(textFromResult(read.result)).toContain('integrity');
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s2.3-cross-principal: bob cannot read alice memory', async () => {
    const harness = await startTestHarness();
    try {
      let stolen = '';
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'secret');
        stolen = handleClient.getHandle()!;
      });
      await withClient(harness, 'bob', async (client, handleClient) => {
        handleClient.testOnlySetHandle(stolen);
        const read = await callMemoryRead(client, handleClient);
        expect(read.result).toMatchObject({ isError: true });
        expect(textFromResult(read.result)).toMatch(/principal|not own/i);
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s2.3-unauthenticated: valid handle without bearer yields no state', async () => {
    const harness = await startTestHarness();
    try {
      let stolen = '';
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'secret');
        stolen = handleClient.getHandle()!;
      });
      await withClient(harness, undefined, async (client, handleClient) => {
        handleClient.testOnlySetHandle(stolen);
        const read = await callMemoryRead(client, handleClient);
        expect(read.result).toMatchObject({ isError: true });
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s5.1-tool-arg-ignored: handle in tool args does not bind conversation', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'bound');
        handleClient.clear();
        const forged = mintHandle(TEST_KEYS, {
          cid: new Uint8Array(CID_BYTE_LENGTH).fill(0x01),
          exp: 4_000_000_000,
          seq: 99,
          keyId: 0,
        });
        const result = await client.callTool({
          name: 'memory_read',
          arguments: {
            [EXTENSION_ID]: { handle: forged },
          },
          _meta: handleClient.buildRequestMeta(),
        });
        handleClient.acceptResponseMeta((result as { _meta?: Record<string, unknown> })._meta);
        expect(textFromResult(result)).toBe('[]');
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s8-missing-handle: omitting handle does not see prior memory', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'prior');
        handleClient.clear();
        const read = await callMemoryRead(client, handleClient);
        expect(textFromResult(read.result)).toBe('[]');
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s4.3-supersession-detect: stale seq sets supersededHandlePresented', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'one');
        const stale = handleClient.getHandle()!;
        await callMemoryRead(client, handleClient);
        handleClient.testOnlySetHandle(stale);
        const read = await callMemoryRead(client, handleClient);
        expect((read.handleMeta as { supersededHandlePresented: boolean }).supersededHandlePresented).toBe(
          true,
        );
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s4.5-fork: fork mints new conversation without shared memory', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        const parent = await callMemoryAppend(client, handleClient, 'parent-data');
        const parentId = (parent.handleMeta as { conversationId: string }).conversationId;
        const forked = await client.callTool({
          name: 'memory_read',
          arguments: {},
          _meta: handleClient.buildRequestMeta('default', { fork: true }),
        });
        handleClient.acceptResponseMeta((forked as { _meta?: Record<string, unknown> })._meta);
        const forkId = (metaFromResult(forked) as { conversationId: string }).conversationId;
        expect(forkId).not.toBe(parentId);
        expect(textFromResult(forked)).toBe('[]');
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s6.4-list-invariant: tools/list unchanged by handle presence', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        const before = await client.listTools();
        await callMemoryAppend(client, handleClient, 'x');
        const after = await client.listTools({ _meta: handleClient.buildRequestMeta() });
        expect(after.tools?.map((t) => t.name).sort()).toEqual(before.tools?.map((t) => t.name).sort());
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s7-on-missing-none: no handle when configured', async () => {
    const harness = await startTestHarness({ onMissingHandle: 'none' });
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        const result = await client.callTool({
          name: 'memory_read',
          arguments: {},
          _meta: handleClient.buildRequestMeta(),
        });
        expect(metaFromResult(result)).toBeUndefined();
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s4.4-expiry-exchange: expired authentic handle resumes same cid', async () => {
    let now = 1_000_000;
    const harness = await startTestHarness({ now: () => now });
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        const first = await callMemoryAppend(client, handleClient, 'persist');
        const conversationId = (first.handleMeta as { conversationId: string }).conversationId;
        const expired = handleClient.getHandle()!;
        now = 4_000_000_001;
        handleClient.testOnlySetHandle(expired);
        const exchanged = await client.callTool({
          name: 'memory_read',
          arguments: {},
          _meta: handleClient.buildRequestMeta(),
        });
        handleClient.acceptResponseMeta((exchanged as { _meta?: Record<string, unknown> })._meta);
        const meta = metaFromResult(exchanged) as { conversationId: string; handle: string };
        expect(meta.conversationId).toBe(conversationId);
        expect(textFromResult(exchanged)).toContain('exchanged');
        const after = await callMemoryRead(client, handleClient);
        expect(textFromResult(after.result)).toBe('["persist"]');
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s4.4-expiry-reject: expired handle not valid for presenting request', async () => {
    let now = 1_000_000;
    const harness = await startTestHarness({ now: () => now });
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'x');
        const expired = handleClient.getHandle()!;
        now = 4_000_000_001;
        handleClient.testOnlySetHandle(expired);
        const exchanged = await client.callTool({
          name: 'memory_read',
          arguments: {},
          _meta: handleClient.buildRequestMeta(),
        });
        expect(textFromResult(exchanged)).toContain('exchanged');
        expect(textFromResult(exchanged)).not.toBe('["x"]');
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s3-entropy-cid: conversationId is 32 hex chars from 128-bit cid', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        const { handleMeta } = await callMemoryAppend(client, handleClient, 'entropy');
        const conversationId = (handleMeta as { conversationId: string }).conversationId;
        expect(conversationId).toMatch(/^[0-9a-f]{32}$/);
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s6.2-max-handle-bytes: rejects handles above client maxHandleBytes', async () => {
    const harness = await startTestHarness();
    try {
      let stolen = '';
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'x');
        stolen = handleClient.getHandle()!;
      });
      await withClient(harness, 'alice', async (client, handleClient) => {
        handleClient.testOnlySetHandle(stolen);
        const meta = {
          ...handleClient.buildRequestMeta(),
          'io.modelcontextprotocol/clientCapabilities': {
            extensions: { [EXTENSION_ID]: { maxHandleBytes: 8 } },
          },
          [EXTENSION_ID]: { handle: stolen },
        };
        const read = await client.callTool({
          name: 'memory_read',
          arguments: {},
          _meta: meta,
        });
        expect(read).toMatchObject({ isError: true });
        expect(textFromResult(read)).toMatch(/maxHandleBytes/i);
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s8-error-code-range: handle errors use normative §8 envelope via tools/call', async () => {
    const harness = await startTestHarness();
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'x');
        handleClient.testOnlySetHandle(flipHandleByte(handleClient.getHandle()!));
        const read = await client.callTool({
          name: 'memory_read',
          arguments: {},
          _meta: handleClient.buildRequestMeta(),
        });
        expect(read).toMatchObject({ isError: true });
        const envelope = parseCallToolHandleError(read);
        expect(envelope?.code).toBe(ERROR_CODE_HANDLE_NOT_RECOGNIZED);
        expect(envelope?.message).toBe('Conversation handle not recognised');
        expect(envelope?.data).toMatchObject({
          extension: EXTENSION_ID,
          reason: 'handle_invalid',
        });
        expect(envelope?.data.remediation).toMatch(/re-send|omit/i);
      });
    } finally {
      await harness.close();
    }
  });

  it('sep-0000-s9-retention-purge: purgeExpiredConversations retires stale records', async () => {
    let now = 1_000_000;
    const harness = await startTestHarness({ now: () => now, retentionSeconds: 60 });
    try {
      await withClient(harness, 'alice', async (client, handleClient) => {
        await callMemoryAppend(client, handleClient, 'old');
        now += 120_000;
        expect(harness.manager.purgeExpiredConversations()).toBe(1);
        handleClient.clear();
        const read = await callMemoryRead(client, handleClient);
        expect(textFromResult(read.result)).toBe('[]');
      });
    } finally {
      await harness.close();
    }
  });
});
