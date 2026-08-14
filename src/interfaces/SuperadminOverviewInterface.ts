import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { InventoryCostInterface } from "@interfaces/InventoryCostInterface";
import { ReportPeriodInput, resolveReportPeriods } from "@interfaces/ReportInterface";
import { StoreInterface } from "@interfaces/StoreInterface";

type OverviewParams = ReportPeriodInput & { storeId?: string };

function numeric(value: unknown): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function comparison(current: number, previous: number) {
	return previous === 0
		? { value: null, available: false }
		: { value: ((current - previous) / Math.abs(previous)) * 100, available: true };
}

export class SuperadminOverviewInterface {
	private static mergeStoreDashboards(reports: any[], stores: any[]) {
		const sum = (items: any[], key: string) => items.reduce((total, item) => total + numeric(item[key]), 0);
		const mergeBy = (items: any[], key: (item: any) => string, fields: string[]) => {
			const map = new Map<string, any>();
			for (const item of items) {
				const id = key(item); const current = map.get(id) || { ...item };
				if (map.has(id)) for (const field of fields) current[field] = numeric(current[field]) + numeric(item[field]);
				map.set(id, current);
			}
			return [ ...map.values() ];
		};
		const summaryRevenue = sum(reports.map((report) => report.summary), "revenue");
		const summaryBills = sum(reports.map((report) => report.summary), "bill_count");
		const paymentMix = mergeBy(reports.flatMap((report) => report.payment_mix), (item) => item.method, [ "amount", "bill_count" ]);
		const paymentTotal = sum(paymentMix, "amount");
		const purchasingRows = reports.map((report) => report.purchasing);
		return {
			period: { from: "", to: "", date_from: "", date_to: "" },
			period_basis: "per_store_business_day",
			periods_by_store: reports.map((report) => report.periods_by_store[0]),
			generated_at: new Date().toISOString(),
			summary: {
				revenue: summaryRevenue, bill_count: summaryBills, average_bill: summaryBills ? summaryRevenue / summaryBills : 0,
				discount: sum(reports.map((report) => report.summary), "discount"),
				cancelled_refunded_count: sum(reports.map((report) => report.summary), "cancelled_refunded_count"),
				active_store_count: reports.filter((report) => numeric(report.summary.revenue) > 0).length,
				comparison: { revenue: { value: null, available: false }, bill_count: { value: null, available: false }, average_bill: { value: null, available: false } },
			},
			sales_series: mergeBy(reports.flatMap((report) => report.sales_series), (item) => item.label, [ "revenue", "bill_count" ]).sort((a, b) => String(a.label).localeCompare(String(b.label))),
			payment_mix: paymentMix.map((item) => ({ ...item, percent: paymentTotal ? numeric(item.amount) / paymentTotal * 100 : 0 })).sort((a, b) => numeric(b.amount) - numeric(a.amount)),
			stores: reports.flatMap((report) => report.stores),
			top_products: reports.flatMap((report) => report.top_products).sort((a, b) => numeric(b.revenue) - numeric(a.revenue)).slice(0, 10),
			promotions: reports.flatMap((report) => report.promotions).sort((a, b) => numeric(b.bill_count) - numeric(a.bill_count)).slice(0, 10),
			profitability: reports.flatMap((report) => report.profitability),
			inventory: reports.flatMap((report) => report.inventory),
			low_stock: reports.flatMap((report) => report.low_stock).sort((a, b) => numeric(a.available_base) - numeric(b.available_base)).slice(0, 20),
			sales_heatmap: mergeBy(reports.flatMap((report) => report.sales_heatmap), (item) => `${item.weekday}-${item.hour}`, [ "revenue", "bill_count" ]),
			store_options: stores,
			stock_adjustments: {
				movement_count: sum(reports.map((report) => report.stock_adjustments || {}), "movement_count"),
				quantity: sum(reports.map((report) => report.stock_adjustments || {}), "quantity"),
				cost: sum(reports.map((report) => report.stock_adjustments || {}), "cost"),
			},
			purchasing: {
				po_count: sum(purchasingRows, "po_count"), goods_cost: sum(purchasingRows, "goods_cost"), shipping_cost: sum(purchasingRows, "shipping_cost"),
				other_cost: sum(purchasingRows, "other_cost"), total_spend: sum(purchasingRows, "total_spend"), qty_received: sum(purchasingRows, "qty_received"),
			},
		};
	}

