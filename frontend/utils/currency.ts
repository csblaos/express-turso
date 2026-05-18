export type CurrencyCode = "LAK" | "THB" | "USD";

export function normalizeCurrencyCode(value: unknown): CurrencyCode | null {
	const normalized = String(value ?? "").trim().toUpperCase();
	if (normalized === "LAK" || normalized === "THB" || normalized === "USD") return normalized;
	return null;
}

export function getCurrencySymbol(currency: CurrencyCode | string): string {
	switch (String(currency).toUpperCase()) {
		case "LAK":
			return "₭";
		case "THB":
			return "฿";
		case "USD":
			return "$";
		default:
			return "";
	}
}

export function formatDecimal(value: number, options?: { locale?: string; maximumFractionDigits?: number; minimumFractionDigits?: number }) {
	const locale = options?.locale ?? "th-TH";
	const maximumFractionDigits = options?.maximumFractionDigits ?? 0;
	const minimumFractionDigits = options?.minimumFractionDigits ?? 0;
	return new Intl.NumberFormat(locale, {
		style: "decimal",
		maximumFractionDigits,
		minimumFractionDigits,
	}).format(value);
}

export function formatMoneyWithSymbol(
	value: number,
	currency: CurrencyCode | string,
	options?: { locale?: string; maximumFractionDigits?: number; minimumFractionDigits?: number; suffix?: boolean },
) {
	const symbol = getCurrencySymbol(currency);
	const formatted = formatDecimal(value, {
		locale: options?.locale,
		maximumFractionDigits: options?.maximumFractionDigits,
		minimumFractionDigits: options?.minimumFractionDigits,
	});
	if (!symbol) return formatted;
	const suffix = options?.suffix ?? true;
	return suffix ? `${formatted}${symbol}` : `${symbol}${formatted}`;
}

