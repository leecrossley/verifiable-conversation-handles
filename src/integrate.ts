import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { ConversationHandleManager, ToolHandler } from './extension.js';
import { EXTENSION_ID } from './schema/draft/schema.js';

const memoryAppendSchema = z.object({ text: z.string() });
const memoryReadSchema = z.object({});

function inputSchemaFor(name: string) {
  if (name === 'memory_append') {
    return memoryAppendSchema;
  }
  if (name === 'memory_read') {
    return memoryReadSchema;
  }
  return z.object({});
}

export function registerConversationTools(
  mcp: McpServer,
  manager: ConversationHandleManager,
  tools: Record<string, ToolHandler>,
): void {
  mcp.server.registerCapabilities({
    extensions: {
      [EXTENSION_ID]: manager.extensionSettings(),
    },
  });

  for (const [name, handler] of Object.entries(tools)) {
    mcp.registerTool(
      name,
      {
        description: `Fixture tool: ${name}`,
        inputSchema: inputSchemaFor(name),
      },
      async (args, ctx) => {
        const result = await manager.invokeToolHandler(ctx, args as Record<string, unknown>, handler);
        return {
          content: result.content,
          ...(result.isError ? { isError: true as const } : {}),
          ...(result._meta ? { _meta: result._meta } : {}),
        };
      },
    );
  }
}
