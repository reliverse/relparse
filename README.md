# Relparse

Multipurpose parsing CLI (optimized for Bun users only).

Features:

- HTML: extract title, meta, OpenGraph, links, canonical, JSON-LD (streamed via HTMLRewriter)
- RSS/Atom: parse feed items (title/link/id/date)
- Sitemap: parse sitemap.xml and sitemap index files
- File: parse local files by extension (json|yaml|md|xml|html)
- Output: JSON, YAML, CSV
- Caching: optional response caching for HTML requests
- Crawling: site-agnostic via CLI flags (multi-page category → target emails)

## Installation

```bash
bun add -D @reliverse/relparse
# or globally: bun add -g @reliverse/relparse
```

## Usage

```bash
bun relparse <command> [options]
# or globally: relparse <command> [options]
```

## Commands

- help: show help
- version: show CLI version
- crawl <category-base-url>: crawl category pages and extract target emails
  - flags: --pages 1-15|1,3,10 (default 1-15) --per-page <n> (default 25)
           --ua <string> --timeout <ms> --retries <n>
           --format json|yaml|csv --out <path> --stdout
           --selector <css> --rel-prefix <prefix> --abs-base <url>
           --host <hostname> --path-contains <substr>
           --jsonld-types <t1,t2,...> (empty or omit = all types)
- html <url>: parse an HTML page
  - flags: --ua <string> --timeout <ms> --retries <n> --cache --format json|yaml|csv --out <path> --stdout
- rss <url>: parse an RSS/Atom feed
  - flags: --ua <string> --timeout <ms> --retries <n> --format json|yaml|csv --out <path> --stdout
- sitemap <url-or-file>: parse sitemap.xml or a sitemap index
  - flags: --ua <string> --timeout <ms> --retries <n> --format json|yaml|csv --out <path> --stdout
- file <glob>: parse local files by extension
  - flags: --format json|yaml|csv --out <path> --stdout
- config <file>: run tasks from a YAML/JSON config
- cache clear: clear the response/result cache

Examples:

```bash
# Category pages → emails.csv (pass selectors & URL rules via flags)
bun relparse crawl https://example.com/category/widgets \
  --selector a.item-link --rel-prefix /widgets/ --abs-base https://example.com \
  --host example.com --path-contains /widgets/ \
  --pages 1-15 --per-page 25 --format csv --out emails.csv

# HTML → YAML to stdout
bun relparse html https://example.com --format yaml --stdout

# HTML → JSON to file with cache enabled
bun relparse html https://example.com --cache --out results/example.json

# RSS → JSON to stdout
bun relparse rss https://example.com/feed.xml --stdout

# Sitemap → JSON
bun relparse sitemap https://example.com/sitemap.xml --format json

# Local files (JSON/YAML/MD/XML/HTML) → JSON
bun relparse file "content/**/*.{json,yaml,yml,md,html,xml}" --format json

# Clear cache
bun relparse cache clear
```

## Crawl flags

The `crawl` command is site-agnostic and configured entirely via flags:

- Required for category crawl:
  - `--selector <css>`: CSS selector for links on category pages
  - `--rel-prefix <prefix>`: accept only relative hrefs with this prefix
  - `--abs-base <url>`: absolute base to resolve relative target URLs

- Optional, but recommended for direct target detection (when the input URL is a target page):
  - `--host <hostname>`: hostname to match
  - `--path-contains <substr>`: substring to match in the pathname

- Email/entity extraction from JSON-LD:
  - `--jsonld-types <t1,t2,...>`: comma-separated `@type` allowlist (case-insensitive). If omitted or empty, all detected types are allowed.

Examples:

```bash
# Direct target URL (no category crawl):
bun relparse crawl https://example.com/widgets/some-item \
  --host example.com --path-contains /widgets/

# Limit fields in output (CSV):
bun relparse crawl https://example.com/category/widgets \
  --selector a.item-link --rel-prefix /widgets/ --abs-base https://example.com \
  --get name,email,url --format csv --out emails.csv
```
