import { Client } from '@modelcontextprotocol/client';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { HandleKey } from '../src/codec.js';
import { ConversationHandleClient } from '../src/client.js';
import { createConversationFixtureApp } from '../src/fixtures/app.js';
import { memoryFixtureTools } from '../src/fixtures/memory-tools.js';
import { serveMcpEphemeral } from '../src/http-server.js';
import { EXTENSION_ID, ERROR_CODE_HANDLE_NOT_RECOGNIZED } from '../src/schema/draft/schema.js';

export const TEST_KEYS: HandleKey[] = [
  { keyId: 0, secret: Buffer.from('test-key-primary-32bytes!!!!!!') },
  { keyId: 1, secret: Buffer.from('test-key-secondary-32bytes!!!!!') },
];

export interface TestHarnessOptions {
  onMissingHandle?: 'new-conversation' | 'none';
  now?: () => number;
  retentionSeconds?: number;
  maxHandleBytes?: number;
}

export interface TestHarness {
  url: string;
  port: number;
  close: () => Promise<void>;
  manager: ReturnType<typeof createConversationFixtureApp>['manager'];
}

export async function startTestHarness(options: TestHarnessOptions = {}): Promise<TestHarness> {
  const app = createConversationFixtureApp({
    keys: TEST_KEYS,
    resolvePrincipal: (ctx) => {
      const principal = ctx.http?.authInfo?.extra?.principal;
      return typeof principal === 'string' ? principal : undefined;
    },
    now: options.now,
    settings: {
      handleLifetimeSeconds: 3600,
      conversationRetentionSeconds: options.retentionSeconds ?? 86_400,
      onMissingHandle: options.onMissingHandle ?? 'new-conversation',
      maxHandleBytes: options.maxHandleBytes ?? 1024,
    },
    serverName: 'conversation-handle-test',
    serverVersion: '0.0.0',
  });

  const http = await serveMcpEphemeral(app.handler);
  return {
    url: http.url,
    port: http.port,
    manager: app.manager,
    close: async () => {
      await http.close();
    },
  };
}

export async function withClient<T>(
  harness: TestHarness,
  token: string | undefined,
  fn: (client: Client, handleClient: ConversationHandleClient) => Promise<T>,
): Promise<T> {
  const transport = new StreamableHTTPClientTransport(new URL(harness.url), {
    requestInit: token
      ? {
          headers: { Authorization: `Bearer ${token}` },
        }
      : undefined,
  });
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const handleClient = new ConversationHandleClient({ maxHandleBytes: 1024 });
  await client.connect(transport);
  try {
    return await fn(client, handleClient);
  } finally {
    await client.close();
  }
}

export async function callMemoryAppend(
  client: Client,
  handleClient: ConversationHandleClient,
  text: string,
  sessionKey = 'default',
): Promise<{ result: unknown; handleMeta: unknown }> {
  const result = await client.callTool({
    name: 'memory_append',
    arguments: { text },
    _meta: handleClient.buildRequestMeta(sessionKey),
  });
  const meta = (result as { _meta?: Record<string, unknown> })._meta?.[EXTENSION_ID];
  handleClient.acceptResponseMeta((result as { _meta?: Record<string, unknown> })._meta, sessionKey);
  return { result, handleMeta: meta };
}

export async function callMemoryRead(
  client: Client,
  handleClient: ConversationHandleClient,
  sessionKey = 'default',
): Promise<{ result: unknown; handleMeta: unknown }> {
  const result = await client.callTool({
    name: 'memory_read',
    arguments: {},
    _meta: handleClient.buildRequestMeta(sessionKey),
  });
  handleClient.acceptResponseMeta((result as { _meta?: Record<string, unknown> })._meta, sessionKey);
  return { result, handleMeta: metaFromResult(result) };
}

export function metaFromResult(result: unknown): unknown {
  return (result as { _meta?: Record<string, unknown> })._meta?.[EXTENSION_ID];
}

export function textFromResult(result: unknown): string {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  return content?.[0]?.text ?? '';
}

export { memoryFixtureTools, ERROR_CODE_HANDLE_NOT_RECOGNIZED };
