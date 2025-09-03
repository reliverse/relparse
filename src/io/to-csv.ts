export function toCSV(data: unknown): string {
  if (data == null) {
    return "";
  }
  if (Array.isArray(data)) {
    return arrayToCSV(data);
  }
  if (typeof data === "object") {
    return arrayToCSV([data as Record<string, unknown>]);
  }
  return arrayToCSV([{ value: data }]);
}

function arrayToCSV(rows: Record<string, unknown>[]): string {
  const headers = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      headers.add(k);
    }
  }
  const headerList = Array.from(headers);
  const lines: string[] = [];
  lines.push(headerList.map(csvEscape).join(","));
  for (const row of rows) {
    lines.push(headerList.map((h) => csvEscape(stringify(row[h]))).join(","));
  }
  return lines.join("\n");
}

function stringify(v: unknown): string {
  if (v == null) {
    return "";
  }
  if (typeof v === "string") {
    return v;
  }
  return JSON.stringify(v);
}

const CSV_NEEDS_QUOTE = /[",\n]/;

function csvEscape(s: string): string {
  if (CSV_NEEDS_QUOTE.test(s)) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}
