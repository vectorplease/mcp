import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startHttpServer } from '../src/http';
import { createServer, type Sdk } from '../src/server';

const sdk: Sdk = {
  convert: async () => {
    throw new Error('not used');
  },
  getConversion: async () => {
    throw new Error('not used');
  },
  listPresets: async () => [{ name: 'logo', description: 'Logos', params: {} }],
};

let http: Server;
let base: string;
beforeAll(async () => {
  http = await startHttpServer({ createMcpServer: () => createServer({ sdk }), port: 0 });
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});
afterAll(() => {
  http.close();
});

describe('streamable HTTP transport', () => {
  it('serves the tools over /mcp', async () => {
    const client = new Client({ name: 'http-test', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
    const result = await client.callTool({ name: 'list_presets', arguments: {} });
    expect(result.structuredContent).toEqual({
      presets: [{ name: 'logo', description: 'Logos', params: {} }],
    });
    await client.close();
  });

  it('binds to localhost by default and rejects other paths and methods', async () => {
    expect((http.address() as AddressInfo).address).toBe('127.0.0.1');
    expect((await fetch(`${base}/other`)).status).toBe(404);
    expect((await fetch(`${base}/mcp`)).status).toBe(405);
  });
});
