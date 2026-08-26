import type { DecodedHandle } from './codec.js';
import type { ConversationRecord } from './store.js';
import type { ConversationHandleFailureReason } from './schema/draft/schema.js';

/** Active conversation scope passed to tool handlers via AsyncLocalStorage. */
export interface ActiveConversation {
  record: ConversationRecord;
  superseded: boolean;
  /** Set when an expired handle is presented — tool may shape an exchange response. */
  exchangeOnly?: boolean;
  /** Present when the request carried a decoded handle. */
  decoded?: DecodedHandle;
}

export type HandlePresentation =
  | { kind: 'inactive' }
  | { kind: 'absent'; mintOnResponse: boolean; maxHandleBytes?: number }
  | {
      kind: 'valid';
      record: ConversationRecord;
      decoded: DecodedHandle;
      superseded: boolean;
      maxHandleBytes?: number;
    }
  | {
      kind: 'exchange';
      record: ConversationRecord;
      decoded: DecodedHandle;
      maxHandleBytes?: number;
    }
  | {
      kind: 'fork';
      parent: ConversationRecord;
      decoded: DecodedHandle;
      superseded: boolean;
      maxHandleBytes?: number;
    };

export interface PresentHandleFailure {
  reason: ConversationHandleFailureReason;
  message: string;
}

export type PresentHandleResult =
  | { ok: true; presentation: HandlePresentation }
  | { ok: false; failure: PresentHandleFailure };
