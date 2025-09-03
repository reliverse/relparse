import { crawlCommand } from "./crawl";
import { fileCommand } from "./file";
import { htmlCommand } from "./html";
import { rssCommand } from "./rss";
import { sitemapCommand } from "./sitemap";

type Config = {
  tasks: Array<{
    run: string; // "html", "rss", "sitemap", "file"
    args: string[];
  }>;
};

export async function configCommand(args: string[]): Promise<void> {
  const file = args[0];
  if (!file) {
    console.error("Missing <file>. Usage: bun relparse config <file>");
    return;
  }
  type BunWithYAML = typeof Bun & { YAML?: { parse(input: string): unknown } };
  const bunWithYaml = Bun as BunWithYAML;
  const text = await Bun.file(file).text();
  const cfg = (bunWithYaml.YAML?.parse ? bunWithYaml.YAML.parse(text) : JSON.parse(text)) as Config;
  const hasTasksArray = Array.isArray(cfg?.tasks);
  if (!hasTasksArray) {
    console.error("Invalid config: missing tasks");
    return;
  }
  for (const t of cfg.tasks) {
    await runTask(t.run, t.args ?? []);
  }
}

async function runTask(name: string, args: string[]): Promise<void> {
  switch (name) {
    case "html":
      return htmlCommand(args);
    case "crawl":
      return crawlCommand(args);
    case "rss":
      return rssCommand(args);
    case "sitemap":
      return sitemapCommand(args);
    case "file":
      return fileCommand(args);
    default:
      console.error(`Unknown task in config: ${name}`);
  }
}
