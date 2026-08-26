import { createConversationFixtureApp } from '../../src/fixtures/app.js';
import { serveMcp } from '../../src/http-server.js';
import type { HandleKey } from '../../src/codec.js';

const PORT = Number(process.env.PORT ?? 3847);

const keys: HandleKey[] = [
  { keyId: 0, secret: Buffer.from('test-key-primary-32bytes!!!!!!') },
  { keyId: 1, secret: Buffer.from('test-key-secondary-32bytes!!!!!') },
];

const app = createConversationFixtureApp({
  keys,
  resolvePrincipal: (ctx) => {
    const auth = ctx.http?.authInfo;
    if (!auth?.extra?.principal || typeof auth.extra.principal !== 'string') {
      return undefined;
    }
    return auth.extra.principal;
  },
  settings: {
    handleLifetimeSeconds: 3600,
    conversationRetentionSeconds: 86_400,
    onMissingHandle: 'new-conversation',
    typicalHandleBytes: 100,
  },
  serverName: 'conversation-handle-reference',
  serverVersion: '0.1.0',
});

serveMcp(app.handler, { port: PORT }).then((http) => {
  console.error(`reference server listening on ${http.url}`);
});
