export type DefaultStoreUnitPreset = {
	code: string;
	name_th: string;
};

// The product catalogue is Lao-facing, so preset names are stored in Lao and
// rendered verbatim; there is no per-locale translation of unit names.
export const DEFAULT_STORE_UNIT_PRESETS: DefaultStoreUnitPreset[] = [
	{ code: "pcs", name_th: "ອັນ" },
	{ code: "box", name_th: "ກ່ອງ" },
	{ code: "pack", name_th: "ແພັກ" },
	{ code: "set", name_th: "ຊຸດ" },
	{ code: "btl", name_th: "ແກ້ວ" },
	{ code: "plate", name_th: "ຈານ" },
];
