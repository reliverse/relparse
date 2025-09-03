export function printHelp(): void {
  const text = `
@reliverse/relparse (Bun-only) — multipurpose parsing CLI

Usage:
  bun relparse <command> [options]

Commands:
  crawl <category-base-url> Crawl category pages and extract target emails
  help                      Show this help
  version                   Show CLI version
  html <url>                Parse HTML page (links, meta, OpenGraph, JSON-LD)
  rss <url>                 Parse RSS/Atom feed items
  sitemap <url-or-file>     Parse sitemap.xml and sitemap index
  file <glob>               Parse local files (json, yaml, md, xml, html)
  config <file>             Run from YAML config (pipelines)
  cache clear               Clear response/result cache

Examples:
  bun relparse crawl https://example.com/category/widgets --pages 1-15 --per-page 25 --format csv --out emails.csv
  bun relparse html https://example.com --format json --stdout
  bun relparse html https://example.com --format yaml --out results/example.yaml
  bun relparse rss https://example.com/feed.xml --stdout
  bun relparse sitemap https://example.com/sitemap.xml --format json
`;
  console.log(text);
}
