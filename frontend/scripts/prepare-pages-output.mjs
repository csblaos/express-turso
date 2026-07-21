import { access, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nuxtOutputDir = path.join(frontendDir, ".output", "public");
const pagesOutputDir = path.join(frontendDir, "dist");

await access(path.join(nuxtOutputDir, "index.html"));
await rm(pagesOutputDir, { recursive: true, force: true });
await cp(nuxtOutputDir, pagesOutputDir, { recursive: true });
await access(path.join(pagesOutputDir, "index.html"));

console.log("Cloudflare Pages assets prepared in dist/");
