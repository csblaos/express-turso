export type DateFormatLocale = "th" | "lo" | "en";

const LAO_MONTHS_LONG = [
	"ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ",
	"ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ",
];

const LAO_MONTHS_SHORT = [
	"ມ.ກ.", "ກ.ພ.", "ມີ.ນ.", "ເມ.ສ.", "ພ.ພ.", "ມິ.ຖ.",
	"ກ.ລ.", "ສ.ຫ.", "ກ.ຍ.", "ຕ.ລ.", "ພ.ຈ.", "ທ.ວ.",
];

function toDate(value: string | number | Date) {
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

export function formatAppDate(
	value: string | number | Date,
	locale: DateFormatLocale,
	options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
) {
	const date = toDate(value);
	if (!date) return String(value);
	if (locale !== "lo") {
		return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", options).format(date);
	}

	const monthStyle = options.month === "long" || options.dateStyle === "long" || options.dateStyle === "full" ? "long" : "short";
	const month = (monthStyle === "long" ? LAO_MONTHS_LONG : LAO_MONTHS_SHORT)[date.getMonth()];
	const datePart = `${date.getDate()} ${month} ${date.getFullYear()}`;
	if (!options.hour && !options.minute && !options.timeStyle) return datePart;
	const timePart = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
	return `${datePart} ${timePart}`;
}

export function formatAppDateTime(value: string | number | Date, locale: DateFormatLocale) {
	return formatAppDate(value, locale, { dateStyle: "medium", timeStyle: "short" });
}
