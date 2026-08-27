import type { ServerContext } from '@modelcontextprotocol/server';
import type { DecodedHandle } from './codec.js';
import { conversationHandleToolError } from './errors.js';
import { runWithActiveConversation } from './active-context.js';
import { mintResponseMeta } from './handle-mint.js';
import type { PluginContext, ToolHandler, ToolInvocationResult } from './plugin-context.js';
import type { ActiveConversation, HandlePresentation } from './presentation.js';
import { shouldRotateHandle } from './rotation.js';
import {
  ERROR_CODE_HANDLE_NOT_RECOGNIZED,
  EXTENSION_ID,
  type ConversationHandleFailureReason,
} from './schema/draft/schema.js';
import { generateCid, type ConversationRecord } from './store.js';

export type ToolExecutionPlan =
  | { mode: 'unbound' }
  | {
      mode: 'exchange';
      record: ConversationRecord;
      superseded: boolean;
      maxHandleBytes?: number;
    }
  | {
      mode: 'bound';
      presentation: HandlePresentation;
      active: ActiveConversation;
      superseded: boolean;
      maxHandleBytes?: number;
    };

export type BuildPlanResult =
  | { ok: true; plan: ToolExecutionPlan }
  | { ok: false; result: ToolInvocationResult };

function toActiveConversation(
  record: ConversationRecord,
  superseded: boolean,
  decoded?: DecodedHandle,
): ActiveConversation {
  return { record, superseded, decoded };
}

function toolError(
  reason: ConversationHandleFailureReason,
  message: string,
  code = ERROR_CODE_HANDLE_NOT_RECOGNIZED,
): ToolInvocationResult {
  return conversationHandleToolError(reason, message, code);
}

function boundPlan(
  presentation: HandlePresentation,
  active: ActiveConversation,
  superseded: boolean,
  maxHandleBytes?: number,
): BuildPlanResult {
  return {
    ok: true,
    plan: {
      mode: 'bound',
      presentation,
      active,
      superseded,
      maxHandleBytes,
    },
  };
}

function createConversation(
  ctx: PluginContext,
  principal: string,
  parentCid?: Uint8Array,
): ConversationRecord {
  const cid = generateCid();
  const record: ConversationRecord = {
    cid,
    principal,
    latestSeq: 0,
    memory: [],
    parentCid,
    createdAtMs: ctx.nowMs(),
    retired: false,
  };
  ctx.store.create(record);
  return record;
}

export function buildExecutionPlan(
  ctx: PluginContext,
  requestCtx: ServerContext,
  presentation: HandlePresentation,
): BuildPlanResult {
  if (presentation.kind === 'inactive') {
    return { ok: true, plan: { mode: 'unbound' } };
  }
  if (presentation.kind === 'absent' && !presentation.mintOnResponse) {
    return { ok: true, plan: { mode: 'unbound' } };
  }
  if (presentation.kind === 'exchange') {
    return {
      ok: true,
      plan: {
        mode: 'exchange',
        record: presentation.record,
        superseded: presentation.decoded.seq < presentation.record.latestSeq,
        maxHandleBytes: presentation.maxHandleBytes,
      },
    };
  }

  const principal = ctx.resolvePrincipal(requestCtx);
  if (!principal) {
    return {
      ok: false,
      result: toolError('unauthenticated', 'authenticated principal required to start a conversation'),
    };
  }

  if (presentation.kind === 'absent') {
    const record = createConversation(ctx, principal);
    return boundPlan(presentation, toActiveConversation(record, false), false, presentation.maxHandleBytes);
  }
  if (presentation.kind === 'fork') {
    const record = createConversation(ctx, principal, presentation.parent.cid);
    return boundPlan(
      presentation,
      toActiveConversation(record, presentation.superseded, presentation.decoded),
      presentation.superseded,
      presentation.maxHandleBytes,
    );
  }
  return boundPlan(
    presentation,
    toActiveConversation(presentation.record, presentation.superseded, presentation.decoded),
    presentation.superseded,
    presentation.maxHandleBytes,
  );
}

function refreshActive(ctx: PluginContext, active: ActiveConversation): ActiveConversation {
  const record = ctx.store.get(active.record.cid);
  if (!record) {
    return active;
  }
  return { ...active, record };
}

export async function executePlan(
  ctx: PluginContext,
  plan: ToolExecutionPlan,
  handler: ToolHandler,
  args: Record<string, unknown>,
): Promise<ToolInvocationResult> {
  if (plan.mode === 'unbound') {
    return handler(args);
  }
  if (plan.mode === 'exchange') {
    const meta = mintResponseMeta(ctx, plan.record, plan.superseded, plan.maxHandleBytes);
    return { content: [], _meta: meta };
  }
  const result = await runWithActiveConversation(plan.active, () => handler(args));
  const active = refreshActive(ctx, plan.active);
  if (!shouldRotateHandle(ctx, plan.presentation, active)) {
    return result;
  }
  const meta = mintResponseMeta(ctx, active.record, plan.superseded, plan.maxHandleBytes);
  return { ...result, _meta: { ...result._meta, ...meta } };
}

export function sanitizeToolArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sanitizedArgs = { ...args };
  delete sanitizedArgs[EXTENSION_ID];
  return sanitizedArgs;
}
