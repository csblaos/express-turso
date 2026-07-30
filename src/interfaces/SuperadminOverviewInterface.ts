import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { ReportPeriodInput, resolveReportPeriods } from "@interfaces/ReportInterface";

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
	static async dashboard(ownerUserId: string, input: OverviewParams) {
		const db = DbConn.getClient();
		const periods = resolveReportPeriods(input);
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
				sql: `SELECT s.id, s.name,
						COALESCE(SUM(CASE WHEN p.inventory_mode = 'tracked' THEN COALESCE(b.available_base, 0) * COALESCE(p.cost_base, 0) ELSE 0 END), 0) inventory_value,
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
				sql: "SELECT id, name, COALESCE(currency, 'LAK') currency FROM stores WHERE owner_user_id = ? ORDER BY name",
				args: [ ownerUserId ],
			},
		], "read");

		const current = results[0].rows[0] || {};
		const previous = results[1].rows[0] || {};
		const revenue = numeric(current.revenue);
		const bills = numeric(current.bill_count);
		const averageBill = numeric(current.average_bill);
		const paymentTotal = (results[3].rows as Record<string, unknown>[]).reduce((sum, item) => sum + numeric(item.amount), 0);

		return {
			period: periods.current,
			comparison_period: periods.previous,
			generated_at: new Date().toISOString(),
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
			})),
		};
	}
}
