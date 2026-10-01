import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { VectorPleaseError, type Conversion, type Preset } from '@vectorplease/sdk';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Sdk } from '../src/server';

const conversion: Conversion = {
  id: '11111111-1111-4111-8111-111111111111',
  status: 'succeeded',
  svg: '<svg id="sticker"/>',
  metrics: {
    width: 10,
    height: 10,
    ssim: 0.97,
    pathCount: 3,
    nodeCount: 20,
    outerContourCount: 1,
    bytes: 19,
  },
  failures: [],
};
const presets: Preset[] = [{ name: 'logo', description: 'Logos', params: { paletteSize: 6 } }];

function fakeSdk(overrides: Partial<Sdk> = {}) {
  return {
    convert: vi.fn<Sdk['convert']>(async () => conversion),
    getConversion: vi.fn<Sdk['getConversion']>(async () => conversion),
    listPresets: vi.fn<Sdk['listPresets']>(async () => presets),
    ...overrides,
  };
}

let client: Client;
async function connect(sdk: Sdk, fetchImpl?: typeof fetch) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await createServer({ sdk, ...(fetchImpl ? { fetch: fetchImpl } : {}) }).connect(serverTransport);
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(clientTransport);
  return client;
}
afterEach(async () => {
  await client?.close();
});

const text = (result: Awaited<ReturnType<Client['callTool']>>) =>
  (result.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');

describe('tools', () => {
  it('lists exactly the three tools, with input schemas', async () => {
    const { tools } = await (await connect(fakeSdk())).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'convert_image',
      'get_conversion',
      'list_presets',
    ]);
    const convert = tools.find((t) => t.name === 'convert_image');
    expect(Object.keys(convert?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(['path', 'url', 'base64', 'preset', 'params', 'outputPath']),
    );
  });

  it('convert_image sends base64 with preset and params, and returns the SVG and metrics', async () => {
    const sdk = fakeSdk();
    const result = await (
      await connect(sdk)
    ).callTool({
      name: 'convert_image',
      arguments: { base64: 'AQID', preset: 'logo', params: { borderWidth: 6 } },
    });

    expect(sdk.convert).toHaveBeenCalledWith({
      image: 'AQID',
      preset: 'logo',
      params: { borderWidth: 6 },
    });
    expect(result.isError).toBeFalsy();
    expect(text(result)).toContain('passed every quality check');
    expect(text(result)).toContain('<svg id="sticker"/>');
    expect(result.structuredContent).toMatchObject({
      id: conversion.id,
      status: 'succeeded',
      metrics: { ssim: 0.97 },
    });
  });

  it('convert_image reads a local file and can write the SVG to outputPath', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vp-mcp-'));
    await writeFile(join(dir, 'logo.png'), new Uint8Array([137, 80, 78, 71]));
    const sdk = fakeSdk();

    const result = await (
      await connect(sdk)
    ).callTool({
      name: 'convert_image',
      arguments: { path: join(dir, 'logo.png'), outputPath: join(dir, 'logo.svg') },
    });

    expect(vi.mocked(sdk.convert).mock.calls[0]?.[0].image).toEqual(
      new Uint8Array([137, 80, 78, 71]),
    );
    expect(await readFile(join(dir, 'logo.svg'), 'utf8')).toBe(conversion.svg);
    expect(text(result)).not.toContain('<svg');
    expect(result.structuredContent).toMatchObject({ savedTo: join(dir, 'logo.svg') });
  });

  it('convert_image downloads an https URL', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }),
    ) as unknown as typeof fetch;
    const sdk = fakeSdk();
    await (
      await connect(sdk, fetchImpl)
    ).callTool({
      name: 'convert_image',
      arguments: { url: 'https://example.com/a.png' },
    });
    expect(vi.mocked(sdk.convert).mock.calls[0]?.[0].image).toEqual(new Uint8Array([1, 2]));
  });

  it('warns when the result missed a quality check', async () => {
    const sdk = fakeSdk({
      convert: vi.fn(async () => ({
        ...conversion,
        status: 'failed' as const,
        failures: ['low_ssim' as const],
      })),
    });
    const result = await (
      await connect(sdk)
    ).callTool({ name: 'convert_image', arguments: { base64: 'AQID' } });
    expect(text(result)).toContain('missed a quality check (low_ssim)');
  });

  it.each([
    ['no image', {}, /exactly one of path, url or base64/],
    ['two images', { base64: 'AQID', url: 'https://example.com/a.png' }, /exactly one/],
    ['a non-image file', { path: '/etc/passwd' }, /Only \.png/],
    ['a plain http URL', { url: 'http://example.com/a.png' }, /Only https/],
  ])('returns a tool error for %s, without calling the API', async (_name, args, message) => {
    const sdk = fakeSdk();
    const result = await (await connect(sdk)).callTool({ name: 'convert_image', arguments: args });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(message);
    expect(sdk.convert).not.toHaveBeenCalled();
  });

  it('turns API errors into tool errors the model can read', async () => {
    const sdk = fakeSdk({
      convert: vi.fn(async () => {
        throw new VectorPleaseError('The image has no visible pixels', {
          status: 422,
          code: 'empty_image',
        });
      }),
    });
    const result = await (
      await connect(sdk)
    ).callTool({ name: 'convert_image', arguments: { base64: 'AQID' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toBe('empty_image: The image has no visible pixels');
  });

  it('get_conversion reports a pending conversion and returns a finished one', async () => {
    const sdk = fakeSdk({
      getConversion: vi
        .fn<Sdk['getConversion']>()
        .mockResolvedValueOnce({ id: conversion.id, status: 'pending' })
        .mockResolvedValueOnce(conversion),
    });
    const c = await connect(sdk);
    const pending = await c.callTool({ name: 'get_conversion', arguments: { id: conversion.id } });
    expect(text(pending)).toContain('still running');
    const done = await c.callTool({ name: 'get_conversion', arguments: { id: conversion.id } });
    expect(done.structuredContent).toMatchObject({ status: 'succeeded' });
  });

  it('get_conversion says when the SVG has expired', async () => {
    const sdk = fakeSdk({ getConversion: vi.fn(async () => ({ ...conversion, svg: null })) });
    const result = await (
      await connect(sdk)
    ).callTool({ name: 'get_conversion', arguments: { id: conversion.id } });
    expect(text(result)).toContain('no longer available');
  });

  it('list_presets returns the presets from the API', async () => {
    const result = await (
      await connect(fakeSdk())
    ).callTool({ name: 'list_presets', arguments: {} });
    expect(result.structuredContent).toEqual({ presets });
  });
});
