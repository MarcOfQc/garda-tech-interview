import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const sampleDataPath = path.resolve(import.meta.dirname, "../../data.json");

export async function makeTempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "garda-"));
}
