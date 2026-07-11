import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const ignored = new Set([".git", "node_modules", ".next", ".pnpm-store", "company/generated", "artifacts"]);
const patterns = [/-----BEGIN (?:RSA|OPENSSH|EC|PRIVATE) KEY-----/, /(?:sk|ghp|xoxb|xapp)-[A-Za-z0-9_-]{20,}/, /\b(api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{16,}["']/i];
const hits: string[] = [];
async function visit(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const relative = path.slice(root.length + 1);
    if ([...ignored].some((prefix) => relative === prefix || relative.startsWith(`${prefix}/`)) || ignored.has(entry.name)) continue;
    if (entry.isDirectory()) await visit(path);
    else if (entry.isFile() && !/\.(png|jpg|jpeg|gif|ico|woff2?)$/i.test(entry.name)) {
      const content = await readFile(path, "utf8");
      if (patterns.some((pattern) => pattern.test(content))) hits.push(path.slice(root.length + 1));
    }
  }
}
async function main(): Promise<void> {
  await visit(root);
  if (hits.length > 0) throw new Error(`Potential credential material found in: ${hits.join(", ")}`);
  console.log("Secret scan passed: no credential patterns found.");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
