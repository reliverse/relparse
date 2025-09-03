import { writeOutput } from "../io/output";

type Format = "json" | "yaml" | "csv";

type Options = {
  glob?: string;
  format: Format;
  stdout: boolean;
  outFile?: string;
};

export async function fileCommand(args: string[]): Promise<void> {
  const options = parseArgs(args);
  if (!options.glob) {
    console.error(
      "Missing <glob>. Usage: bun relparse file <glob> [--format json|yaml|csv] [--out path] [--stdout]",
    );
    return;
  }

  const glob = new Bun.Glob(options.glob);
  const results: Record<string, unknown>[] = [];
  for await (const path of glob.scan({ dot: false })) {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    const text = await Bun.file(path).text();
    const parsed = await parseByExt(ext, text);
    results.push({ path, ...parsed });
  }

  await writeOutput({
    data: results,
    format: options.format,
    stdout: options.stdout,
    outFile: options.outFile,
  });
}

async function parseByExt(ext: string, text: string): Promise<Record<string, unknown>> {
  switch (ext) {
    case "json": {
      try {
        return { type: "json", value: JSON.parse(text) };
      } catch {
        return { type: "json", error: "invalid json" };
      }
    }
    case "yaml":
    case "yml": {
      type BunWithYAML = typeof Bun & { YAML?: { parse(input: string): unknown } };
      const bunWithYaml = Bun as BunWithYAML;
      const value = bunWithYaml.YAML?.parse ? bunWithYaml.YAML.parse(text) : text;
      return { type: "yaml", value };
    }
    case "md":
    case "markdown": {
      return { type: "markdown", value: text };
    }
    case "xml": {
      return { type: "xml", value: text };
    }
    case "html":
    case "htm": {
      return { type: "html", value: text };
    }
    default: {
      return { type: ext || "unknown", value: text };
    }
  }
}

function parseArgs(args: string[]): Options {
  const out: Options = {
    format: "json",
    stdout: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!out.glob && a && !a.startsWith("-")) {
      out.glob = a;
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
    }
  }
  return out;
}
