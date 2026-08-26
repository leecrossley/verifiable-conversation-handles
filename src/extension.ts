import type { ServerContext } from '@modelcontextprotocol/server';
import {
  decodeHandle,
  encodeHandle,
  type HandleKey,
  type DecodedHandle,
} from './codec.js';
import { ConversationHandleError, conversationHandleToolError } from './errors.js';
import { cidToConversationId } from './cid.js';
import { getActiveConversation, runWithActiveConversation } from './active-context.js';
import type { ActiveConversation, HandlePresentation } from './presentation.js';
import { toExtensionSettings } from './sdk-meta.js';
import {
  DEFAULT_HANDLE_LIFETIME_SECONDS,
  DEFAULT_MAX_HANDLE_BYTES,
  DEFAULT_ON_MISSING_HANDLE,
  ERROR_CODE_HANDLE_NOT_RECOGNIZED,
  EXTENSION_ID,
  type ClientExtensionSettings,
  type ConversationHandleFailureReason,
  type ConversationHandleRequestMeta,
  type ServerExtensionSettings,
} from './schema/draft/schema.js';
import {
  generateCid,
  InMemoryConversationStore,
  type ConversationRecord,
  type ConversationStore,
} from './store.js';

export type { ConversationStore } from './store.js';
export { getActiveConversation } from './active-context.js';

export interface ConversationHandlePluginOptions {
  keys: HandleKey[];
  store?: ConversationStore;
  settings?: Partial<ServerExtensionSettings>;
  resolvePrincipal: (ctx: ServerContext) => string | undefined;
  now?: () => number;
}

export interface ToolInvocationResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<ToolInvocationResult> | ToolInvocationResult;

