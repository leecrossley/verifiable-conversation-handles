import { createServer, type Server as HttpServer } from 'node:http';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { fetchMcp } from './http-auth.js';

export interface McpHttpHandler {
  fetch: (request: Request, options?: { authInfo?: AuthInfo }) => Promise<Response>;
}

export interface ServeMcpOptions {
  port: number;
  host?: string;
  pathPrefix?: string;
}

export interface McpHttpServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

interface ListenerOptions {
  host: string;
  port: number;
  pathPrefix: string;
}

function createMcpHttpListener(
  handler: McpHttpHandler,
  options: ListenerOptions,
): Promise<McpHttpServer> {
  const { host, port, pathPrefix } = options;

  return new Promise((resolve, reject) => {
    const httpServer: HttpServer = createServer(async (req, res) => {
      if (!req.url?.startsWith(pathPrefix)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      try {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = Buffer.concat(chunks);
        const request = new Request(`http://${host}:${port}${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: body.length > 0 ? body : undefined,
        });
        const response = await fetchMcp(handler, request);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        res.end(Buffer.from(await response.arrayBuffer()));
      } catch (error) {
        res.writeHead(500);
        res.end(String(error));
      }
    });

    httpServer.listen(port, host, () => {
      const addr = httpServer.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('failed to bind HTTP server'));
        return;
      }
      resolve({
        port: addr.port,
        url: `http://${host}:${addr.port}${pathPrefix}`,
        close: () =>
          new Promise<void>((res, rej) => {
            httpServer.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

export function serveMcp(handler: McpHttpHandler, options: ServeMcpOptions): Promise<McpHttpServer> {
  return createMcpHttpListener(handler, {
    host: options.host ?? '127.0.0.1',
    port: options.port,
    pathPrefix: options.pathPrefix ?? '/mcp',
  });
}

export function serveMcpEphemeral(handler: McpHttpHandler, pathPrefix = '/mcp'): Promise<McpHttpServer> {
  return createMcpHttpListener(handler, {
    host: '127.0.0.1',
    port: 0,
    pathPrefix,
  });
}
