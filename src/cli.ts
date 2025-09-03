import { printHelp } from "./utils/help";

export async function run(args: string[]): Promise<void> {
  const [command, ...rest] = args;

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "version" || command === "--version" || command === "-v") {
    console.log("@reliverse/relparse v1.0.0");
    return;
  }

  switch (command) {
    case "crawl": {
      const { crawlCommand } = await import("./commands/crawl");
      await crawlCommand(rest);
      return;
    }
    case "html": {
      const { htmlCommand } = await import("./commands/html");
      await htmlCommand(rest);
      return;
    }
    case "rss": {
      const { rssCommand } = await import("./commands/rss");
      await rssCommand(rest);
      return;
    }
    case "sitemap": {
      const { sitemapCommand } = await import("./commands/sitemap");
      await sitemapCommand(rest);
      return;
    }
    case "file": {
      const { fileCommand } = await import("./commands/file");
      await fileCommand(rest);
      return;
    }
    case "config": {
      const { configCommand } = await import("./commands/config");
      await configCommand(rest);
      return;
    }
    case "cache": {
      const sub = rest[0];
      if (sub === "clear") {
        const { cacheClearCommand } = await import("./commands/cache");
        await cacheClearCommand(rest.slice(1));
        return;
      }
      console.error(`Unknown cache subcommand: ${sub ?? "<none>"}`);
      printHelp();
      return;
    }
    default: {
      console.error(`Unknown command: ${command}`);
      printHelp();
    }
  }
}
