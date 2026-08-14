import { access, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nuxtOutputDir = path.join(frontendDir, ".output", "public");
const pagesOutputDir = path.join(frontendDir, "dist");

async function exists(target) {
	try {
		await access(target);
		return true;
	} catch {
		return false;
	}
}

// Which directory nitro writes to depends on the preset it picks. A local
// `nuxt generate` uses the static preset and lands in .output/public, so the
// assets still have to be copied to the dist/ that wrangler.toml points at.
// On Cloudflare, CF_PAGES makes nitro select the cloudflare_pages preset, which
// writes straight to dist/ (along with _headers and _redirects) and never
// creates .output/public — the previous unconditional access() on that path
// failed the build there.
if (await exists(path.join(nuxtOutputDir, "index.html"))) {
	await rm(pagesOutputDir, { recursive: true, force: true });
	await cp(nuxtOutputDir, pagesOutputDir, { recursive: true });
	await access(path.join(pagesOutputDir, "index.html"));
	console.log("Cloudflare Pages assets copied from .output/public to dist/");
}
else if (await exists(path.join(pagesOutputDir, "index.html"))) {
	console.log("Cloudflare Pages assets already in dist/ (cloudflare_pages preset), nothing to copy");
}
else {
	throw new Error(
		`No prerendered index.html found. Looked in:\n  ${path.join(nuxtOutputDir, "index.html")}\n  ${path.join(pagesOutputDir, "index.html")}\nDid "nuxt generate" run and succeed?`,
	);
}
