import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ImageInputError, loadImage, MAX_IMAGE_BYTES } from '../src/image';

const respond = (body: Uint8Array, headers: Record<string, string>, status = 200) =>
  (async () => new Response(body, { status, headers })) as unknown as typeof fetch;

describe('loadImage', () => {
  it('rejects files over the size limit and directories', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'vp-img-'));
    await writeFile(join(dir, 'big.png'), new Uint8Array(MAX_IMAGE_BYTES + 1));
    await expect(loadImage({ path: join(dir, 'big.png') })).rejects.toThrow(/over 10 MB/);
    await expect(loadImage({ path: `${dir}.png` })).rejects.toBeInstanceOf(ImageInputError);
  });

  it('rejects oversized base64', async () => {
    await expect(
      loadImage({ base64: 'A'.repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8) }),
    ).rejects.toThrow(/over 10 MB/);
  });

  it.each([
    [
      'a non-image content type',
      respond(new Uint8Array([1]), { 'content-type': 'text/html' }),
      /not a PNG, JPEG or WebP/,
    ],
    [
      'a failed download',
      respond(new Uint8Array(), { 'content-type': 'image/png' }, 404),
      /HTTP 404/,
    ],
    [
      'a declared size over the limit',
      respond(new Uint8Array([1]), {
        'content-type': 'image/png',
        'content-length': String(MAX_IMAGE_BYTES + 1),
      }),
      /over 10 MB/,
    ],
  ])('rejects a URL with %s', async (_name, fetchImpl, message) => {
    await expect(loadImage({ url: 'https://example.com/x' }, fetchImpl)).rejects.toThrow(message);
  });
});
