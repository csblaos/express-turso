// Unit codes are an internal key, not something a store should have to invent.
// They still have to stay stable and human-readable because the preset loader
// matches on them and CSV imports let a row name its unit by code.

// Names the presets and everyday Lao usage produce, mapped to the same codes the
// presets already use so a hand-typed "ກ່ອງ" lines up with the seeded "box"
// instead of creating a second unit that means the same thing.
const KNOWN_UNIT_CODES: Array<{ code: string; names: string[] }> = [
	{ code: "pcs", names: [ "ອັນ", "ຊິ້ນ", "ຫົວ", "ชิ้น", "piece", "pieces", "pc" ] },
	{ code: "box", names: [ "ກ່ອງ", "ຫີບ", "กล่อง", "box" ] },
	{ code: "pack", names: [ "ແພັກ", "ຫໍ່", "แพ็ก", "แพ็ค", "pack" ] },
	{ code: "set", names: [ "ຊຸດ", "ชุด", "set" ] },
	{ code: "btl", names: [ "ແກ້ວ", "ຂວດ", "ขวด", "แก้ว", "bottle", "glass" ] },
	{ code: "plate", names: [ "ຈານ", "ຖ້ວຍ", "จาน", "plate", "dish" ] },
	{ code: "bag", names: [ "ຖົງ", "ຢາງ", "ถุง", "bag" ] },
	{ code: "can", names: [ "ກະປ໋ອງ", "กระป๋อง", "can" ] },
	{ code: "tuk", names: [ "ຕຸກ", "ตุ๊ก" ] },
	{ code: "kg", names: [ "ກິໂລ", "ກິໂລກຣາມ", "กิโลกรัม", "กิโล", "kilogram", "kilo" ] },
	{ code: "g", names: [ "ກຣາມ", "ກຼາມ", "กรัม", "gram" ] },
	{ code: "ltr", names: [ "ລິດ", "ລິດຕຣ", "ลิตร", "liter", "litre" ] },
	{ code: "ml", names: [ "ມິນລີລິດ", "มิลลิลิตร", "milliliter" ] },
];

const KNOWN_BY_NAME = new Map<string, string>();
for (const entry of KNOWN_UNIT_CODES) {
	for (const name of entry.names) {
		KNOWN_BY_NAME.set(name.trim().toLowerCase(), entry.code);
	}
}

function slugifyUnitName(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 12);

	return slug;
}

/**
 * Picks a unit code for a name, avoiding any code the store already uses.
 * Falls back to a numbered suffix so the result is always unique and always
 * something a person can read in a CSV.
 */
export function generateUnitCode(name: string, existingCodes: Iterable<string>): string {
	const taken = new Set<string>();
	for (const code of existingCodes) {
		const normalized = String(code || "").trim().toLowerCase();
		if (normalized) taken.add(normalized);
	}

	const trimmed = String(name || "").trim();
	const base = KNOWN_BY_NAME.get(trimmed.toLowerCase())
		|| slugifyUnitName(trimmed)
		|| "unit";

	if (!taken.has(base)) return base;

	for (let suffix = 2; suffix <= 999; suffix += 1) {
		const candidate = `${base}-${suffix}`;
		if (!taken.has(candidate)) return candidate;
	}

	return `${base}-${Date.now()}`;
}
