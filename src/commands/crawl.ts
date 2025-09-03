import { writeOutput } from "../io/output";
import { createHttpClient } from "../net/http";
import { parseOgAndMetaFromHTML } from "../parsers/html-meta";
import { withEnhancedSpinner } from "../utils/spinner/mod";

type Format = "json" | "yaml" | "csv";

type CrawlOptions = {
  baseUrl?: string;
  pages: string; // e.g. "1-15" or "1,3,10"
  perPage: number;
  format: Format;
  stdout: boolean;
  outFile?: string;
  userAgent?: string;
  timeoutMs: number;
  retries: number;
  getFields?: string[]; // flexible field names
  requireGet?: string[]; // fields that must be present and non-empty
  delayMs: number;
  // Target discovery/config flags
  targetHostname?: string;
  targetPathContains?: string;
  categoryLinkSelector?: string;
  targetRelativePrefix?: string;
  targetAbsoluteBase?: string;
  jsonldTypes: string[]; // case-insensitive, empty means "all detected types"
  // Agnostic extraction options
  extractAll: boolean; // extract all string properties
  extractProps?: string[]; // specific properties to extract
};

export async function crawlCommand(args: string[]): Promise<void> {
  if (args.includes("--help") || args.includes("-h")) {
    printCrawlHelp();
    return;
  }
  const options = parseArgs(args);
  if (options.baseUrl == null) {
    console.error("Missing <category-base-url>.");
    printCrawlHelp();
    return;
  }
  // Require --get with at least one field, or --extract-all
  const selectedFields = options.getFields ?? [];
  const hasAtLeastOneDataField = selectedFields.length > 0 || options.extractAll;
  if (!hasAtLeastOneDataField) {
    console.error("Missing --get with at least one field, or use --extract-all");
    printCrawlHelp();
    return;
  }

  // Validate required flags depending on mode (direct target vs category listing)
  let isDirectTarget = false;
  try {
    isDirectTarget = isTargetUrl(options, options.baseUrl);
  } catch (err) {
    console.error(String(err instanceof Error ? err.message : err));
    console.error("Tip: Provide --host and --path-contains to detect a direct target URL.");
    return;
  }
  if (!isDirectTarget) {
    const missing: string[] = [];
    if (!options.categoryLinkSelector) missing.push("--selector <css>");
    if (!options.targetRelativePrefix) missing.push("--rel-prefix <prefix>");
    if (!options.targetAbsoluteBase) missing.push("--abs-base <url>");
    if (missing.length > 0) {
      console.error(`Missing required flags for category crawl: ${missing.join(", ")}`);
      console.error("Tip: Use --host and --path-contains to also allow direct target detection.");
      printCrawlHelp();
      return;
    }
  }

  const http = createHttpClient({
    userAgent: options.userAgent,
    timeoutMs: options.timeoutMs,
    retries: options.retries,
  });

  const results: { page?: number; [key: string]: unknown }[] = [];

  await withEnhancedSpinner(
    {
      text: "Crawl: collecting results",
      showTiming: true,
      successText: "Crawl: done",
      failText: "Crawl: failed",
    },
    async (sp) => {
      if (options.baseUrl && isTargetUrl(options, options.baseUrl)) {
        sp.updateText("Fetching target page...");
        const entities = await processTargetUrl(http, options, options.baseUrl as string);
        for (const entity of entities) {
          const result: { page?: number; [key: string]: unknown } = { page: undefined };

          if (options.extractAll) {
            // Extract all string properties from entity
            for (const [key, value] of Object.entries(entity)) {
              if (typeof value === "string" && value.length > 0) {
                result[key] = value;
              }
            }
          } else {
            // Extract only requested fields
            for (const field of selectedFields) {
              if (field === "page") continue; // handled separately
              const value = entity[field as keyof typeof entity];
              if (value != null) {
                result[field] = value;
              }
            }
          }

          // Only include if we have at least one non-page field
          const hasData = Object.keys(result).some((k) => k !== "page" && result[k] != null);
          if (hasData && hasRequiredFields(result, options.requireGet)) {
            results.push(result);
          }
        }
        return;
      }

      const pageNumbers = expandPages(options.pages);
      const totalPages = pageNumbers.length;
      let processedPages = 0;

      for (const page of pageNumbers) {
        processedPages++;
        sp.setProgress(processedPages, totalPages, "Pages");
        const url = joinUrl(options.baseUrl as string, String(page));
        const res = await http.fetch(url);
        if (!res.ok) {
          continue;
        }
        const stream = res.body as ReadableStream<Uint8Array> | null;
        if (!stream) {
          continue;
        }
        sp.updateText(`Scanning page ${page} for targets...`);
        const links = await extractTargetLinks(stream, options.perPage, options);
        let targetIndex = 0;
        for (const rel of links) {
          targetIndex++;
          const targetUrl = absolutizeTargetUrl(rel, options);
          sp.updateText(`Visiting target (${page} page): ${targetIndex}/${links.length}`);
          const entities = await processTargetUrl(http, options, targetUrl);
          for (const entity of entities) {
            const result: { page?: number; [key: string]: unknown } = { page };

            if (options.extractAll) {
              // Extract all string properties from entity
              for (const [key, value] of Object.entries(entity)) {
                if (typeof value === "string" && value.length > 0) {
                  result[key] = value;
                }
              }
            } else {
              // Extract only requested fields
              for (const field of selectedFields) {
                if (field === "page") continue; // handled separately
                const value = entity[field as keyof typeof entity];
                if (value != null) {
                  result[field] = value;
                }
              }
            }

            // Only include if we have at least one non-page field
            const hasData = Object.keys(result).some((k) => k !== "page" && result[k] != null);
            if (hasData && hasRequiredFields(result, options.requireGet)) {
              results.push(result);
            }
          }
        }

        // Inter-page delay: base delay plus +3s every 25 pages processed
        const extra = processedPages % 25 === 0 ? 3000 : 0;
        const totalDelay = options.delayMs + extra;
        if (totalDelay > 0) {
          sp.updateText(`Waiting ${Math.round(totalDelay / 1000)}s before next page...`);
          await Bun.sleep(totalDelay);
        }
      }
    },
  );

  const merged = await mergeWithExistingIfAny(results, options);
  const selected = selectFieldsForOutput(merged, options.getFields);

  await writeOutput({
    data: selected,
    format: options.format,
    stdout: options.stdout,
    outFile: options.outFile,
  });
}

