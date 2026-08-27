import { describe, expect, it } from 'vitest';
import { ConversationHandleClient } from './client.js';
import { EXTENSION_ID } from './schema/draft/schema.js';
import { CLIENT_CAPABILITIES_META_KEY } from './meta-keys.js';

function handleMeta(seq: number, handle = `handle-seq-${seq}`) {
  return {
    [EXTENSION_ID]: {
      handle,
      conversationId: 'abc123',
      seq,
      expiresAt: 4_000_000_000,
      supersededHandlePresented: false,
    },
  };
}

describe('ConversationHandleClient concurrency', () => {
  it('sep-0000-client-sends-highest-seq: accepts monotonic seq updates', () => {
    const client = new ConversationHandleClient();
    client.acceptResponseMeta(handleMeta(2, 'h2'));
    client.acceptResponseMeta(handleMeta(4, 'h4'));
    expect(client.getHandle()).toBe('h4');
    expect(client.getSession().highestSeq).toBe(4);
  });

  it('sep-0000-client-discards-lower-seq: discards out-of-order lower seq responses', () => {
    const client = new ConversationHandleClient();
    client.acceptResponseMeta(handleMeta(4, 'h4'));
    client.acceptResponseMeta(handleMeta(2, 'h2'));
    expect(client.getHandle()).toBe('h4');
    expect(client.getSession().highestSeq).toBe(4);
  });

  it('sep-0000-client-orders-by-seq: buildRequestMeta sends highest-seq handle after out-of-order accept', () => {
    const client = new ConversationHandleClient();
    client.acceptResponseMeta(handleMeta(4, 'h4'));
    client.acceptResponseMeta(handleMeta(2, 'h2'));
    const meta = client.buildRequestMeta();
    expect((meta[EXTENSION_ID] as { handle: string }).handle).toBe('h4');
  });

  it('clear resets seq tracking', () => {
    const client = new ConversationHandleClient();
    client.acceptResponseMeta(handleMeta(3, 'h3'));
    client.clear();
    expect(client.getHandle()).toBeUndefined();
    expect(client.getSession().highestSeq).toBe(0);
  });

  it('sep-0000-client-discards-lower-seq: equal seq overwrites handle string', () => {
    const client = new ConversationHandleClient();
    client.acceptResponseMeta(handleMeta(5, 'first-at-five'));
    client.acceptResponseMeta(handleMeta(5, 'second-at-five'));
    expect(client.getHandle()).toBe('second-at-five');
    expect(client.getSession().highestSeq).toBe(5);
  });

  it('ignores meta without handle field', () => {
    const client = new ConversationHandleClient();
    client.acceptResponseMeta(handleMeta(3, 'h3'));
    client.acceptResponseMeta({
      [EXTENSION_ID]: {
        conversationId: 'abc',
        seq: 99,
        expiresAt: 4_000_000_000,
        supersededHandlePresented: false,
      },
    });
    expect(client.getHandle()).toBe('h3');
    expect(client.getSession().highestSeq).toBe(3);
  });

  it('ignores invalid or missing seq in response meta', () => {
    const client = new ConversationHandleClient();
    client.acceptResponseMeta(handleMeta(4, 'h4'));
    client.acceptResponseMeta({
      [EXTENSION_ID]: {
        handle: 'no-seq-handle',
        conversationId: 'abc',
        expiresAt: 4_000_000_000,
        supersededHandlePresented: false,
      },
    });
    expect(client.getHandle()).toBe('h4');
    expect(client.getSession().highestSeq).toBe(4);
    client.acceptResponseMeta({
      [EXTENSION_ID]: {
        handle: 'nan-seq',
        conversationId: 'abc',
        seq: Number.NaN,
        expiresAt: 4_000_000_000,
        supersededHandlePresented: false,
      },
    });
    expect(client.getHandle()).toBe('h4');
  });

  it('sep-0000-respect-max-handle-bytes: throws when server handle exceeds client limit', () => {
    const client = new ConversationHandleClient({ maxHandleBytes: 8 });
    expect(() =>
      client.acceptResponseMeta({
        [EXTENSION_ID]: {
          handle: 'this-handle-is-way-too-long',
          conversationId: 'abc',
          seq: 1,
          expiresAt: 4_000_000_000,
          supersededHandlePresented: false,
        },
      }),
    ).toThrow(/maxHandleBytes/i);
  });

  it('sep-0000-client-advertises-extension: buildRequestMeta advertises extension when carrying handle', () => {
    const client = new ConversationHandleClient({ maxHandleBytes: 512 });
    client.acceptResponseMeta(handleMeta(1, 'opaque'));
    const meta = client.buildRequestMeta();
    const caps = meta[CLIENT_CAPABILITIES_META_KEY] as { extensions?: Record<string, unknown> };
    expect(caps?.extensions?.[EXTENSION_ID]).toMatchObject({ maxHandleBytes: 512 });
    expect((meta[EXTENSION_ID] as { handle: string }).handle).toBe('opaque');
  });
});
