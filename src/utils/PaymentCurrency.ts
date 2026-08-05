import { ApiError } from "@middlewares/ApiError";

// Multi-currency at the till is only ever about how the customer pays. Prices,
// costs, totals and every report stay in the shop's base currency; a foreign
// note is converted the moment it is handed over and never again.
//
// The rate is locked onto the order the same way cost_base_at_sale is, so that
// editing the rate in settings tomorrow cannot move yesterday's takings.

export type ResolvedPaymentCurrency = {
	currency: string;
	// rate_to_base: 1 unit of `currency` is worth this much base currency.
	exchangeRate: number;
	isForeign: boolean;
};

export function normalizeCurrency(value: unknown): string {
	const normalized = String(value ?? "").trim().toUpperCase();
	return normalized === "LAK" || normalized === "THB" || normalized === "USD" ? normalized : "";
}

export function parseSupportedCurrencies(raw: unknown, baseCurrency: string): string[] {
	const codes = String(raw ?? "")
		.split(",")
		.map((part) => normalizeCurrency(part))
		.filter(Boolean);
	// The base currency is always payable, whether or not it was listed.
	return [ ...new Set([ baseCurrency, ...codes ]) ];
}

/**
 * Decides which currency a payment is denominated in and at what rate.
 *
 * `rates` is the store's saved rate table. A missing or non-positive rate is
 * refused rather than defaulted to 1: silently treating 1 THB as 1 LAK would
 * take a bill of 160,000 for the price of a coffee.
 */
export function resolvePaymentCurrency(input: {
	requested: unknown;
	baseCurrency: string;
	supportedCurrencies: unknown;
	rates: Map<string, number>;
	expectedRate?: number | null;
}): ResolvedPaymentCurrency {
	const base = normalizeCurrency(input.baseCurrency) || "LAK";
	const requested = normalizeCurrency(input.requested);
	// No currency asked for means the old single-currency behaviour.
	if (!requested || requested === base) return { currency: base, exchangeRate: 1, isForeign: false };

	const supported = parseSupportedCurrencies(input.supportedCurrencies, base);
	if (!supported.includes(requested)) {
		throw ApiError.BadRequestError(`${requested} is not enabled for this store`);
	}

	const rate = Number(input.rates.get(requested));
	if (!Number.isFinite(rate) || rate <= 0) {
		throw ApiError.BadRequestError(`no exchange rate is set for ${requested}`);
	}

	// The cashier quoted a rate to the customer before taking their money. If the
	// owner changed it in between, the sale must stop rather than quietly ring up
	// a different amount — the same optimistic check the order version uses.
	const expected = Number(input.expectedRate);
	if (Number.isFinite(expected) && expected > 0 && !ratesMatch(expected, rate)) {
		throw ApiError.CustomError({
			code: 409_102,
			message: `exchange rate changed to ${rate}, please confirm the payment again`,
			httpStatusCode: 409,
		});
	}

	return { currency: requested, exchangeRate: rate, isForeign: true };
}

// Rates travel through JSON and a base-10 string, so an exact comparison would
// reject a rate that never actually changed.
function ratesMatch(left: number, right: number): boolean {
	return Math.abs(left - right) < 0.000_001;
}

/**
 * Converts what the customer physically handed over into base currency.
 *
 * Converting the tender rather than the total is what keeps the books whole: the
 * change is then worked out in base currency alone, so no fraction of a foreign
 * note is ever left unaccounted for.
 */
export function tenderedInBase(amountForeign: number, exchangeRate: number): number {
	return Math.round(Number(amountForeign) * Number(exchangeRate));
}