function printCrawlHelp(): void {
  const text = `
Usage: bun relparse crawl <category-base-url> [options]

Modes:
  - Category pages -> target pages: requires --selector, --rel-prefix, --abs-base
  - Direct target URL detection: requires --host and --path-contains

Options:
  --pages <spec>            Pages to crawl (e.g. 1-15 | 1,3,10). Default: 1-15
  --per-page <n>            Max targets per category page. Default: 25
  --delay <ms>              Delay between pages. Default: 1000
  --ua <string>             HTTP User-Agent
  --timeout <ms>            HTTP timeout. Default: 15000
  --retries <n>             HTTP retries. Default: 2
  --format <csv|json|yaml>  Output format. Default: csv
  --out <path>              Output file (omit for stdout-only)
  --stdout                  Write to stdout
  --get <fields>            Comma list of fields to extract (any property name)
  --require-get <fields>    Comma list of fields that must be present and non-empty
  --extract-all             Extract all string properties from JSON-LD
  --extract-props <props>   Comma list of specific properties to extract from JSON-LD

Target discovery (replaces env vars):
  --host <hostname>         Target hostname for direct page detection
  --path-contains <substr>  Substring in pathname for direct page detection
  --selector <css>          CSS selector for links on category pages
  --rel-prefix <prefix>     Required relative href prefix to accept
  --abs-base <url>          Absolute base used to resolve relative target URLs
  --jsonld-types <list>     Comma-separated @type list; empty => all types

Examples:
  # Extract specific fields
  bun relparse crawl https://example.com/category/widgets \\
    --selector a.item-link --rel-prefix /widgets/ --abs-base https://example.com \\
    --host example.com --path-contains /widgets/ --pages 1-15 --per-page 25 \\
    --get name,email,phone,address --format csv --out results.csv

  # Extract fields but only include items with email and url
  bun relparse crawl https://example.com/category/widgets \\
    --selector a.item-link --rel-prefix /widgets/ --abs-base https://example.com \\
    --get name,email,phone,address --require-get email,url --format csv --out results.csv

  # Extract all string properties
  bun relparse crawl https://example.com/category/widgets \\
    --selector a.item-link --rel-prefix /widgets/ --abs-base https://example.com \\
    --extract-all --format json --out all-data.json

  # Extract specific JSON-LD properties
  bun relparse crawl https://example.com/category/widgets \\
    --selector a.item-link --rel-prefix /widgets/ --abs-base https://example.com \\
    --extract-props name,email,telephone,address --format csv --out contacts.csv

  # Direct target URL detection (no category crawl)
  bun relparse crawl https://example.com/widgets/some-item \\
    --host example.com --path-contains /widgets/ --extract-all
`;
  console.log(text);
}

