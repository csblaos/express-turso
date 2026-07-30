export type DateFormatLocale = "th" | "lo" | "en";

const LAO_MONTHS_LONG = [
	"ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ",
	"ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ",
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
		return new Intl.DateTimeFormat(locale === "th" ? "th-TH" : "en-US", {
			timeZone: "Asia/Vientiane",
			...options,
		}).format(date);
	}

	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone: "Asia/Vientiane",
		year: "numeric",
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "";
	const month = LAO_MONTHS_LONG[Number(part("month")) - 1] || part("month");
	const datePart = options.day === undefined && options.dateStyle === undefined
		? `${month} ${part("year")}`
		: `${part("day")} ${month} ${part("year")}`;
	if (!options.hour && !options.minute && !options.timeStyle) return datePart;
	return `${datePart}, ${part("hour")}:${part("minute")}`;
}

export function formatAppDateTime(value: string | number | Date, locale: DateFormatLocale) {
	return formatAppDate(value, locale, { dateStyle: locale === "lo" ? "long" : "medium", timeStyle: "short" });
}
