import { clearCache } from "../utils/cache";

export async function cacheClearCommand(_args: string[]): Promise<void> {
  await clearCache();
  console.log("Cache cleared");
}