function parseArgs(args: string[]): CrawlOptions {
  const out: CrawlOptions = {
    format: "csv",
    stdout: false,
    timeoutMs: 15_000,
    retries: 2,
    pages: "1-15",
    perPage: 25,
    delayMs: 1000,
    jsonldTypes: [],
    extractAll: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!out.baseUrl && a && !a.startsWith("-")) {
      out.baseUrl = a;
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
      continue;
    }
    if (a === "--pages" && args[i + 1]) {
      out.pages = String(args[++i]);
      continue;
    }
    if (a === "--per-page" && args[i + 1]) {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n > 0) {
        out.perPage = Math.floor(n);
      }
    }
    if (a === "--delay" && args[i + 1]) {
      const n = Number(args[++i]);
      if (Number.isFinite(n) && n >= 0) {
        out.delayMs = Math.floor(n);
      }
    }
    if (a === "--get" && args[i + 1]) {
      const raw = String(args[++i]);
      const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length > 0) {
        out.getFields = parts;
      }
    }
    if (a === "--require-get" && args[i + 1]) {
      const raw = String(args[++i]);
      const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length > 0) {
        out.requireGet = parts;
      }
    }
    if (a === "--extract-all") {
      out.extractAll = true;
      continue;
    }
    if (a === "--extract-props" && args[i + 1]) {
      const raw = String(args[++i]);
      const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length > 0) {
        out.extractProps = parts;
      }
      continue;
    }
    if (a === "--host" && args[i + 1]) {
      const v = String(args[++i]).trim();
      if (v.length > 0) out.targetHostname = v;
      continue;
    }
    if (a === "--path-contains" && args[i + 1]) {
      const v = String(args[++i]).trim();
      if (v.length > 0) out.targetPathContains = v;
      continue;
    }
    if (a === "--selector" && args[i + 1]) {
      const v = String(args[++i]).trim();
      if (v.length > 0) out.categoryLinkSelector = v;
      continue;
    }
    if (a === "--rel-prefix" && args[i + 1]) {
      const v = String(args[++i]).trim();
      if (v.length > 0) out.targetRelativePrefix = v;
      continue;
    }
    if (a === "--abs-base" && args[i + 1]) {
      const v = String(args[++i]).trim();
      if (v.length > 0) out.targetAbsoluteBase = v;
      continue;
    }
    if (a === "--jsonld-types" && args[i + 1]) {
      const raw = String(args[++i]);
      const parts = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (parts.length > 0) {
        out.jsonldTypes = parts;
      }
    }
  }
  return out;
}

function expandPages(spec: string): number[] {
  const trimmed = spec.trim();
  if (trimmed.includes(",")) {
    return trimmed
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((num) => Number.isFinite(num) && num > 0)
      .map((num) => Math.floor(num));
  }
  if (trimmed.includes("-")) {
    const parts = trimmed.split("-");
    const startNum = Math.max(1, Math.floor(Number(parts[0])));
    const endNum = Math.floor(Number(parts[1]));
    const list: number[] = [];
    if (Number.isFinite(startNum) && Number.isFinite(endNum) && endNum >= startNum) {
      for (let i = startNum; i <= endNum; i++) {
        list.push(i);
      }
    }
    return list;
  }
  const singlePage = Math.floor(Number(trimmed));
  return Number.isFinite(singlePage) && singlePage > 0 ? [singlePage] : [];
}

function joinUrl(base: string, page: string): string {
  const normalized = base.endsWith("/") ? base.slice(0, -1) : base;
  return `${normalized}/${page}`;
}

function isTargetUrl(options: CrawlOptions, input: string): boolean {
  const hostEnv = options.targetHostname;
  if (!hostEnv) {
    throw new Error("Missing --host for target detection");
  }
  const pathContains = options.targetPathContains;
  if (!pathContains) {
    throw new Error("Missing --path-contains for target detection");
  }
  try {
    const u = new URL(input);
    return u.hostname === hostEnv && u.pathname.includes(pathContains);
  } catch {
    return false;
  }
}

