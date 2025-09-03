export type HtmlExtract = {
  url: string;
  title?: string;
  description?: string;
  canonical?: string;
  links: string[];
  meta: Record<string, string>;
  og: Record<string, string>;
  jsonld: unknown[];
};

export async function parseOgAndMetaFromHTML(stream: ReadableStream<Uint8Array>, url: string) {
  const links = new Set<string>();
  const meta: Record<string, string> = {};
  const og: Record<string, string> = {};
  const jsonld: unknown[] = [];
  let title: string | undefined;
  let description: string | undefined;
  let canonical: string | undefined;

  const HTMLRewriterCtor = (globalThis as unknown as { HTMLRewriter: typeof HTMLRewriter })
    .HTMLRewriter;
  const rewriter = new HTMLRewriterCtor()
    .on("title", {
      text(t) {
        const v = t.text.trim();
        if (v) {
          title = (title ?? "") + v;
        }
      },
    })
    .on("link", {
      element(e) {
        const rel = e.getAttribute("rel")?.toLowerCase();
        const href = e.getAttribute("href") ?? undefined;
        if (href) {
          links.add(href);
        }
        if (rel === "canonical" && href) {
          canonical = href;
        }
      },
    })
    .on("meta", {
      element(e) {
        const name = e.getAttribute("name") ?? e.getAttribute("property");
        const content = e.getAttribute("content") ?? "";
        if (!name) {
          return;
        }
        const key = name.toLowerCase();
        if (key.startsWith("og:")) {
          og[key] = content;
        } else {
          meta[key] = content;
          if (key === "description") {
            description = content;
          }
        }
      },
    })
    .on('script[type="application/ld+json"]', {
      text(t) {
        const raw = t.text.trim();
        try {
          const parsed = JSON.parse(raw);
          jsonld.push(parsed);
        } catch {
          // ignore bad JSON-LD
        }
      },
    });

  const rewritten = rewriter.transform(new Response(stream));
  await rewritten.arrayBuffer();

  const result: HtmlExtract = {
    url,
    title,
    description,
    canonical,
    links: Array.from(links),
    meta,
    og,
    jsonld,
  };

  return { result } as const;
}
