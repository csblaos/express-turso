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


/**
 * Formats a money value while it is being typed: keeps thousand separators in
 * step with the digits, tolerates a trailing dot so "1000." stays typable, and
 * caps the decimals. Pair it with a parser that strips commas before use.
 */
export function normalizeMoneyTyping(raw: string, options?: { maxDecimals?: number }) {
	const maxDecimals = options?.maxDecimals ?? 2;
	let normalized = String(raw ?? "").replace(/\s+/g, "").replace(/,/g, "").replace(/[^0-9.]/g, "");

	const firstDot = normalized.indexOf(".");
	if (firstDot !== -1) {
		normalized = normalized.slice(0, firstDot + 1) + normalized.slice(firstDot + 1).replace(/\./g, "");
	}

	if (!normalized) return "";

	const hasTrailingDot = normalized.endsWith(".");
	const [ intRaw = "", decRaw = "" ] = normalized.split(".");
	// Typing after a leading zero would otherwise read "05,000"; a lone "0" is
	// kept so "0" and "0.5" stay typable.
	const intDigitsRaw = intRaw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
	const decDigits = decRaw.replace(/\D/g, "").slice(0, Math.max(0, maxDecimals));

	const needsLeadingZero = normalized.startsWith(".");
	const intDigits = (intDigitsRaw || needsLeadingZero) ? (intDigitsRaw || "0") : "";
	const intWithCommas = intDigits ? intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : "";

	if (hasTrailingDot) return `${intWithCommas || "0"}.`;
	return decDigits ? `${intWithCommas || "0"}.${decDigits}` : intWithCommas;
}
