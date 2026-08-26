import { AsyncLocalStorage } from 'node:async_hooks';
import type { ActiveConversation } from './presentation.js';

const storage = new AsyncLocalStorage<ActiveConversation>();

export function getActiveConversation(): ActiveConversation | undefined {
  return storage.getStore();
}

export async function runWithActiveConversation<T>(
  conversation: ActiveConversation | null,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (!conversation) {
    return fn();
  }
  return storage.run(conversation, fn);
}
