import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { StoreCurrencyRateInterface } from "@interfaces/StoreCurrencyRateInterface";
import { StoreInterface } from "@interfaces/StoreInterface";
import { StorePaymentAccountInterface } from "@interfaces/StorePaymentAccountInterface";
import { ApiError } from "@middlewares/ApiError";
import { parseSupportedCurrencies } from "@utils/PaymentCurrency";

// What a shop still has to set up before the till behaves the way the owner
// expects. The point is not a tidy checklist: it is that several settings can be
// switched on and then silently do nothing, because the thing they depend on was
// never filled in. Enabling THB without saving a rate hides the currency picker
// entirely, with no error anywhere — that is the class of problem this reports.
//
// Severity, not a flat list:
//   blocking   — the shop cannot sell at all
//   warning    — a feature is switched on but cannot work
//   suggestion — cosmetic, safe to ignore
//
// No text is returned. The client owns the wording so it can be translated, and
// so the server never has to know the interface language.

export type SetupSeverity = "blocking" | "warning" | "suggestion";

export type SetupStatusItem = {
	id: string;
	severity: SetupSeverity;
	// The permission needed to act on it. Staff who cannot fix an item are never
	// shown it: a badge somebody cannot clear is worse than no badge.
	permission: string;
	data?: Record<string, unknown>;
};

export type SetupStatus = {
	store_id: string;
	generated_at: string;
	items: SetupStatusItem[];
	counts: Record<SetupSeverity, number>;
};

function number(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown): string {
	return String(value ?? "").trim();
}

export class StoreSetupStatusInterface {
	static async get(storeId: string): Promise<SetupStatus> {
		const id = text(storeId);
		if (!id) throw ApiError.BadRequestError("store_id is required");

		// These are all created lazily elsewhere — the rate and account tables by
		// their settings pages, the newer store columns by ensureColumns — so a shop
		// that has not touched them would fail the batch below instead of being
		// reported on. The same guard the report does before reading.
		await Promise.all([
			StoreInterface.ensureColumns(),
			StoreCurrencyRateInterface.warmup(),
			StorePaymentAccountInterface.ensureTable(),
		]);

		const db = DbConn.getClient();
		const args: InValue[] = [ id ];
		// One round trip: this runs on every page load, and the orders list already
		// spends most of its time waiting on the network.
		const [ storeResult, productResult, rateResult, accountResult, uncostedResult ] = await db.batch([
			{ sql: `SELECT currency, supported_currencies, vat_enabled, vat_rate, name, logo_url, address, phone_number,
				customer_display_enabled, customer_display_ads, business_day_start_minutes, business_day_start_confirmed_at FROM stores WHERE id = ? LIMIT 1`, args },
			{ sql: "SELECT COUNT(*) AS total FROM products WHERE store_id = ? AND deleted_at IS NULL", args },
			{ sql: "SELECT currency, rate_to_base FROM store_currency_rates WHERE store_id = ?", args },
			{ sql: `SELECT COUNT(*) AS total,
				COUNT(CASE WHEN is_active = 1 THEN 1 END) AS active_total,
				COUNT(CASE WHEN is_active = 1 AND (qr_image_url IS NULL OR TRIM(qr_image_url) = '') THEN 1 END) AS missing_qr
				FROM store_payment_accounts WHERE store_id = ?`, args },
			// Sold goods with no cost behind them: the margin on those bills is
			// unknown, which the report already warns about on its own page.
			{ sql: `SELECT COUNT(*) AS total FROM products
				WHERE store_id = ? AND deleted_at IS NULL AND COALESCE(cost_source, 'purchase') = 'unknown'`, args },
		], "read");

		const store = storeResult.rows[0] as Record<string, unknown> | undefined;
		if (!store) throw ApiError.NotFoundError("store not found");

		const items: SetupStatusItem[] = [];
		// A new store starts at midnight, but that is a meaningful reporting choice.
		// Keep asking until the owner either changes it or explicitly accepts 00:00.
		if (!text(store.business_day_start_confirmed_at)) {
			items.push({ id: "business_day_start_unconfirmed", severity: "suggestion", permission: "settings.store.update", data: { minutes: number(store.business_day_start_minutes) } });
		}

		// --- blocking -----------------------------------------------------------
		if (number((productResult.rows[0] as Record<string, unknown>)?.total) === 0) {
			items.push({ id: "no_products", severity: "blocking", permission: "products.create" });
		}

		// --- warnings: switched on, cannot work ---------------------------------
		const baseCurrency = text(store.currency) || "LAK";
		const supported = parseSupportedCurrencies(store.supported_currencies, baseCurrency);
		const rated = new Set(rateResult.rows
			.filter((row) => number((row as Record<string, unknown>).rate_to_base) > 0)
			.map((row) => String((row as Record<string, unknown>).currency).toUpperCase()));
		const unratedCurrencies = supported.filter((code) => code !== baseCurrency && !rated.has(code));
		if (unratedCurrencies.length) {
			items.push({
				id: "currency_rates_missing",
				severity: "warning",
				permission: "settings.store.update",
				data: { currencies: unratedCurrencies },
			});
		}

		// VAT switched on with nothing to charge computes zero on every bill.
		if (number(store.vat_enabled) !== 0 && number(store.vat_rate) <= 0) {
			items.push({ id: "vat_rate_missing", severity: "warning", permission: "settings.store.update" });
		}

		const accounts = accountResult.rows[0] as Record<string, unknown> | undefined;
		if (number(accounts?.active_total) === 0) {
			items.push({
				id: "no_payment_account",
				severity: "warning",
				permission: "settings.store.update",
				// Distinguishes "never set one up" from "had one and switched it off".
				data: { has_inactive: number(accounts?.total) > 0 },
			});
		} else if (number(accounts?.missing_qr) > 0) {
			items.push({
				id: "payment_account_missing_qr",
				severity: "warning",
				permission: "settings.store.update",
				data: { count: number(accounts?.missing_qr) },
			});
		}

		const uncosted = number((uncostedResult.rows[0] as Record<string, unknown>)?.total);
		if (uncosted > 0) {
			items.push({ id: "products_without_cost", severity: "warning", permission: "products.update", data: { count: uncosted } });
		}

		// --- suggestions --------------------------------------------------------
		// The customer screen falls back to a bare logo with no adverts loaded.
		if (number(store.customer_display_enabled) !== 0 && !text(store.customer_display_ads)) {
			items.push({ id: "customer_display_no_ads", severity: "suggestion", permission: "settings.store.update" });
		}
		const missingProfile = [
			!text(store.logo_url) ? "logo" : "",
			!text(store.address) ? "address" : "",
			!text(store.phone_number) ? "phone" : "",
		].filter(Boolean);
		if (missingProfile.length) {
			items.push({ id: "store_profile_incomplete", severity: "suggestion", permission: "settings.store.update", data: { missing: missingProfile } });
		}

		const counts: Record<SetupSeverity, number> = { blocking: 0, warning: 0, suggestion: 0 };
		for (const item of items) counts[item.severity] += 1;

		return { store_id: id, generated_at: new Date().toISOString(), items, counts };
	}

	static async confirmBusinessDayDefault(storeId: string): Promise<void> {
		await StoreInterface.ensureColumns();
		await DbConn.getClient().execute({ sql: "UPDATE stores SET business_day_start_confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", args: [ storeId ] });
	}
}
