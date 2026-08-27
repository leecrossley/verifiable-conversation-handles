import type { McpServer } from '@modelcontextprotocol/server';
import type { z } from 'zod';
import type { ConversationHandleManager, ToolHandler } from './extension.js';
import { EXTENSION_ID } from './schema/draft/schema.js';

export interface ConversationToolDefinition {
  description?: string;
  inputSchema: z.ZodTypeAny;
  handler: ToolHandler;
}

export function registerConversationTools(
  mcp: McpServer,
  manager: ConversationHandleManager,
  tools: Record<string, ConversationToolDefinition>,
): void {
  mcp.server.registerCapabilities({
    extensions: {
      [EXTENSION_ID]: manager.extensionSettings(),
    },
  });

  for (const [name, tool] of Object.entries(tools)) {
    mcp.registerTool(
      name,
      {
        description: tool.description ?? `Conversation tool: ${name}`,
        inputSchema: tool.inputSchema,
      },
      async (args, ctx) => {
        const result = await manager.invokeToolHandler(ctx, args as Record<string, unknown>, tool.handler);
        return {
          content: result.content,
          ...(result.isError ? { isError: true as const } : {}),
          ...(result._meta ? { _meta: result._meta } : {}),
        };
      },
    );
  }
}
