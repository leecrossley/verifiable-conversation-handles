import {
  ERROR_CODE_HANDLE_NOT_RECOGNIZED,
  ERROR_EXTENSION_META_KEY,
  EXTENSION_ID,
  MISSING_REQUIRED_CLIENT_CAPABILITY,
  type ConversationHandleFailureReason,
} from './schema/draft/schema.js';

const NORMATIVE_ERROR_MESSAGE = 'Conversation handle not recognised';

const HANDLE_ERROR_REMEDIATION =
  'Re-send with the most recently received handle, or omit it to start a new conversation. Conversation-scoped preferences are not available without one.';

/** §8 `error.data` object — shared by JSON-RPC and tools/call surfaces. */
export interface ExtensionErrorData {
  extension: typeof EXTENSION_ID;
  reason: ConversationHandleFailureReason;
  remediation: string;
}

/** §8 error envelope fields without JSON-RPC framing. */
export interface ExtensionErrorEnvelope {
  code: number;
  message: string;
  data: ExtensionErrorData;
}

/** MCP tools/call error result carrying the §8-equivalent fields. */
export interface ConversationHandleToolErrorResult {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
  _meta: {
    [ERROR_EXTENSION_META_KEY]: ExtensionErrorEnvelope;
  };
}

export class ConversationHandleError extends Error {
  readonly code: number;
  readonly reason: ConversationHandleFailureReason;
  readonly extension = EXTENSION_ID;

  constructor(reason: ConversationHandleFailureReason, message: string, code = ERROR_CODE_HANDLE_NOT_RECOGNIZED) {
    super(message);
    this.name = 'ConversationHandleError';
    this.reason = reason;
    this.code = code;
  }

  /** Canonical §8 envelope — single source of truth for all error surfaces. */
  toErrorEnvelope(): ExtensionErrorEnvelope {
    return {
      code: this.code,
      message: NORMATIVE_ERROR_MESSAGE,
      data: extensionErrorData(this.reason),
    };
  }

  /** Normative §8 JSON-RPC error response (prompts/resources/custom methods). */
  toJsonRpcError(id: string | number | null = null) {
    const envelope = this.toErrorEnvelope();
    return {
      jsonrpc: '2.0' as const,
      id,
      error: {
        code: envelope.code,
        message: envelope.message,
        data: envelope.data,
      },
    };
  }

  /**
   * MCP tools/call error profile.
   * MCP surfaces tool failures as `isError` results, not JSON-RPC errors — but the
   * `_meta[ERROR_EXTENSION_META_KEY]` payload mirrors {@link toJsonRpcError}'s `error` object.
   */
  toCallToolErrorResult(): ConversationHandleToolErrorResult {
    const envelope = this.toErrorEnvelope();
    return {
      isError: true,
      content: [{ type: 'text', text: this.message }],
      _meta: {
        [ERROR_EXTENSION_META_KEY]: envelope,
      },
    };
  }

  /** When the extension is mandatory and the client did not advertise it (§8, -32021). */
  static missingClientCapability(): ConversationHandleError {
    return new ConversationHandleError(
      'handle_missing',
      'client did not advertise the conversation-handle extension',
      MISSING_REQUIRED_CLIENT_CAPABILITY,
    );
  }
}

export function extensionErrorData(reason: ConversationHandleFailureReason): ExtensionErrorData {
  return {
    extension: EXTENSION_ID,
    reason,
    remediation: HANDLE_ERROR_REMEDIATION,
  };
}

export function conversationHandleToolError(
  reason: ConversationHandleFailureReason,
  message: string,
  code = ERROR_CODE_HANDLE_NOT_RECOGNIZED,
): ConversationHandleToolErrorResult {
  return new ConversationHandleError(reason, message, code).toCallToolErrorResult();
}

/** Read §8-equivalent error fields from a tools/call result, if present. */
export function parseCallToolHandleError(result: unknown): ExtensionErrorEnvelope | undefined {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return undefined;
  }
  const meta = (result as { _meta?: Record<string, unknown> })._meta?.[ERROR_EXTENSION_META_KEY];
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return undefined;
  }
  const envelope = meta as ExtensionErrorEnvelope;
  if (typeof envelope.code !== 'number' || typeof envelope.message !== 'string') {
    return undefined;
  }
  return envelope;
}
