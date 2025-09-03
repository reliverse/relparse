import { toCSV } from "./to-csv";

type Format = "json" | "yaml" | "csv";

export async function writeOutput(opts: {
  data: unknown;
  format: Format;
  stdout: boolean;
  outFile?: string;
}): Promise<void> {
  const { data, format, stdout, outFile } = opts;
  const body = await encode(data, format);
  const text = Bun.stripANSI(new TextDecoder().decode(body));
  if (stdout) {
    console.log(text);
    return;
  }
  if (isNonEmptyString(outFile)) {
    const file = Bun.file(outFile);
    await Bun.write(file, body);
    return;
  }
  console.log(text);
}

async function encode(data: unknown, format: Format): Promise<Uint8Array> {
  switch (format) {
    case "json": {
      return new TextEncoder().encode(JSON.stringify(data, null, 2));
    }
    case "yaml": {
      type BunWithYAML = typeof Bun & { YAML?: { stringify(input: unknown): string } };
      const bunWithYaml = Bun as BunWithYAML;
      const text = bunWithYaml.YAML?.stringify
        ? bunWithYaml.YAML.stringify(data)
        : JSON.stringify(data);
      return new TextEncoder().encode(String(text));
    }
    case "csv": {
      const text = toCSV(data);
      return new TextEncoder().encode(text);
    }
    default: {
      return new TextEncoder().encode(JSON.stringify(data));
    }
  }
}

function isNonEmptyString(input: unknown): input is string {
  return typeof input === "string" && input.length > 0;
}
