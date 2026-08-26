import {
  CLIENT_CAPABILITIES_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from './meta-keys.js';
import {
  EXTENSION_ID,
  type ClientExtensionSettings,
  type ConversationHandleResponseMeta,
} from './schema/draft/schema.js';

/**
 * Opaque client-side handle persistence. Never parses or mutates handles.
 */
export class ConversationHandleClient {
  private readonly handles = new Map<string, string | undefined>();
  private readonly maxHandleBytes?: number;

  constructor(settings?: ClientExtensionSettings) {
    this.maxHandleBytes = settings?.maxHandleBytes;
  }

  /** Returns the latest handle verbatim, or undefined when none is stored. */
  getHandle(sessionKey = 'default'): string | undefined {
    return this.handles.get(sessionKey);
  }

  /**
   * Stores the server-issued handle verbatim. Discards superseded handles by replacement.
   * MUST NOT parse, construct, or modify the string (SEP §2.1).
   */
  acceptResponseMeta(meta: unknown, sessionKey = 'default'): void {
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
      return;
    }
    const payload = (meta as Record<string, unknown>)[EXTENSION_ID];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return;
    }
    const handle = (payload as ConversationHandleResponseMeta).handle;
    if (typeof handle !== 'string') {
      return;
    }
    if (this.maxHandleBytes !== undefined && Buffer.byteLength(handle, 'utf8') > this.maxHandleBytes) {
      throw new Error('server issued handle exceeding maxHandleBytes');
    }
    this.handles.set(sessionKey, handle);
  }

  /**
   * Build per-request _meta envelope fields for a stateless MCP client.
   */
  buildRequestMeta(sessionKey = 'default', extras?: { fork?: boolean }): Record<string, unknown> {
    const handle = this.getHandle(sessionKey);
    const clientSettings: ClientExtensionSettings = {};
    if (this.maxHandleBytes !== undefined) {
      clientSettings.maxHandleBytes = this.maxHandleBytes;
    }
    const extensionPayload: Record<string, unknown> = {};
    if (handle !== undefined) {
      extensionPayload.handle = handle;
    }
    if (extras?.fork) {
      extensionPayload.fork = true;
    }
    return {
      [PROTOCOL_VERSION_META_KEY]: '2026-07-28',
      [CLIENT_CAPABILITIES_META_KEY]: {
        extensions: {
          [EXTENSION_ID]: clientSettings,
        },
      },
      ...(Object.keys(extensionPayload).length > 0 ? { [EXTENSION_ID]: extensionPayload } : {}),
    };
  }

  clear(sessionKey = 'default'): void {
    this.handles.delete(sessionKey);
  }

  /** Test-only injection of an opaque handle without parsing it. */
  testOnlySetHandle(handle: string, sessionKey = 'default'): void {
    this.handles.set(sessionKey, handle);
  }
}
