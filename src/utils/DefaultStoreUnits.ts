export type DefaultStoreUnitPreset = {
	code: string;
	name_th: string;
};

export const DEFAULT_STORE_UNIT_PRESETS: DefaultStoreUnitPreset[] = [
	{ code: "pcs", name_th: "ชิ้น" },
	{ code: "box", name_th: "กล่อง" },
	{ code: "pack", name_th: "แพ็ก" },
	{ code: "set", name_th: "ชุด" },
	{ code: "kg", name_th: "กิโลกรัม" },
	{ code: "g", name_th: "กรัม" },
	{ code: "ltr", name_th: "ลิตร" },
	{ code: "ml", name_th: "มิลลิลิตร" },
	{ code: "btl", name_th: "ขวด" },
];
