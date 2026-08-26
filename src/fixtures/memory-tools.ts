import { getActiveConversation } from '../active-context.js';
import type { ConversationStore } from '../store.js';

export interface MemoryFixtureTools {
  memory_append: (args: { text: string }) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
  memory_read: () => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

export function memoryFixtureTools(store: ConversationStore): MemoryFixtureTools {
  return {
    async memory_append(args: { text: string }) {
      const active = getActiveConversation();
      if (!active) {
        return { content: [{ type: 'text', text: 'no active conversation' }] };
      }
      const record = store.get(active.record.cid);
      if (!record) {
        return { content: [{ type: 'text', text: 'conversation not found' }] };
      }
      store.update(active.record.cid, { memory: [...record.memory, args.text] });
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
