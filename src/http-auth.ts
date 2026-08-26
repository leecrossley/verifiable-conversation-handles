import type { AuthInfo } from '@modelcontextprotocol/server';

const TOKEN_PRINCIPALS: Record<string, string> = {
  alice: 'alice',
  bob: 'bob',
  'alice-token': 'alice',
  'bob-token': 'bob',
};

export function authInfoFromRequest(request: Request): AuthInfo | undefined {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) {
    return undefined;
  }
  const token = header.slice('Bearer '.length).trim();
  const principal = TOKEN_PRINCIPALS[token];
  if (!principal) {
    return undefined;
  }
  return {
    token,
    clientId: token,
    scopes: [],
    extra: { principal },
  };
}

export async function fetchMcp(
  handler: { fetch: (request: Request, options?: { authInfo?: AuthInfo }) => Promise<Response> },
  request: Request,
): Promise<Response> {
  return handler.fetch(request, { authInfo: authInfoFromRequest(request) });
}
