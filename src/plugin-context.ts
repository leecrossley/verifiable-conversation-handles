import type { ServerContext } from '@modelcontextprotocol/server';
import type { HandleKey } from './codec.js';
import type { MissingHandlePolicy, ServerExtensionSettings } from './schema/draft/schema.js';
import type { ConversationRecord, ConversationStore } from './store.js';

export interface ConversationHandlePluginOptions {
  keys: HandleKey[];
  store?: ConversationStore;
  settings?: Partial<ServerExtensionSettings>;
  resolvePrincipal: (ctx: ServerContext) => string | undefined;
  now?: () => number;
  /** §3 state commitment bytes embedded in minted handles (e.g. IFC label-journal head). */
  stateCommitment?: (record: ConversationRecord) => Uint8Array;
  /**
   * Per-request missing-handle policy (§4.1, §8).
   * Return `reject` for fail-closed runtimes that require a handle after taint exposure.
   */
  resolveOnMissingHandle?: (ctx: ServerContext) => MissingHandlePolicy | undefined;
}

export interface PluginContext {
  store: ConversationStore;
  keys: HandleKey[];
  settings: ServerExtensionSettings;
  stateCommitment?: (record: ConversationRecord) => Uint8Array;
  resolvePrincipal: (ctx: ServerContext) => string | undefined;
  resolveOnMissingHandle?: (ctx: ServerContext) => MissingHandlePolicy | undefined;
  nowMs: () => number;
  nowSec: () => number;
  activeKeyId: number;
}

export const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface ToolInvocationResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export type ToolHandler = (
  args: Record<string, unknown>,
) => Promise<ToolInvocationResult> | ToolInvocationResult;
