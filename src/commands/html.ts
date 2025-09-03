import { writeOutput } from "../io/output";
import { createHttpClient } from "../net/http";
import { parseOgAndMetaFromHTML } from "../parsers/html-meta";
import { makeCacheKey, readCache, writeCache } from "../utils/cache";

type Format = "json" | "yaml" | "csv";

type HtmlOptions = {
  url?: string;
  format: Format;
  stdout: boolean;
  outFile?: string;
  userAgent?: string;
  timeoutMs: number;
  retries: number;
  cache: boolean;
};

export async function htmlCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  if (options.url == null) {
    console.error(
      "Missing <url>. Usage: bun relparse html <url> [--format json|yaml|csv] [--out path] [--stdout]",
    );
    return;
  }
  const url: string = options.url;

  const http = createHttpClient({
    userAgent: options.userAgent,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
  });

  const cacheKey = makeCacheKey(`html:${url}:${options.userAgent ?? ""}`);
  if (options.cache) {
    const cached = await readCache(cacheKey);
    if (cached) {
      const { result: cachedResult } = await parseOgAndMetaFromHTML(
        new Response(cached).body as ReadableStream<Uint8Array>,
        url,
      );
      await writeOutput({
        data: cachedResult,
        format: options.format,
        stdout: options.stdout,
        outFile: options.outFile,
      });
      return;
    }
  }

  const res = await http.fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  if (!res.body) {
    throw new Error("No response body");
  }

  const stream = res.body as ReadableStream<Uint8Array>;
  const { result: parsedResult } = await parseOgAndMetaFromHTML(stream, url);
  if (options.cache) {
    const buf = new Uint8Array(await res.clone().arrayBuffer());
    await writeCache(cacheKey, buf);
  }
  await writeOutput({
    data: parsedResult,
    format: options.format,
    stdout: options.stdout,
    outFile: options.outFile,
  });
}

function parseArgs(args: string[]): HtmlOptions {
  const out: HtmlOptions = {
    format: "json",
    stdout: false,
    timeoutMs: 15_000,
    retries: 2,
    cache: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!out.url && a && !a.startsWith("-")) {
      out.url = a;
      continue;
    }
    if (a === "--format" && args[i + 1]) {
      out.format = args[++i] as Format;
      continue;
    }
    if (a === "--stdout") {
      out.stdout = true;
      continue;
    }
    if (a === "--cache") {
      out.cache = true;
      continue;
    }
    if (a === "--out" && args[i + 1]) {
      const next = args[++i];
      if (typeof next === "string" && next.length > 0) {
        out.outFile = next;
      }
      continue;
    }
    if (a === "--ua" && args[i + 1]) {
      out.userAgent = args[++i];
      continue;
    }
    if (a === "--timeout" && args[i + 1]) {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n > 0) {
        out.timeoutMs = Math.floor(n);
      }
      continue;
    }
    if (a === "--retries" && args[i + 1]) {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n >= 0) {
        out.retries = Math.floor(n);
      }
    }
  }
  return out;
}
