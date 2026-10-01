import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export class ImageInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageInputError';
  }
}

export interface ImageSource {
  path?: string | undefined;
  url?: string | undefined;
  base64?: string | undefined;
}

/** Loads exactly one of a local path, an https URL, or base64 data, with type and size limits. */
export async function loadImage(
  source: ImageSource,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | string> {
  const given = [source.path, source.url, source.base64].filter((value) => value !== undefined);
  if (given.length !== 1) throw new ImageInputError('Give exactly one of path, url or base64.');

  if (source.base64 !== undefined) {
    if (Buffer.byteLength(source.base64, 'base64') > MAX_IMAGE_BYTES) {
      throw new ImageInputError('The image is over 10 MB.');
    }
    return source.base64;
  }

  if (source.path !== undefined) {
    if (!EXTENSIONS.has(extname(source.path).toLowerCase())) {
      throw new ImageInputError('Only .png, .jpg, .jpeg and .webp files are supported.');
    }
    const info = await stat(source.path).catch(() => {
      throw new ImageInputError(`Cannot read ${source.path}.`);
    });
    if (!info.isFile()) throw new ImageInputError(`${source.path} is not a file.`);
    if (info.size > MAX_IMAGE_BYTES) throw new ImageInputError('The image is over 10 MB.');
    return new Uint8Array(await readFile(source.path));
  }

  const url = new URL(source.url as string);
  if (url.protocol !== 'https:') throw new ImageInputError('Only https URLs are supported.');
  const res = await fetchImpl(url, { redirect: 'follow' });
  if (!res.ok) throw new ImageInputError(`Downloading the image failed: HTTP ${res.status}.`);
  const type = res.headers.get('content-type') ?? '';
  if (!/^image\/(png|jpeg|webp)\b/.test(type)) {
    throw new ImageInputError(`The URL is not a PNG, JPEG or WebP image (${type || 'no type'}).`);
  }
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > MAX_IMAGE_BYTES) throw new ImageInputError('The image is over 10 MB.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new ImageInputError('The image is over 10 MB.');
  return bytes;
}
