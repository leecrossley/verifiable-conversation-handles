import { z } from 'zod';
import { getActiveConversation } from '../active-context.js';
import type { ConversationStore } from '../store.js';
import type { ConversationToolDefinition } from '../integrate.js';

export const memoryAppendSchema = z.object({ text: z.string() });
export const memoryReadSchema = z.object({});

export interface MemoryFixtureTools {
  memory_append: (args: { text: string }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  memory_read: () => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

/** Append to conversation memory using the canonical store mutation path. */
export function appendConversationMemory(store: ConversationStore, text: string): void {
  const active = getActiveConversation();
  if (!active) {
    return;
  }
  store.appendMemory(active.record.cid, text);
}

export function memoryFixtureTools(store: ConversationStore): MemoryFixtureTools {
  return {
    async memory_append(args: { text: string }) {
      const active = getActiveConversation();
      if (!active) {
        return { content: [{ type: 'text', text: 'no active conversation' }] };
      }
      if (!store.has(active.record.cid)) {
        return { content: [{ type: 'text', text: 'conversation not found' }] };
      }
      appendConversationMemory(store, args.text);
      return { content: [{ type: 'text', text: 'ok' }] };
    },

    async memory_read() {
      const active = getActiveConversation();
      if (!active) {
        return { content: [{ type: 'text', text: '[]' }] };
      }
      const record = store.get(active.record.cid);
      if (!record) {
        return { content: [{ type: 'text', text: '[]' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify(record.memory) }] };
    },
  };
}

export function memoryFixtureToolDefinitions(store: ConversationStore): Record<string, ConversationToolDefinition> {
  const tools = memoryFixtureTools(store);
  return {
    memory_append: {
      description: 'Append text to conversation-scoped memory',
      inputSchema: memoryAppendSchema,
      handler: async (args) => tools.memory_append(args as { text: string }),
    },
    memory_read: {
      description: 'Read conversation-scoped memory',
      inputSchema: memoryReadSchema,
      handler: async () => tools.memory_read(),
    },
  };
}
