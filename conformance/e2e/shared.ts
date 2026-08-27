import type { HandleKey } from '../../src/codec.js';

export const OTHER_SERVER_KEYS: HandleKey[] = [
  { keyId: 0, secret: Buffer.from('other-deployment-key-material!!') },
];
