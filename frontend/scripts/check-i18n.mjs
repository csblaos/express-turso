import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const roots = [ "pages", "components", "utils", "composables" ];
const allowed = new Set([
	"pages/settings/language.vue", // native language names and flag markup
]);
const findings = [];

function walk(directory) {
	if (!fs.existsSync(directory)) return;
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const full = path.join(directory, entry.name);
		if (entry.isDirectory()) walk(full);
		else if (/\.(vue|ts)$/.test(entry.name)) {
			const relative = path.relative(root, full);
			if (allowed.has(relative)) continue;
			const lines = fs.readFileSync(full, "utf8").split("\n");
			lines.forEach((line, index) => {
				if (/[ก-๙ກ-ໝ]/u.test(line) && !/\$t\(|\bt\(|localeCompare|example|fixture|seed/i.test(line)) {
					findings.push(`${relative}:${index + 1}: ${line.trim().slice(0, 140)}`);
				}
			});
		}
	}
}

roots.forEach((directory) => walk(path.join(root, directory)));
if (findings.length) {
	console.error(`Found ${findings.length} possible untranslated UI strings:`);
	console.error(findings.slice(0, 200).join("\n"));
	process.exitCode = 1;
} else {
	console.log("No untranslated Thai/Lao UI strings found.");
}
