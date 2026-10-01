#!/usr/bin/env node
// vectorplease-mcp            stdio (for MCP clients that launch the server)
// vectorplease-mcp --http     streamable HTTP on 127.0.0.1:3333/mcp (PORT, HOST to change)
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { VectorPlease } from '@vectorplease/sdk';
import { startHttpServer } from './http';
import { createServer } from './server';

const sdk = new VectorPlease({
  ...(process.env['VECTORPLEASE_BASE_URL']
    ? { baseUrl: process.env['VECTORPLEASE_BASE_URL'] }
    : {}),
});

if (process.argv.includes('--http')) {
  const port = Number(process.env['PORT'] ?? 3333);
  const host = process.env['HOST'] ?? '127.0.0.1';
  await startHttpServer({ createMcpServer: () => createServer({ sdk }), port, host });
  console.error(`vectorplease-mcp listening on http://${host}:${port}/mcp`);
} else {
  await createServer({ sdk }).connect(new StdioServerTransport());
}
