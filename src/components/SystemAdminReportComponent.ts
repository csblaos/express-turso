import { ReportInterface, ReportPeriodInput } from "@interfaces/ReportInterface";
import { StoreInterface } from "@interfaces/StoreInterface";
import { ApiError } from "@middlewares/ApiError";

export class SystemAdminReportComponent {
	private static periodForStore(input: ReportPeriodInput, businessDayStartMinutes: number): ReportPeriodInput {
		return {
			...input,
			businessDayStartMinutes,
		};
	}

	static async listStores(input: ReportPeriodInput) {
		const stores = await StoreInterface.findAll();
		const items = await Promise.all(stores.map(async (store) => {
			const period = SystemAdminReportComponent.periodForStore(input, store.business_day_start_minutes);
			const [ report, stock ] = await Promise.all([
				ReportInterface.dashboard(store.id, period),
				ReportInterface.stock(store.id, period),
			]);

			return {
				id: store.id,
				name: store.name,
				store_type: store.store_type,
				currency: report.currency || store.currency,
				business_day_start_minutes: store.business_day_start_minutes,
				period: report.period,
				summary: {
					revenue: report.summary.revenue,
					gross_profit: report.summary.gross_profit,
					bill_count: report.summary.bill_count,
					average_bill: report.summary.average_bill,
					known_cost: report.profitability.known_cost,
					cost_coverage_percent: report.profitability.cost_coverage_percent,
				},
				stock: {
					inventory_value: stock.summary.inventory_value,
					low_count: stock.summary.low_count,
					out_count: stock.summary.out_count,
					negative_count: stock.summary.negative_count,
				},
			};
		}));

		return {
			generated_at: new Date().toISOString(),
			items: items.sort((left, right) => right.summary.revenue - left.summary.revenue),
		};
	}

	static async getStoreReport(storeId: string, input: ReportPeriodInput) {
		const store = await StoreInterface.findById(storeId);
		if (!store) throw ApiError.NotFoundError("Store not found");

		const period = SystemAdminReportComponent.periodForStore(input, store.business_day_start_minutes);
		const [ dashboard, stock, purchasing, products ] = await Promise.all([
			ReportInterface.dashboard(store.id, period),
			ReportInterface.stock(store.id, period),
			ReportInterface.purchasing(store.id, period),
			ReportInterface.products(store.id, period, {
				page: 1,
				limit: 100,
				sort: "revenue",
				order: "desc",
			}),
		]);

		return {
			generated_at: new Date().toISOString(),
			store: {
				id: store.id,
				name: store.name,
				store_type: store.store_type,
				currency: dashboard.currency || store.currency,
				business_day_start_minutes: store.business_day_start_minutes,
			},
			dashboard,
			stock,
			purchasing,
			products,
		};
	}
}
