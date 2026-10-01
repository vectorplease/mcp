import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { describe, expect, it } from 'vitest';

describe('stdio transport', () => {
  it('starts the CLI and lists the tools', async () => {
    const client = new Client({ name: 'stdio-test', version: '0.0.0' });
    await client.connect(
      new StdioClientTransport({
        command: 'pnpm',
        args: ['exec', 'tsx', 'src/cli.ts'],
        env: { ...(process.env as Record<string, string>), VECTORPLEASE_API_KEY: 'vp_test_stdio' },
      }),
    );
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'convert_image',
      'get_conversion',
      'list_presets',
    ]);
    await client.close();
  }, 30_000);
});
