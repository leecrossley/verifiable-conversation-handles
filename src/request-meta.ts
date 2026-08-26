import type { ServerContext } from '@modelcontextprotocol/server';
import { CLIENT_CAPABILITIES_META_KEY } from './meta-keys.js';
import {
  EXTENSION_ID,
  type ClientExtensionSettings,
  type ConversationHandleRequestMeta,
} from './schema/draft/schema.js';

export function readClientCapabilities(ctx: ServerContext): Record<string, unknown> | undefined {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const meta = ctx.mcpReq._meta as Record<string, unknown> | undefined;
  return (
    (envelope?.capabilities as Record<string, unknown> | undefined) ??
    (meta?.capabilities as Record<string, unknown> | undefined) ??
    (envelope?.[CLIENT_CAPABILITIES_META_KEY] as Record<string, unknown> | undefined) ??
    (meta?.[CLIENT_CAPABILITIES_META_KEY] as Record<string, unknown> | undefined)
  );
}

export function clientAdvertisesExtension(ctx: ServerContext): boolean {
  const caps = readClientCapabilities(ctx);
  const extensions = caps?.extensions as Record<string, unknown> | undefined;
  return extensions?.[EXTENSION_ID] !== undefined;
}

export function readRequestMeta(ctx: ServerContext): ConversationHandleRequestMeta | undefined {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const meta = ctx.mcpReq._meta as Record<string, unknown> | undefined;
  return (meta?.[EXTENSION_ID] ?? envelope?.[EXTENSION_ID]) as ConversationHandleRequestMeta | undefined;
}

export function readClientMaxHandleBytes(ctx: ServerContext): number | undefined {
  const caps = readClientCapabilities(ctx);
  const extensions = caps?.extensions as Record<string, unknown> | undefined;
  const clientSettings = extensions?.[EXTENSION_ID] as ClientExtensionSettings | undefined;
  return clientSettings?.maxHandleBytes;
}

export function readPresentedHandle(ctx: ServerContext): string | undefined {
  const requestMeta = readRequestMeta(ctx);
  const handle = requestMeta?.handle;
  return typeof handle === 'string' && handle.length > 0 ? handle : undefined;
}
