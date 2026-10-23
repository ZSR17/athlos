import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

// Downloads a picture from a link pasted in the app, for the server to store it like an upload.
// The server sits on a private network: a link must not make it fetch something inside it (router,
// other services), so private, loopback and link-local addresses are refused, after every redirect.

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;
// Some sites refuse requests that do not say who they come from.
const USER_AGENT = 'Mozilla/5.0 (compatible; Athlos; +https://github.com/ZSR17/athlos)';

export class ImageFetchError extends Error {
  constructor(readonly reason: 'invalid_url' | 'fetch_failed' | 'not_an_image' | 'too_large') {
    super(reason);
  }
}

const blocked = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['224.0.0.0', 3],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv4');
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blocked.addSubnet(net, prefix, 'ipv6');
}

function isPublic(address: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  const ip = mapped ?? address;
  return !blocked.check(ip, isIP(ip) === 6 ? 'ipv6' : 'ipv4');
}

async function checkUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ImageFetchError('invalid_url');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ImageFetchError('invalid_url');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new ImageFetchError('fetch_failed');
  if (!addresses.every(isPublic)) throw new ImageFetchError('invalid_url');
  return url;
}

// Returns the bytes and their type (image/... as announced by the site).
export async function fetchImage(raw: string): Promise<{ data: Buffer; mime: string }> {
  let url = await checkUrl(raw);
  let res: Response;
  for (let redirects = 0; ; redirects++) {
    try {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'image/*', 'user-agent': USER_AGENT } });
    } catch {
      throw new ImageFetchError('fetch_failed');
    }
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) break;
    if (redirects >= MAX_REDIRECTS) throw new ImageFetchError('fetch_failed');
    url = await checkUrl(new URL(location, url).href);
  }
  if (!res.ok || !res.body) throw new ImageFetchError('fetch_failed');
  const mime = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (!mime.startsWith('image/')) throw new ImageFetchError('not_an_image');
  if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) throw new ImageFetchError('too_large');

  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for await (const chunk of res.body) {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES) throw new ImageFetchError('too_large');
      chunks.push(Buffer.from(chunk));
    }
  } catch (err) {
    throw err instanceof ImageFetchError ? err : new ImageFetchError('fetch_failed');
  }
  return { data: Buffer.concat(chunks), mime };
}
