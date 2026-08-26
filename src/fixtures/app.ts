import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { AuthInfo } from '@modelcontextprotocol/server';
import {
  conversationHandlePlugin,
  type ConversationHandlePluginOptions,
} from '../extension.js';
import { registerConversationTools } from '../integrate.js';
import type { ToolHandler } from '../extension.js';
import { memoryFixtureTools } from './memory-tools.js';

export interface ConversationFixtureAppOptions extends ConversationHandlePluginOptions {
  serverName?: string;
  serverVersion?: string;
}

export interface ConversationFixtureApp {
  manager: ReturnType<typeof conversationHandlePlugin>;
  createMcpServer: () => McpServer;
  handler: { fetch: (request: Request, options?: { authInfo?: AuthInfo }) => Promise<Response> };
}

/**
 * Shared fixture wiring: one manager lifetime, fresh McpServer per handler factory call.
 * Use this for harness and reference servers so conversation state persists across requests.
 */
export function createConversationFixtureApp(options: ConversationFixtureAppOptions): ConversationFixtureApp {
  const manager = conversationHandlePlugin(options);
  const { serverName = 'conversation-handle-fixture', serverVersion = '0.1.0' } = options;
  const tools = memoryFixtureTools(manager.store) as unknown as Record<string, ToolHandler>;

  const createMcpServer = () => {
    const mcp = new McpServer({ name: serverName, version: serverVersion });
    registerConversationTools(mcp, manager, tools);
    return mcp;
  };

  const handler = createMcpHandler(createMcpServer);

  return { manager, createMcpServer, handler };
}
