import { writeOutput } from "../io/output";
import { createHttpClient } from "../net/http";

type Format = "json" | "yaml" | "csv";

type Options = {
  input?: string; // url or file path
  format: Format;
  stdout: boolean;
  outFile?: string;
  userAgent?: string;
  timeoutMs: number;
  retries: number;
};

export async function sitemapCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  if (options.input == null) {
    console.error(
      "Missing <url-or-file>. Usage: bun relparse sitemap <url-or-file> [--format json|yaml|csv] [--out path] [--stdout]",
    );
    return;
  }

  let xml: string;
  if (isLikelyUrl(options.input)) {
    const http = createHttpClient({
      userAgent: options.userAgent,
      timeoutMs: options.timeoutMs,
      retries: options.retries,
    });
    const res = await http.fetch(options.input);
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    xml = await res.text();
  } else {
    xml = await Bun.file(options.input).text();
  }

  const parsed = parseSitemap(xml);
  await writeOutput({
    data: parsed,
    format: options.format,
    stdout: options.stdout,
    outFile: options.outFile,
  });
}

function parseArgs(args: string[]): Options {
  const out: Options = {
    format: "json",
    stdout: false,
    timeoutMs: 15_000,
    retries: 2,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!out.input && a && !a.startsWith("-")) {
      out.input = a;
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

const URL_PREFIX_RE = /^(https?:)?\/\//i;
function isLikelyUrl(input: string): boolean {
  return URL_PREFIX_RE.test(input);
}

const URLSET_LOC_RE = /<url>\s*[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/url>/gim;
const SITEMAP_LOC_RE = /<sitemap>\s*[\s\S]*?<loc>([\s\S]*?)<\/loc>[\s\S]*?<\/sitemap>/gim;

function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const urls: string[] = [];
  const sitemaps: string[] = [];

  for (const m of xml.matchAll(URLSET_LOC_RE)) {
    const u = m[1]?.trim();
    if (u) {
      urls.push(u);
    }
  }

  for (const m of xml.matchAll(SITEMAP_LOC_RE)) {
    const u = m[1]?.trim();
    if (u) {
      sitemaps.push(u);
    }
  }

  return { urls, sitemaps };
}
