import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { VectorPleaseError, type Conversion, type VectorPlease } from '@vectorplease/sdk';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { ImageInputError, loadImage } from './image';

/** The part of the SDK the server uses; tests pass a fake. */
export type Sdk = Pick<VectorPlease, 'convert' | 'getConversion' | 'listPresets'>;

export interface ServerOptions {
  sdk: Sdk;
  fetch?: typeof fetch;
  version?: string;
}

const params = z
  .object({
    paletteSize: z.number().int().min(2).max(32).optional(),
    borderWidth: z.number().int().min(1).max(64).optional(),
    filterSpeckle: z.number().int().min(0).max(64).optional(),
    cornerThreshold: z.number().min(0).max(180).optional(),
    pathPrecision: z.number().int().min(0).max(4).optional(),
  })
  .describe('Optional overrides; see list_presets for starting points.');

const metricsShape = {
  id: z.string(),
  status: z.string(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  failures: z.array(z.string()).optional(),
  savedTo: z.string().optional(),
};

/** Drops keys whose value is undefined (the SDK's types use exact optional properties). */
const withoutUndefined = <T extends Record<string, unknown>>(
  value: T,
): { [K in keyof T]: Exclude<T[K], undefined> } =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as {
    [K in keyof T]: Exclude<T[K], undefined>;
  };

const errorResult = (message: string): CallToolResult => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

/** Errors a model can act on become tool errors; anything else is a bug and propagates. */
async function guarded(run: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ImageInputError) return errorResult(error.message);
    if (error instanceof VectorPleaseError) return errorResult(`${error.code}: ${error.message}`);
    throw error;
  }
}

function conversionResult(conversion: Conversion, savedTo?: string): CallToolResult {
  const summary =
    conversion.status === 'succeeded'
      ? 'The sticker SVG passed every quality check.'
      : `The SVG missed a quality check (${conversion.failures.join(', ')}). Review it before printing.`;
  const content: CallToolResult['content'] = [
    {
      type: 'text',
      text: `${summary}\n${JSON.stringify({ id: conversion.id, metrics: conversion.metrics }, null, 2)}`,
    },
  ];
  if (savedTo) content.push({ type: 'text', text: `Saved to ${savedTo}` });
  else if (conversion.svg) content.push({ type: 'text', text: conversion.svg });
  else
    content.push({
      type: 'text',
      text: 'The SVG is no longer available (retention window passed).',
    });
  return {
    content,
    structuredContent: {
      id: conversion.id,
      status: conversion.status,
      metrics: conversion.metrics,
      failures: conversion.failures,
      ...(savedTo ? { savedTo } : {}),
    },
  };
}

export function createServer({
  sdk,
  fetch: fetchImpl = fetch,
  version = '0.0.0',
}: ServerOptions): McpServer {
  const server = new McpServer({ name: 'vectorplease', version });

  server.registerTool(
    'convert_image',
    {
      title: 'Convert an image to a sticker SVG',
      description:
        'Turns a PNG, JPEG or WebP image into a sticker-ready SVG with a white border and a die-cut ' +
        'outline. Give exactly one of path, url (https) or base64. Returns the SVG and quality metrics, ' +
        'or writes the SVG to outputPath.',
      inputSchema: {
        path: z.string().optional().describe('Local image file'),
        url: z.string().url().optional().describe('https URL of the image'),
        base64: z.string().optional().describe('Base64-encoded image'),
        preset: z.string().optional().describe('Preset name from list_presets'),
        params: params.optional(),
        outputPath: z.string().optional().describe('Write the SVG here instead of returning it'),
      },
      outputSchema: metricsShape,
    },
    (input) =>
      guarded(async () => {
        const image = await loadImage(input, fetchImpl);
        const conversion = await sdk.convert({
          image,
          ...(input.preset ? { preset: input.preset } : {}),
          ...(input.params ? { params: withoutUndefined(input.params) } : {}),
        });
        if (input.outputPath && conversion.svg) {
          await writeFile(input.outputPath, conversion.svg);
          return conversionResult(conversion, input.outputPath);
        }
        return conversionResult(conversion);
      }),
  );

  server.registerTool(
    'get_conversion',
    {
      title: 'Get a conversion',
      description: 'Fetches a conversion by id, for example one that was still running.',
      inputSchema: { id: z.string().describe('Conversion id') },
      outputSchema: metricsShape,
    },
    ({ id }) =>
      guarded(async () => {
        const result = await sdk.getConversion(id);
        if (result.status === 'pending') {
          return {
            content: [
              { type: 'text', text: `Conversion ${id} is still running. Try again shortly.` },
            ],
            structuredContent: { id, status: 'pending' },
          };
        }
        return conversionResult(result);
      }),
  );

  server.registerTool(
    'list_presets',
    {
      title: 'List presets',
      description: 'Lists the conversion presets: one starting point per kind of artwork.',
      annotations: { readOnlyHint: true },
    },
    () =>
      guarded(async () => {
        const presets = await sdk.listPresets();
        return {
          content: [{ type: 'text', text: JSON.stringify(presets, null, 2) }],
          structuredContent: { presets },
        };
      }),
  );

  return server;
}
