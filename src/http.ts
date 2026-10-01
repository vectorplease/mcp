import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer as createHttpServer, type Server } from 'node:http';

/**
 * Streamable HTTP transport, stateless: a fresh MCP server per request. Binds to localhost by
 * default; the API key is the server's own, so do not expose it to untrusted networks.
 */
export function startHttpServer(options: {
  createMcpServer: () => McpServer;
  port: number;
  host?: string;
}): Promise<Server> {
  const http = createHttpServer(async (req, res) => {
    if (req.url !== '/mcp') {
      res.writeHead(404).end();
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json', allow: 'POST' }).end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method not allowed' },
          id: null,
        }),
      );
      return;
    }
    const server = options.createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  return new Promise((resolve) => {
    http.listen(options.port, options.host ?? '127.0.0.1', () => resolve(http));
  });
}