const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function conversationHandlePlugin(options: ConversationHandlePluginOptions) {
  const store = options.store ?? new InMemoryConversationStore();
  const nowMs = options.now ?? (() => Date.now());
  const nowSec = () => Math.floor(nowMs() / 1000);
  const settings: ServerExtensionSettings = {
    handleLifetimeSeconds: options.settings?.handleLifetimeSeconds ?? DEFAULT_HANDLE_LIFETIME_SECONDS,
    onMissingHandle: options.settings?.onMissingHandle ?? DEFAULT_ON_MISSING_HANDLE,
    maxHandleBytes: options.settings?.maxHandleBytes ?? DEFAULT_MAX_HANDLE_BYTES,
    conversationRetentionSeconds: options.settings?.conversationRetentionSeconds,
    retentionMs:
      options.settings?.retentionMs ??
      (options.settings?.conversationRetentionSeconds !== undefined
        ? options.settings.conversationRetentionSeconds * 1000
        : undefined),
  };

  const retentionMs = settings.retentionMs ?? DEFAULT_RETENTION_MS;
  const activeKeyId = options.keys[0]?.keyId ?? 0;

  function extensionSettings(): Record<string, string | number | boolean> {
    return toExtensionSettings(settings);
  }

  function readClientCapabilities(ctx: ServerContext): Record<string, unknown> | undefined {
    const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
    const meta = ctx.mcpReq._meta as Record<string, unknown> | undefined;
    return (
      (envelope?.capabilities as Record<string, unknown> | undefined) ??
      (meta?.capabilities as Record<string, unknown> | undefined) ??
      (envelope?.['io.modelcontextprotocol/clientCapabilities'] as Record<string, unknown> | undefined) ??
      (meta?.['io.modelcontextprotocol/clientCapabilities'] as Record<string, unknown> | undefined)
    );
  }

  function clientAdvertisesExtension(ctx: ServerContext): boolean {
    const caps = readClientCapabilities(ctx);
    const extensions = caps?.extensions as Record<string, unknown> | undefined;
    return extensions?.[EXTENSION_ID] !== undefined;
  }

  function readRequestMeta(ctx: ServerContext): ConversationHandleRequestMeta | undefined {
    const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
    const meta = ctx.mcpReq._meta as Record<string, unknown> | undefined;
    return (meta?.[EXTENSION_ID] ?? envelope?.[EXTENSION_ID]) as
      | ConversationHandleRequestMeta
      | undefined;
  }

  function readClientMaxHandleBytes(ctx: ServerContext): number | undefined {
    const caps = readClientCapabilities(ctx);
    const extensions = caps?.extensions as Record<string, unknown> | undefined;
    const clientSettings = extensions?.[EXTENSION_ID] as ClientExtensionSettings | undefined;
    return clientSettings?.maxHandleBytes;
  }

  function readPresentedHandle(ctx: ServerContext): string | undefined {
    const requestMeta = readRequestMeta(ctx);
    const handle = requestMeta?.handle;
    return typeof handle === 'string' && handle.length > 0 ? handle : undefined;
  }

  function fail(reason: ConversationHandleFailureReason, message: string): never {
    throw new ConversationHandleError(reason, message, ERROR_CODE_HANDLE_NOT_RECOGNIZED);
  }

  function verifyOwnership(record: ConversationRecord, principal: string | undefined): void {
    if (!principal) {
      fail('unauthenticated', 'authenticated principal required to access conversation state');
    }
    if (record.principal !== principal) {
      fail('principal_mismatch', 'presented handle is not owned by the authenticated principal');
    }
  }

  function presentHandle(ctx: ServerContext): HandlePresentation {
    if (!clientAdvertisesExtension(ctx)) {
      return { kind: 'inactive' };
    }

    const requestMeta = readRequestMeta(ctx);
    const maxHandleBytes = readClientMaxHandleBytes(ctx) ?? settings.maxHandleBytes;
    const mintOnResponse = settings.onMissingHandle === 'new-conversation';
    const handle = readPresentedHandle(ctx);
    const principal = options.resolvePrincipal(ctx);

    if (!handle) {
      return { kind: 'absent', mintOnResponse, maxHandleBytes };
    }

    let decoded: DecodedHandle;
    try {
      decoded = decodeHandle(options.keys, handle, { maxBytes: maxHandleBytes, now: nowSec });
    } catch (error) {
      if (error instanceof ConversationHandleError) {
        fail(error.reason, error.message);
      }
      fail('handle_invalid', error instanceof Error ? error.message : 'handle integrity check failed');
    }

    if (store.isRetired(decoded.cid)) {
      fail('handle_retired', 'conversation has been retired');
    }

    const record = store.get(decoded.cid);
    if (!record) {
      fail('handle_invalid', 'conversation not found for presented handle');
    }

    verifyOwnership(record, principal);

    const expired = decoded.exp <= nowSec();
    if (expired) {
      return { kind: 'exchange', record, decoded, maxHandleBytes };
    }

    if (requestMeta?.fork === true) {
      return { kind: 'fork', parent: record, decoded, superseded: decoded.seq < record.latestSeq };
    }

    return {
      kind: 'valid',
      record,
      decoded,
      superseded: decoded.seq < record.latestSeq,
      maxHandleBytes,
    };
  }

  function createConversation(principal: string, parentCid?: Uint8Array): ConversationRecord {
    const cid = generateCid();
    const record: ConversationRecord = {
      cid,
      principal,
      latestSeq: 0,
      memory: [],
      parentCid,
      createdAtMs: nowMs(),
      retired: false,
    };
    store.create(record);
    return record;
  }

  function mintResponseMeta(
    record: ConversationRecord,
    superseded: boolean,
    maxHandleBytes?: number,
  ): Record<string, unknown> {
    const nextSeq = record.latestSeq + 1;
    store.update(record.cid, { latestSeq: nextSeq });
    const handle = encodeHandle(
      options.keys,
      {
        cid: record.cid,
        exp: nowSec() + settings.handleLifetimeSeconds!,
        seq: nextSeq,
        keyId: activeKeyId,
      },
      { maxBytes: maxHandleBytes },
    );

    return {
      [EXTENSION_ID]: {
        handle,
        conversationId: cidToConversationId(record.cid),
        seq: nextSeq,
        expiresAt: nowSec() + settings.handleLifetimeSeconds!,
        supersededHandlePresented: superseded,
      },
    };
  }

  function toActiveConversation(
    record: ConversationRecord,
    decoded: DecodedHandle,
    superseded: boolean,
  ): ActiveConversation {
    return { record, decoded, superseded };
  }

  function toolError(reason: ConversationHandleFailureReason, message: string): ToolInvocationResult {
    return conversationHandleToolError(reason, message, ERROR_CODE_HANDLE_NOT_RECOGNIZED);
  }

  async function invokeToolHandler(
    ctx: ServerContext,
    args: Record<string, unknown>,
    handler: ToolHandler,
  ): Promise<ToolInvocationResult> {
    // §5.1: ignore handle material in tool arguments.
    const sanitizedArgs = { ...args };
    delete sanitizedArgs[EXTENSION_ID];

    let presentation: HandlePresentation;
    try {
      presentation = presentHandle(ctx);
    } catch (error) {
      if (error instanceof ConversationHandleError) {
        return toolError(error.reason, error.message);
      }
      throw error;
    }

    if (presentation.kind === 'inactive') {
      return handler(sanitizedArgs);
    }

    if (presentation.kind === 'absent' && !presentation.mintOnResponse) {
      return handler(sanitizedArgs);
    }

    if (presentation.kind === 'exchange') {
      const meta = mintResponseMeta(
        presentation.record,
        presentation.decoded.seq < presentation.record.latestSeq,
        presentation.maxHandleBytes,
      );
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              exchanged: true,
              memory: [...presentation.record.memory],
            }),
          },
        ],
        _meta: meta,
      };
    }

    const principal = options.resolvePrincipal(ctx);
    if (!principal) {
      return toolError('unauthenticated', 'authenticated principal required to start a conversation');
    }

    let active: ActiveConversation;
    let superseded = false;
    let maxHandleBytes: number | undefined;

    if (presentation.kind === 'absent') {
      const record = createConversation(principal);
      active = toActiveConversation(record, { version: 1, keyId: 0, cid: record.cid, exp: 0, seq: 0, state: new Uint8Array() }, false);
      maxHandleBytes = presentation.maxHandleBytes;
    } else if (presentation.kind === 'fork') {
      const record = createConversation(principal, presentation.parent.cid);
      active = toActiveConversation(record, presentation.decoded, presentation.superseded);
      superseded = presentation.superseded;
      maxHandleBytes = presentation.maxHandleBytes;
    } else {
      active = toActiveConversation(presentation.record, presentation.decoded, presentation.superseded);
      superseded = presentation.superseded;
      maxHandleBytes = presentation.maxHandleBytes;
    }

    const result = await runWithActiveConversation(active, () => handler(sanitizedArgs));
    const meta = mintResponseMeta(active.record, superseded, maxHandleBytes);
    return { ...result, _meta: { ...result._meta, ...meta } };
  }

  function purgeExpiredConversations(): number {
    const cutoff = nowMs() - retentionMs;
    let purged = 0;
    for (const record of store.listRecords()) {
      if (record.createdAtMs < cutoff && !record.retired) {
        store.markRetired(record.cid);
        purged += 1;
      }
    }
    return purged;
  }

  return {
    extensionId: EXTENSION_ID,
    store,
    settings,
    extensionSettings,
    presentHandle,
    invokeToolHandler,
    purgeExpiredConversations,
  };
}

export type ConversationHandleManager = ReturnType<typeof conversationHandlePlugin>;
