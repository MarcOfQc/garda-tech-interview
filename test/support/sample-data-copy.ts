import { copyFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const sampleDataPath = path.resolve(import.meta.dirname, "../../data.json");

/** Tests that write get their own copy, so the real data.json is never touched. */
export async function copySampleData(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "garda-"));
  const filePath = path.join(dir, "data.json");
  await copyFile(sampleDataPath, filePath);
  return filePath;
}
