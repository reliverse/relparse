import { createHashKey } from "./hash";

const CACHE_DIR = ".parser-cache";

export type CacheEntry = {
  key: string;
  createdAt: number;
  ttlMs?: number;
};

export async function readCache(key: string): Promise<Uint8Array | null> {
  const path = `${CACHE_DIR}/${key}`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    return null;
  }
  return new Uint8Array(await file.arrayBuffer());
}

export async function writeCache(key: string, data: Uint8Array): Promise<void> {
  await Bun.write(`${CACHE_DIR}/${key}`, data);
}

export async function clearCache(): Promise<void> {
  // Clear by rewriting an empty directory: remove files individually
  const glob = new Bun.Glob(`${CACHE_DIR}/*`);
  for await (const path of glob.scan()) {
    await Bun.write(path, new Uint8Array());
    await Bun.$`rm -f ${path}`;
  }
}

export function makeCacheKey(input: string): string {
  return createHashKey(input);
}
