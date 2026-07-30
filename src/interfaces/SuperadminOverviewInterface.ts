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
				cancelled_refunded_count: numeric(results[5].rows[0]?.total),
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
			store_options: results[6].rows.map((item) => ({
				id: String(item.id),
				name: String(item.name),
				currency: String(item.currency),
			})),
		};
	}
}
