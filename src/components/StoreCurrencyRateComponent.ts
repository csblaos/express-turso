import { StoreCurrencyRateInterface } from "@interfaces/StoreCurrencyRateInterface";
import { StoreCurrencyRateHistoryInterface } from "@interfaces/StoreCurrencyRateHistoryInterface";
import { ApiError } from "@middlewares/ApiError";
import { StoreComponent } from "@components/StoreComponent";

type Actor = {
	userId: string;
	systemRole: string;
};

const ALLOWED_CURRENCIES = [ "LAK", "THB", "USD" ] as const;
type CurrencyCode = (typeof ALLOWED_CURRENCIES)[number];

function normalizeCurrency(value: unknown): CurrencyCode | null {
	const normalized = String(value || "").trim().toUpperCase();
	return (ALLOWED_CURRENCIES as readonly string[]).includes(normalized) ? (normalized as CurrencyCode) : null;
}

export class StoreCurrencyRateComponent {
	static async getRates(requestId: string, storeId: string, actor: Actor): Promise<Record<string, number>> {
		void requestId;
		await StoreComponent.getById(requestId, storeId, actor);
		const rows = await StoreCurrencyRateInterface.findByStoreId(storeId);
		return Object.fromEntries(rows.map((row) => [ row.currency, row.rate_to_base ]));
	}

	static async getHistory(
		requestId: string,
		storeId: string,
		input: { limit: number },
		actor: Actor,
	): Promise<Array<{
		id: string;
		base_currency: string;
		currency: string;
		rate_to_base: number;
		actor_user_id: string | null;
		occurred_at: string;
	}>> {
		void requestId;
		await StoreComponent.getById(requestId, storeId, actor);
		const rows = await StoreCurrencyRateHistoryInterface.findByStoreId(storeId, { limit: input.limit });
		return rows.map((row) => ({
			id: row.id,
			base_currency: row.base_currency,
			currency: row.currency,
			rate_to_base: row.rate_to_base,
			actor_user_id: row.actor_user_id,
			occurred_at: row.occurred_at,
		}));
	}

	static async updateRates(
		requestId: string,
		storeId: string,
		input: { base_currency: string; supported_currencies: string[]; rates: Record<string, unknown> },
		actor: Actor,
	): Promise<Record<string, number>> {
		void requestId;
		const store = await StoreComponent.getById(requestId, storeId, actor);
		const baseCurrency = normalizeCurrency(input.base_currency) ?? normalizeCurrency(store.currency) ?? "LAK";
		const supportedCurrencies = Array.isArray(input.supported_currencies)
			? input.supported_currencies.map(normalizeCurrency).filter(Boolean) as CurrencyCode[]
			: [];

		if (!supportedCurrencies.includes(baseCurrency)) {
			supportedCurrencies.push(baseCurrency);
		}

		const nextRates: Array<{ currency: string; rate_to_base: number }> = [];
		for (const currency of supportedCurrencies) {
			if (currency === baseCurrency) {
				nextRates.push({ currency, rate_to_base: 1 });
				continue;
			}
			const raw = (input.rates || {})[currency];
			const rate = Number(raw);
			if (!Number.isFinite(rate) || rate <= 0) {
				throw ApiError.BadRequestError(`Invalid exchange rate for ${currency}`);
			}
			nextRates.push({ currency, rate_to_base: rate });
		}

		const previousRows = await StoreCurrencyRateInterface.findByStoreId(storeId);
		const previousMap = new Map(previousRows.map((row) => [ row.currency, row.rate_to_base ]));

		await StoreCurrencyRateInterface.replaceRates(storeId, nextRates);

		const historyItems = nextRates
			.filter((row) => row.currency !== baseCurrency)
			.filter((row) => previousMap.get(row.currency) !== row.rate_to_base)
			.map((row) => ({
				store_id: storeId,
				base_currency: baseCurrency,
				currency: row.currency,
				rate_to_base: row.rate_to_base,
				actor_user_id: actor.userId || null,
			}));
		await StoreCurrencyRateHistoryInterface.insertMany(historyItems);

		return Object.fromEntries(nextRates.map((row) => [ row.currency, row.rate_to_base ]));
	}
}