async function extractTargetLinks(
  stream: ReadableStream<Uint8Array>,
  limit: number,
  options: CrawlOptions,
): Promise<string[]> {
  const relPrefix = options.targetRelativePrefix;
  if (!relPrefix) {
    throw new Error("Missing --rel-prefix for target extraction");
  }
  const anchorSelector = options.categoryLinkSelector;
  if (!anchorSelector) {
    throw new Error("Missing --selector for target extraction");
  }
  const links = new Set<string>();
  let count = 0;
  const HTMLRewriterCtor = (globalThis as unknown as { HTMLRewriter: typeof HTMLRewriter })
    .HTMLRewriter;
  const rewriter = new HTMLRewriterCtor().on(anchorSelector, {
    element(anchor) {
      if (count >= limit) {
        return;
      }
      const href = anchor.getAttribute("href") ?? "";
      if (href.startsWith(relPrefix)) {
        links.add(href);
        count++;
      }
    },
  });
  const rewritten = rewriter.transform(new Response(stream));
  await rewritten.arrayBuffer();
  return Array.from(links);
}

function absolutizeTargetUrl(rel: string, options: CrawlOptions): string {
  const slug = rel.startsWith("/") ? rel.slice(1) : rel;
  const absBase = options.targetAbsoluteBase;
  if (!absBase) {
    throw new Error("Missing --abs-base for target URL absolutization");
  }
  const normalizedBase = absBase.endsWith("/") ? absBase : `${absBase}/`;
  return `${normalizedBase}${slug}`;
}

async function processTargetUrl(
  http: ReturnType<typeof createHttpClient>,
  options: CrawlOptions,
  targetUrl: string,
): Promise<Record<string, string>[]> {
  const res = await http.fetch(targetUrl);
  if (!res.ok) {
    return [];
  }
  if (!res.body) {
    return [];
  }
  const { result } = await parseOgAndMetaFromHTML(
    res.body as ReadableStream<Uint8Array>,
    targetUrl,
  );
  const entities = extractEntitiesFromJsonLd(
    result.jsonld,
    options.jsonldTypes,
    options.extractProps,
  );
  return entities.map((entity) => ({ ...entity, url: entity.url ?? targetUrl }));
}

function extractEntitiesFromJsonLd(
  jsonld: unknown[],
  allowedTypes: string[],
  extractProps?: string[],
): Record<string, string>[] {
  const out: Record<string, string>[] = [];
  const allowed = new Set(allowedTypes.map((t) => t.toLowerCase()));
  const allowAll = allowedTypes.length === 0;

  const visit = (node: unknown): void => {
    if (node == null) {
      return;
    }
    if (Array.isArray(node)) {
      for (const childNode of node) {
        visit(childNode);
      }
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const typeVal = String(obj["@type"] ?? "");
      if ((allowAll && typeVal) || allowed.has(typeVal.toLowerCase())) {
        const entity: Record<string, string> = {};

        // Extract all string properties or specific ones
        const propsToExtract = extractProps || Object.keys(obj);
        for (const prop of propsToExtract) {
          const value = stringOrUndefined(obj[prop]) ?? stringOrUndefined(obj[prop.toUpperCase()]);
          if (value) {
            // Special handling for email normalization
            entity[prop] = prop.toLowerCase() === "email" ? normalizeEmail(value) : value;
          }
        }

        // Only include if we have at least one property
        if (Object.keys(entity).length > 0) {
          out.push(entity);
        }
      }
      for (const v of Object.values(obj)) {
        visit(v);
      }
    }
  };
  visit(jsonld);
  return out;
}

