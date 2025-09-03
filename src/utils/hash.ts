// 64-bit hex width for Bun.hash number normalization
const HEX_WIDTH: number = "ffffffffffffffff".length;
const HEX_BASE: number = 16;

export function createHashKey(input: string): string {
  const n = Bun.hash(input);
  const hex = Number(n).toString(HEX_BASE);
  return hex.padStart(HEX_WIDTH, "0");
}
