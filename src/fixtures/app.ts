import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import type { AuthInfo } from '@modelcontextprotocol/server';
import {
  conversationHandlePlugin,
  type ConversationHandlePluginOptions,
} from '../extension.js';
import { registerConversationTools, type ConversationToolDefinition } from '../integrate.js';
import type { ConversationStore } from '../store.js';
import { ifcFixtureToolDefinitions, TaintJournal } from './ifc-tools.js';
import { encodeMemoryHead } from './memory-head.js';
import { memoryFixtureToolDefinitions } from './memory-tools.js';

export interface FixtureAppOptions extends ConversationHandlePluginOptions {
  serverName?: string;
  serverVersion?: string;
}

export interface FixtureApp {
  manager: ReturnType<typeof conversationHandlePlugin>;
  createMcpServer: () => McpServer;
  handler: { fetch: (request: Request, options?: { authInfo?: AuthInfo }) => Promise<Response> };
}

export type FixtureToolsFactory = (store: ConversationStore) => Record<string, ConversationToolDefinition>;

function createFixtureApp(
  options: FixtureAppOptions,
  toolsFactory: FixtureToolsFactory,
): FixtureApp {
  const manager = conversationHandlePlugin(options);
  const { serverName = 'conversation-handle-fixture', serverVersion = '0.1.0' } = options;
  const tools = toolsFactory(manager.store);

  const createMcpServer = () => {
    const mcp = new McpServer({ name: serverName, version: serverVersion });
    registerConversationTools(mcp, manager, tools);
    return mcp;
  };

  return { manager, createMcpServer, handler: createMcpHandler(createMcpServer) };
}

export type ConversationFixtureAppOptions = FixtureAppOptions;

/** Memory fixture: memory head encoded in handle state commitment; rotation on append via commitment drift. */
export function createConversationFixtureApp(options: ConversationFixtureAppOptions): FixtureApp {
  return createFixtureApp(
    {
      ...options,
      stateCommitment: options.stateCommitment ?? ((record) => encodeMemoryHead(record.memory)),
    },
    memoryFixtureToolDefinitions,
  );
}

export interface IfcFixtureAppOptions extends FixtureAppOptions {
  journal?: TaintJournal;
}

export interface IfcFixtureApp extends FixtureApp {
  journal: TaintJournal;
}

/** IFC fixture: taint journal keyed on cid; label head encoded in handle state commitment. */
export function createIfcFixtureApp(options: IfcFixtureAppOptions): IfcFixtureApp {
  const journal = options.journal ?? new TaintJournal();
  const { journal: _journal, resolveOnMissingHandle, ...pluginOptions } = options;
  const app = createFixtureApp(
    {
      ...pluginOptions,
      stateCommitment: (record) => journal.head(record.cid),
      resolveOnMissingHandle: (ctx) => {
        const principal = pluginOptions.resolvePrincipal(ctx);
        if (principal && journal.shouldRejectMissingHandle(principal)) {
          return 'reject';
        }
        return resolveOnMissingHandle?.(ctx);
      },
    },
    (store) => ifcFixtureToolDefinitions(store, journal),
  );
  return { ...app, journal };
}