function stringOrUndefined(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function normalizeEmail(email: string): string {
  let e = email.trim();
  if (e.toLowerCase().startsWith("mailto:")) {
    e = e.slice(7);
  }
  // Remove surrounding angle brackets often seen in scraped content
  if (e.startsWith("<") && e.endsWith(">")) {
    e = e.slice(1, -1).trim();
  }
  return e;
}

async function mergeWithExistingIfAny(
  fresh: { page?: number; [key: string]: unknown }[],
  options: CrawlOptions,
): Promise<{ page?: number; [key: string]: unknown }[]> {
  if (!options.outFile || options.stdout || options.format !== "csv") {
    return dedupeByEmailAndUrl(fresh, []);
  }
  const existingFile = Bun.file(options.outFile);
  if (!(await existingFile.exists())) {
    return dedupeByEmailAndUrl(fresh, []);
  }
  const text = await existingFile.text();
  const existingRows = parseCSV(text);
  return dedupeByEmailAndUrl(fresh, existingRows);
}

function dedupeByEmailAndUrl(
  fresh: { page?: number; [key: string]: unknown }[],
  existing: { page?: number; [key: string]: unknown }[],
): { page?: number; [key: string]: unknown }[] {
  const emailSet = new Set<string>();
  const urlSet = new Set<string>();
  for (const row of existing) {
    const e = typeof row.email === "string" ? row.email.trim().toLowerCase() : undefined;
    const u = typeof row.url === "string" ? normalizeUrlForDedupe(row.url) : undefined;
    if (e) {
      emailSet.add(e);
    }
    if (u) {
      urlSet.add(u);
    }
  }
  const out: { page?: number; [key: string]: unknown }[] = [];
  for (const row of fresh) {
    const emailKey = typeof row.email === "string" ? row.email.trim().toLowerCase() : undefined;
    const urlKey = typeof row.url === "string" ? normalizeUrlForDedupe(row.url) : undefined;
    if ((emailKey && emailSet.has(emailKey)) || (urlKey && urlSet.has(urlKey))) {
      continue;
    }
    if (emailKey) emailSet.add(emailKey);
    if (urlKey) {
      urlSet.add(urlKey);
    }
    out.push(row);
  }
  // Return existing + new unique
  const normalizedExisting: { page?: number; [key: string]: unknown }[] = [];
  for (const r of existing) {
    normalizedExisting.push(r);
  }
  return normalizedExisting.concat(out);
}

function normalizeUrlForDedupe(input: string): string | undefined {
  try {
    const u = new URL(input);
    const pathname =
      u.pathname.endsWith("/") && u.pathname !== "/" ? u.pathname.slice(1, -1) : u.pathname;
    const normalizedPath =
      pathname.length === 0 ? "/" : pathname.startsWith("/") ? pathname : `/${pathname}`;
    const host = u.hostname.toLowerCase();
    const proto = u.protocol.toLowerCase();
    const search = u.search; // keep query if present
    return `${proto}//${host}${normalizedPath}${search}`;
  } catch {
    const trimmed = input.trim();
    return trimmed.endsWith("/") && trimmed !== "/" ? trimmed.slice(0, -1) : trimmed;
  }
}

const CSV_LINE_RE = /\r?\n/;
function parseCSV(input: string): { [key: string]: string }[] {
  const lines = input.split(CSV_LINE_RE).filter((l) => l.length > 0);
  if (lines.length === 0) {
    return [];
  }
  const firstLine = lines[0] ?? "";
  const headers = splitCsvLine(firstLine);
  const rows: { [key: string]: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const lineText = lines[i] ?? "";
    const cols = splitCsvLine(lineText);
    const row: { [key: string]: string } = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] ?? "";
      row[key] = cols[c] ?? "";
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === ",") {
      out.push(current);
      current = "";
    } else if (ch === '"') {
      inQuotes = true;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out;
}

function hasRequiredFields(
  result: { page?: number; [key: string]: unknown },
  requiredFields?: string[],
): boolean {
  if (!requiredFields || requiredFields.length === 0) {
    return true; // No requirements, so always pass
  }

  for (const field of requiredFields) {
    const value = result[field];
    if (value == null || (typeof value === "string" && value.trim().length === 0)) {
      return false; // Missing or empty required field
    }
  }

  return true; // All required fields are present and non-empty
}

function selectFieldsForOutput(
  rows: { page?: number; [key: string]: unknown }[],
  fields?: string[],
): Record<string, unknown>[] {
  const selected = fields && fields.length > 0 ? fields : ["page"];
  const out: Record<string, unknown>[] = [];
  for (const row of rows) {
    const r: Record<string, unknown> = {};
    for (const f of selected) {
      if (f === "page") {
        r.page = row.page;
      } else if (row[f] != null) {
        r[f] = row[f];
      }
    }
    out.push(r);
  }
  return out;
}
