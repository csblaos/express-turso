import { Request, Response } from "express";

import { ProductReportSort, ReportInterface, ReportPeriodInput, ReportPreset } from "@interfaces/ReportInterface";
import { RestaurantInterface } from "@interfaces/RestaurantInterface";
import { ApiError } from "@middlewares/ApiError";
import { SyncFunction } from "@middlewares/SyncFunction";
import { SuccessHandler } from "@utils/SuccessHandler";

function storeId(req: Request): string {
	const requested = String(req.query.store_id || req.auth?.storeId || "").trim();
	if (!requested) throw ApiError.BadRequestError("store_id is required");
	if (req.auth?.storeId && req.auth.storeId !== requested) throw ApiError.ForbiddenError("store scope mismatch");
	return requested;
}

export class ReportController {
	private static period(req:Request):ReportPeriodInput{return{preset:String(req.query.preset||req.query.range||"today") as ReportPreset,dateFrom:req.query.date_from?String(req.query.date_from):undefined,dateTo:req.query.date_to?String(req.query.date_to):undefined,timezoneOffset:Number(req.query.timezone_offset)};}
	static dashboard = SyncFunction.handler(async (req: Request, res: Response) => {
		await RestaurantInterface.ensureTables();
		const data = await ReportInterface.dashboard(storeId(req), ReportController.period(req));
		SuccessHandler.send(res, req.requestId, { data });
	});
	// A practical closing-day view for the counter team. It deliberately excludes
	// product cost and margin data; those belong only in the full reports area.
	static dailyDashboard = SyncFunction.handler(async (req: Request, res: Response) => {
		await RestaurantInterface.ensureTables();
		const report = await ReportInterface.dashboard(storeId(req), ReportController.period(req));
		// Dashboard fields were added after the full reports endpoint. Keep the
		// staff view resilient while older report data is being rolled out.
		const paymentMix = Array.isArray(report.payment_mix) ? report.payment_mix : [];
		const paymentCurrencies = Array.isArray(report.payment_currencies) ? report.payment_currencies : [];
		const promotionPerformance = Array.isArray(report.promotion_performance) ? report.promotion_performance : [];
		const topProducts = Array.isArray(report.top_products) ? report.top_products : [];
		const lowStock = Array.isArray(report.low_stock) ? report.low_stock : [];
		const promotionSummary = report.promotion_summary || {};
		SuccessHandler.send(res, req.requestId, { data: {
			currency: report.currency,
			generated_at: report.generated_at,
			period: report.period,
			summary: {
				revenue: report.summary.revenue,
				bill_count: report.summary.bill_count,
				average_bill: report.summary.average_bill,
				discount: report.summary.discount,
				cancelled_refunded_count: report.summary.cancelled_refunded_count,
				cancelled_refunded_amount: report.summary.cancelled_refunded_amount,
				comparison: report.summary.comparison,
			},
			operational_signals: {
				restock_sku_count: report.operational_signals.restock_sku_count,
				out_of_stock_count: report.operational_signals.out_of_stock_count,
				negative_stock_count: report.operational_signals.negative_stock_count,
			},
			payment_mix: paymentMix.map((item: { method: string; amount: number; bill_count: number; percent: number }) => ({
				method: item.method, amount: item.amount, bill_count: item.bill_count, percent: item.percent,
			})),
			// This is a payment summary, not a cash-drawer balance: opening floats,
			// payouts and deposits are not tracked by the system yet.
			payment_currencies: paymentCurrencies.map((item: { currency: string; is_base: boolean; bill_count: number; amount_base: number; tendered_base: number; change_base: number; amount_foreign: number | null; exchange_rate: number; percent: number }) => ({
				currency: item.currency, is_base: item.is_base, bill_count: item.bill_count,
				amount_base: item.amount_base, tendered_base: item.tendered_base,
				change_base: item.change_base, amount_foreign: item.amount_foreign,
				exchange_rate: item.exchange_rate, percent: item.percent,
			})),
			promotion_summary: {
				promotion_bill_count: promotionSummary.promotion_bill_count || 0,
				applications: promotionSummary.applications || 0,
				discount_amount: promotionSummary.discount_amount || 0,
				gift_quantity: promotionSummary.gift_quantity || 0,
			},
			promotion_performance: promotionPerformance.slice(0, 5).map((item: { promotion_id: string; name: string; type: string; bill_count: number; applications: number; discount_amount: number; gift_quantity: number }) => ({
				promotion_id: item.promotion_id, name: item.name, type: item.type,
				bill_count: item.bill_count, applications: item.applications,
				discount_amount: item.discount_amount, gift_quantity: item.gift_quantity,
			})),
			top_products: topProducts.slice(0, 5).map((item: { id: string; name: string; sku: string; quantity: number; revenue: number; percent: number }) => ({
				id: item.id, name: item.name, sku: item.sku, quantity: item.quantity,
				revenue: item.revenue, percent: item.percent,
			})),
			low_stock: lowStock.slice(0, 5).map((item: { id: string; name: string; sku: string; available_base: number; threshold: number }) => ({
				id: item.id, name: item.name, sku: item.sku,
				available_base: item.available_base, threshold: item.threshold,
			})),
		} });
	});
	static purchasing = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ReportInterface.purchasing(storeId(req), ReportController.period(req));
		SuccessHandler.send(res, req.requestId, { data });
	});

	static stock = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await ReportInterface.stock(storeId(req), ReportController.period(req));
		SuccessHandler.send(res, req.requestId, { data });
	});

	static products=SyncFunction.handler(async(req:Request,res:Response)=>{await RestaurantInterface.ensureTables();const data=await ReportInterface.products(storeId(req),ReportController.period(req),{search:req.query.search?String(req.query.search):undefined,categoryId:req.query.category_id?String(req.query.category_id):undefined,sort:String(req.query.sort) as ProductReportSort,order:String(req.query.order) as "asc"|"desc",page:Number(req.query.page),limit:Number(req.query.limit)});SuccessHandler.send(res,req.requestId,{data});});
	static productTrend=SyncFunction.handler(async(req:Request,res:Response)=>{await RestaurantInterface.ensureTables();const data=await ReportInterface.productTrend(storeId(req),String(req.params.productId),ReportController.period(req));SuccessHandler.send(res,req.requestId,{data});});
}