	static async dashboard(ownerUserId: string, input: OverviewParams): Promise<any> {
		const db = DbConn.getClient();
		// Keep the selected-store period identical to /reports: a store may start
		// its business day after midnight.  The overview used to silently use 00:00.
		await StoreInterface.ensureColumns();
		await InventoryCostInterface.ensureTables();
		const ownerStores = await db.execute({ sql: "SELECT id, name, COALESCE(currency, 'LAK') currency, COALESCE(business_day_start_minutes, 0) business_day_start_minutes FROM stores WHERE owner_user_id = ?", args: [ ownerUserId ] });
		const ownerStoreRows = ownerStores.rows as Record<string, unknown>[];
		if (!input.storeId && ownerStoreRows.length > 1) {
			const reports = await Promise.all(ownerStoreRows.map((store) => this.dashboard(ownerUserId, { ...input, storeId: String(store.id) })));
			return this.mergeStoreDashboards(reports, ownerStoreRows.map((store) => ({ id: String(store.id), name: String(store.name), currency: String(store.currency), business_day_start_minutes: numeric(store.business_day_start_minutes) })));
		}
		const selectedStore = ownerStoreRows.find((store) => String(store.id) === input.storeId);
		const dayStarts = [ ...new Set(ownerStoreRows.map((store) => numeric(store.business_day_start_minutes))) ];
		const businessDayStartMinutes = input.storeId
			? numeric(selectedStore?.business_day_start_minutes)
			: dayStarts.length === 1 ? dayStarts[0] : 0;
		const periodBasis = input.storeId ? "store_business_day" : dayStarts.length === 1 ? "shared_business_day" : "calendar_day";
		const periods = resolveReportPeriods({
			...input,
			businessDayStartMinutes,
		});
		const storeFilter = input.storeId ? "AND s.id = ?" : "";
		const scopeArgs: InValue[] = input.storeId ? [ ownerUserId, input.storeId ] : [ ownerUserId ];
		const paidWhere = `s.owner_user_id = ? ${storeFilter} AND o.status = 'completed' AND o.payment_status = 'paid' AND o.paid_at >= ? AND o.paid_at < ?`;
		const currentArgs = [ ...scopeArgs, periods.current.from, periods.current.to ];
		const previousArgs = [ ...scopeArgs, periods.previous.from, periods.previous.to ];
		const modifier = `${input.timezoneOffset >= 0 ? "+" : ""}${input.timezoneOffset} minutes`;
		const bucket = periods.current.days === 1
			? `strftime('%H:00', o.paid_at, '${modifier}')`
			: periods.current.days <= 31
				? `strftime('%Y-%m-%d', o.paid_at, '${modifier}')`
				: `date(o.paid_at, '${modifier}', '-' || ((strftime('%w', o.paid_at, '${modifier}') + 6) % 7) || ' days')`;

		const results = await db.batch([
			{
				sql: `SELECT COUNT(*) bill_count, COALESCE(SUM(o.total), 0) revenue, COALESCE(AVG(o.total), 0) average_bill, COALESCE(SUM(o.discount), 0) discount
					FROM orders o INNER JOIN stores s ON s.id = o.store_id WHERE ${paidWhere}`,
				args: currentArgs,
			},
			{
				sql: `SELECT COUNT(*) bill_count, COALESCE(SUM(o.total), 0) revenue, COALESCE(AVG(o.total), 0) average_bill
					FROM orders o INNER JOIN stores s ON s.id = o.store_id WHERE ${paidWhere}`,
				args: previousArgs,
			},
			{
				sql: `SELECT ${bucket} label, COALESCE(SUM(o.total), 0) revenue, COUNT(*) bill_count
					FROM orders o INNER JOIN stores s ON s.id = o.store_id WHERE ${paidWhere}
					GROUP BY label ORDER BY label`,
				args: currentArgs,
			},
			{
				sql: `SELECT COALESCE(NULLIF(TRIM(o.payment_method), ''), 'other') method, COALESCE(SUM(o.total), 0) amount, COUNT(*) bill_count
					FROM orders o INNER JOIN stores s ON s.id = o.store_id WHERE ${paidWhere}
					GROUP BY method ORDER BY amount DESC`,
				args: currentArgs,
			},
			{
				sql: `SELECT s.id, s.name, COALESCE(s.currency, 'LAK') currency,
						COUNT(o.id) bill_count, COALESCE(SUM(o.total), 0) revenue,
						COALESCE(AVG(o.total), 0) average_bill, COALESCE(SUM(o.discount), 0) discount
					FROM stores s
					LEFT JOIN orders o ON o.store_id = s.id AND o.status = 'completed' AND o.payment_status = 'paid' AND o.paid_at >= ? AND o.paid_at < ?
					WHERE s.owner_user_id = ? ${input.storeId ? "AND s.id = ?" : ""}
					GROUP BY s.id, s.name, s.currency ORDER BY revenue DESC, s.name`,
				args: input.storeId
					? [ periods.current.from, periods.current.to, ownerUserId, input.storeId ]
					: [ periods.current.from, periods.current.to, ownerUserId ],
			},
			{
				sql: `SELECT p.id, p.name, p.sku, s.name store_name,
						COALESCE(SUM(oi.qty_base), 0) quantity, COALESCE(SUM(oi.line_total), 0) revenue
					FROM orders o
					INNER JOIN stores s ON s.id = o.store_id
					INNER JOIN order_items oi ON oi.order_id = o.id
					INNER JOIN products p ON p.id = oi.product_id
					WHERE ${paidWhere}
						AND COALESCE(oi.line_status, 'sent') != 'cancelled'
						AND COALESCE(oi.is_gift, 0) = 0
					GROUP BY p.id, p.name, p.sku, s.name
					ORDER BY revenue DESC LIMIT 10`,
				args: currentArgs,
			},
			{
				sql: `SELECT op.promotion_id, op.promotion_name, op.promotion_type,
						COUNT(DISTINCT op.order_id) bill_count,
						COALESCE(SUM(op.applications), 0) applications,
						COALESCE(SUM(op.discount_amount), 0) discount_amount,
						COALESCE(SUM(g.gift_quantity), 0) gift_quantity,
						COALESCE(SUM(g.gift_cost), 0) gift_cost
					FROM order_promotions op
					INNER JOIN orders o ON o.id = op.order_id
					INNER JOIN stores s ON s.id = o.store_id
					LEFT JOIN (
						SELECT order_id, promotion_id, SUM(qty_base) gift_quantity,
							SUM(CASE WHEN cost_source_at_sale IN ('purchase', 'manual') THEN cost_base_at_sale * qty_base ELSE 0 END) gift_cost
						FROM order_items
						WHERE COALESCE(is_gift, 0) = 1 AND COALESCE(line_status, 'sent') != 'cancelled'
						GROUP BY order_id, promotion_id
					) g ON g.order_id = op.order_id AND g.promotion_id = op.promotion_id
					WHERE ${paidWhere}
					GROUP BY op.promotion_id, op.promotion_name, op.promotion_type
					ORDER BY bill_count DESC, discount_amount DESC LIMIT 10`,
				args: currentArgs,
			},
			{
				sql: `SELECT s.id, s.name,
						COALESCE(SUM(o.total), 0) revenue,
						COALESCE(SUM((
							SELECT SUM(CASE WHEN oi.cost_source_at_sale IN ('purchase', 'manual') THEN oi.cost_base_at_sale * oi.qty_base ELSE 0 END)
							FROM order_items oi WHERE oi.order_id = o.id AND COALESCE(oi.line_status, 'sent') != 'cancelled'
						)), 0) known_cost,
						COALESCE(SUM((
							SELECT SUM(CASE WHEN oi.cost_source_at_sale = 'unknown' AND COALESCE(oi.is_gift, 0) = 0 THEN oi.line_total ELSE 0 END)
							FROM order_items oi WHERE oi.order_id = o.id AND COALESCE(oi.line_status, 'sent') != 'cancelled'
						)), 0) unknown_cost_revenue,
						COUNT(CASE WHEN EXISTS (
							SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.cost_source_at_sale = 'unknown'
						) THEN 1 END) unknown_cost_bills
					FROM orders o INNER JOIN stores s ON s.id = o.store_id
					WHERE ${paidWhere}
					GROUP BY s.id, s.name ORDER BY revenue DESC`,
				args: currentArgs,
			},
			{
				// Same stock-value definition as /reports/stock and /reports/purchasing:
				// shelf quantity × the receipt-weighted cost (falling back to product cost).
				sql: `SELECT s.id, s.name,
						COALESCE(SUM(CASE WHEN p.inventory_mode = 'tracked' THEN COALESCE(b.on_hand_base, 0) * COALESCE(ics.average_unit_cost_base, p.cost_base, 0) ELSE 0 END), 0) inventory_value,
						COUNT(CASE WHEN p.inventory_mode = 'tracked' AND COALESCE(b.available_base, 0) <= 0 THEN 1 END) out_of_stock_count,
						COUNT(CASE WHEN p.inventory_mode = 'tracked' AND COALESCE(b.available_base, 0) < 0 THEN 1 END) negative_stock_count,
						COUNT(CASE WHEN p.inventory_mode = 'tracked'
							AND COALESCE(b.available_base, 0) > 0
							AND COALESCE(b.available_base, 0) <= CASE WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold, 0) END
							AND CASE WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold, 0) END > 0
						THEN 1 END) low_stock_count
					FROM stores s
					LEFT JOIN products p ON p.store_id = s.id AND p.active = 1 AND p.deleted_at IS NULL
					LEFT JOIN inventory_balances b ON b.store_id = s.id AND b.product_id = p.id
					LEFT JOIN inventory_cost_summaries ics ON ics.store_id = s.id AND ics.product_id = p.id
					WHERE s.owner_user_id = ? ${input.storeId ? "AND s.id = ?" : ""}
					GROUP BY s.id, s.name ORDER BY s.name`,
				args: scopeArgs,
			},
			{
				sql: `SELECT p.id, p.name, p.sku, s.name store_name, COALESCE(b.available_base, 0) available_base,
						CASE WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold, 0) END threshold
					FROM products p
					INNER JOIN stores s ON s.id = p.store_id
					LEFT JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id
					WHERE s.owner_user_id = ? ${input.storeId ? "AND s.id = ?" : ""}
						AND p.active = 1 AND p.deleted_at IS NULL AND p.inventory_mode = 'tracked'
						AND CASE WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold, 0) END > 0
						AND COALESCE(b.available_base, 0) <= CASE WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold ELSE COALESCE(s.low_stock_threshold, 0) END
					ORDER BY available_base, p.name LIMIT 20`,
				args: scopeArgs,
			},
			{
				sql: `SELECT CAST(strftime('%w', o.paid_at, '${modifier}') AS INTEGER) weekday,
						CAST(strftime('%H', o.paid_at, '${modifier}') AS INTEGER) hour,
						COALESCE(SUM(o.total), 0) revenue, COUNT(*) bill_count
					FROM orders o INNER JOIN stores s ON s.id = o.store_id
					WHERE ${paidWhere}
					GROUP BY weekday, hour ORDER BY weekday, hour`,
				args: currentArgs,
			},
			{
				sql: `SELECT COUNT(*) total FROM orders o INNER JOIN stores s ON s.id = o.store_id
					WHERE s.owner_user_id = ? ${storeFilter}
						AND COALESCE(o.closed_at, o.paid_at, o.created_at) >= ?
						AND COALESCE(o.closed_at, o.paid_at, o.created_at) < ?
						AND (o.status = 'cancelled' OR o.payment_status = 'refunded')`,
				args: currentArgs,
			},
			{
				sql: "SELECT id, name, COALESCE(currency, 'LAK') currency, COALESCE(business_day_start_minutes, 0) business_day_start_minutes FROM stores WHERE owner_user_id = ? ORDER BY name",
				args: [ ownerUserId ],
			},
			{
				// Mirrors /reports/purchasing, aggregated only across stores in this
				// owner's scope.  Values are based on received quantities, never on a
				// draft or merely ordered PO.
				sql: `SELECT COUNT(*) po_count,
						COALESCE(SUM((SELECT SUM(poi.qty_base_received * poi.unit_cost_base) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id)), 0) goods_cost,
						COALESCE(SUM(po.shipping_cost), 0) shipping_cost,
						COALESCE(SUM(po.other_cost), 0) other_cost,
						COALESCE(SUM((SELECT SUM(poi.qty_base_received) FROM purchase_order_items poi WHERE poi.purchase_order_id = po.id)), 0) qty_received
					FROM purchase_orders po INNER JOIN stores s ON s.id = po.store_id
					WHERE s.owner_user_id = ? ${storeFilter} AND po.received_at IS NOT NULL AND po.received_at >= ? AND po.received_at < ?`,
				args: currentArgs,
			},
		], "read");

		const current = results[0].rows[0] || {};
		const previous = results[1].rows[0] || {};
		const revenue = numeric(current.revenue);
		const bills = numeric(current.bill_count);
		const averageBill = numeric(current.average_bill);
		const paymentTotal = (results[3].rows as Record<string, unknown>[]).reduce((sum, item) => sum + numeric(item.amount), 0);
		const adjustmentResult = await db.execute({
			sql: `SELECT COUNT(*) movement_count, COALESCE(SUM(-m.qty_base), 0) quantity,
				COALESCE(SUM(m.total_cost_base), 0) cost
				FROM inventory_movements m INNER JOIN stores s ON s.id = m.store_id
				WHERE s.owner_user_id = ? ${storeFilter} AND m.type LIKE 'ADJUSTMENT%' AND m.qty_base < 0
					AND m.created_at >= ? AND m.created_at < ?`,
			args: currentArgs,
		});
		const adjustment = adjustmentResult.rows[0] as Record<string, unknown> | undefined;

		return {
			period: periods.current,
			period_basis: periodBasis,
			periods_by_store: input.storeId ? [{
				id: input.storeId,
				name: String(selectedStore?.name || ""),
				from: periods.current.from,
				to: periods.current.to,
				date_from: periods.current.date_from,
				date_to: periods.current.date_to,
			}] : [],
			comparison_period: periods.previous,
			generated_at: new Date().toISOString(),
			stock_adjustments: { movement_count: numeric(adjustment?.movement_count), quantity: numeric(adjustment?.quantity), cost: numeric(adjustment?.cost) },
			summary: {
				revenue,
				bill_count: bills,
				average_bill: averageBill,
				discount: numeric(current.discount),
				cancelled_refunded_count: numeric(results[11].rows[0]?.total),
				active_store_count: (results[4].rows as Record<string, unknown>[]).filter((item) => numeric(item.bill_count) > 0).length,
				comparison: {
					revenue: comparison(revenue, numeric(previous.revenue)),
					bill_count: comparison(bills, numeric(previous.bill_count)),
					average_bill: comparison(averageBill, numeric(previous.average_bill)),
				},
			},
			sales_series: results[2].rows.map((item) => ({
				label: String(item.label),
				revenue: numeric(item.revenue),
				bill_count: numeric(item.bill_count),
			})),
			payment_mix: results[3].rows.map((item) => ({
				method: String(item.method),
				amount: numeric(item.amount),
				bill_count: numeric(item.bill_count),
				percent: paymentTotal ? (numeric(item.amount) / paymentTotal) * 100 : 0,
			})),
			stores: results[4].rows.map((item) => ({
				id: String(item.id),
				name: String(item.name),
				currency: String(item.currency),
				revenue: numeric(item.revenue),
				bill_count: numeric(item.bill_count),
				average_bill: numeric(item.average_bill),
				discount: numeric(item.discount),
			})),
			top_products: results[5].rows.map((item) => ({
				id: String(item.id),
				name: String(item.name),
				sku: String(item.sku || ""),
				store_name: String(item.store_name),
				quantity: numeric(item.quantity),
				revenue: numeric(item.revenue),
			})),
			promotions: results[6].rows.map((item) => ({
				id: String(item.promotion_id),
				name: String(item.promotion_name),
				type: String(item.promotion_type),
				bill_count: numeric(item.bill_count),
				applications: numeric(item.applications),
				discount_amount: numeric(item.discount_amount),
				gift_quantity: numeric(item.gift_quantity),
				gift_cost: numeric(item.gift_cost),
			})),
			profitability: results[7].rows.map((item) => {
				const storeRevenue = numeric(item.revenue);
				const unknownRevenue = numeric(item.unknown_cost_revenue);
				const knownRevenue = Math.max(0, storeRevenue - unknownRevenue);
				const knownCost = numeric(item.known_cost);
				const grossProfit = knownRevenue - knownCost;
				return {
					id: String(item.id),
					name: String(item.name),
					revenue: storeRevenue,
					known_cost: knownCost,
					gross_profit: grossProfit,
					gross_margin_percent: knownRevenue ? (grossProfit / knownRevenue) * 100 : 0,
					cost_coverage_percent: storeRevenue ? (knownRevenue / storeRevenue) * 100 : 0,
					unknown_cost_revenue: unknownRevenue,
					unknown_cost_bills: numeric(item.unknown_cost_bills),
				};
			}),
			inventory: results[8].rows.map((item) => ({
				id: String(item.id),
				name: String(item.name),
				inventory_value: numeric(item.inventory_value),
				out_of_stock_count: numeric(item.out_of_stock_count),
				negative_stock_count: numeric(item.negative_stock_count),
				low_stock_count: numeric(item.low_stock_count),
			})),
			low_stock: results[9].rows.map((item) => ({
				id: String(item.id),
				name: String(item.name),
				sku: String(item.sku || ""),
				store_name: String(item.store_name),
				available_base: numeric(item.available_base),
				threshold: numeric(item.threshold),
			})),
			sales_heatmap: results[10].rows.map((item) => ({
				weekday: numeric(item.weekday),
				hour: numeric(item.hour),
				revenue: numeric(item.revenue),
				bill_count: numeric(item.bill_count),
			})),
			store_options: results[12].rows.map((item) => ({
				id: String(item.id),
				name: String(item.name),
				currency: String(item.currency),
				business_day_start_minutes: numeric(item.business_day_start_minutes),
			})),
			purchasing: (() => {
				const item = results[13].rows[0] || {};
				const goodsCost = numeric(item.goods_cost);
				const shippingCost = numeric(item.shipping_cost);
				const otherCost = numeric(item.other_cost);
				return {
					po_count: numeric(item.po_count),
					goods_cost: goodsCost,
					shipping_cost: shippingCost,
					other_cost: otherCost,
					total_spend: goodsCost + shippingCost + otherCost,
					qty_received: numeric(item.qty_received),
				};
			})(),
		};
	}
}
