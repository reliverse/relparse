import { writeOutput } from "../io/output";
import { createHttpClient } from "../net/http";

type Format = "json" | "yaml" | "csv";

type RssOptions = {
  url?: string;
  format: Format;
  stdout: boolean;
  outFile?: string;
  userAgent?: string;
  timeoutMs: number;
  retries: number;
};

export async function rssCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  if (options.url == null) {
    console.error(
      "Missing <url>. Usage: bun relparse rss <url> [--format json|yaml|csv] [--out path] [--stdout]",
    );
    return;
  }
  const url: string = options.url;

  const http = createHttpClient({
    userAgent: options.userAgent,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
  });

  const res = await http.fetch(url);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  const xml = await res.text();
  const items = parseRssOrAtom(xml);

  await writeOutput({
    data: { url, items },
    format: options.format,
    stdout: options.stdout,
    outFile: options.outFile,
  });
}

function parseArgs(args: string[]): RssOptions {
  const out: RssOptions = {
    format: "json",
    stdout: false,
    timeoutMs: 15_000,
    retries: 2,
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

const RSS_ITEM_RE = /<item[\s\S]*?<\/item>/gim;
const ATOM_ENTRY_RE = /<entry[\s\S]*?<\/entry>/gim;
const TITLE_RE = /<title[\s\S]*?>([\s\S]*?)<\/title>/i;
const LINK_RE = /<link[\s\S]*?>([\s\S]*?)<\/link>/i;
const GUID_RE = /<guid[\s\S]*?>([\s\S]*?)<\/guid>/i;
const PUBDATE_RE = /<pubDate[\s\S]*?>([\s\S]*?)<\/pubDate>/i;
const ATOM_TITLE_RE = /<title[\s\S]*?>([\s\S]*?)<\/title>/i;
const ATOM_LINK_HREF_RE = /<link[^>]*?href=["']([^"']+)["'][^>]*?\/>/i;
const ATOM_ID_RE = /<id[\s\S]*?>([\s\S]*?)<\/id>/i;
const ATOM_UPDATED_RE = /<updated[\s\S]*?>([\s\S]*?)<\/updated>/i;

function parseRssOrAtom(xml: string): Readonly<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];

  const rssItems = xml.match(RSS_ITEM_RE) ?? [];
  for (const raw of rssItems) {
    const title = TITLE_RE.exec(raw)?.[1]?.trim();
    const link = LINK_RE.exec(raw)?.[1]?.trim();
    const guid = GUID_RE.exec(raw)?.[1]?.trim();
    const pubDate = PUBDATE_RE.exec(raw)?.[1]?.trim();
    items.push({ type: "rss", title, link, guid, pubDate });
  }

  const atomEntries = xml.match(ATOM_ENTRY_RE) ?? [];
  for (const raw of atomEntries) {
    const title = ATOM_TITLE_RE.exec(raw)?.[1]?.trim();
    const link = ATOM_LINK_HREF_RE.exec(raw)?.[1]?.trim();
    const id = ATOM_ID_RE.exec(raw)?.[1]?.trim();
    const updated = ATOM_UPDATED_RE.exec(raw)?.[1]?.trim();
    items.push({ type: "atom", title, link, id, updated });
  }

  return items;
}
