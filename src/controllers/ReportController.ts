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
	static products=SyncFunction.handler(async(req:Request,res:Response)=>{await RestaurantInterface.ensureTables();const data=await ReportInterface.products(storeId(req),ReportController.period(req),{search:req.query.search?String(req.query.search):undefined,categoryId:req.query.category_id?String(req.query.category_id):undefined,sort:String(req.query.sort) as ProductReportSort,order:String(req.query.order) as "asc"|"desc",page:Number(req.query.page),limit:Number(req.query.limit)});SuccessHandler.send(res,req.requestId,{data});});
	static productTrend=SyncFunction.handler(async(req:Request,res:Response)=>{await RestaurantInterface.ensureTables();const data=await ReportInterface.productTrend(storeId(req),String(req.params.productId),ReportController.period(req));SuccessHandler.send(res,req.requestId,{data});});
}
