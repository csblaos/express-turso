import { Request, Response } from "express";

import { RestaurantInterface } from "@interfaces/RestaurantInterface";
import { ApiError } from "@middlewares/ApiError";
import { SyncFunction } from "@middlewares/SyncFunction";
import { appendServerTiming } from "@utils/ServerTiming";
import { SuccessHandler } from "@utils/SuccessHandler";

function storeId(req: Request): string {
	const body = req.body as Record<string, unknown> | undefined;
	const value = typeof req.query.store_id === "string" ? req.query.store_id : body?.store_id || req.auth?.storeId;
	const normalized = String(value || "").trim();
	if (!normalized) throw ApiError.BadRequestError("store_id is required");
	if (req.auth?.storeId && req.auth.storeId !== normalized) throw ApiError.ForbiddenError("store scope mismatch");
	return normalized;
}
function actor(req: Request): string { if (!req.auth) throw ApiError.UnauthorizedError(); return req.auth.userId; }

export class RestaurantController {
	static zones = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.listZones(storeId(req))}));
	static createZone = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.created(res,req.requestId,{data:await RestaurantInterface.saveZone(storeId(req),req.body)}));
	static updateZone = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.saveZone(storeId(req),req.body,String(req.params.id))}));
	static deleteZone = SyncFunction.handler(async (req: Request,res: Response)=>{await RestaurantInterface.deleteZone(storeId(req),String(req.params.id));SuccessHandler.send(res,req.requestId);});
	static tables = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.listTables(storeId(req))}));
	static createTable = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.created(res,req.requestId,{data:await RestaurantInterface.saveTable(storeId(req),req.body)}));
	static updateTable = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.saveTable(storeId(req),req.body,String(req.params.id))}));
	static deleteTable = SyncFunction.handler(async (req: Request,res: Response)=>{await RestaurantInterface.deleteTable(storeId(req),String(req.params.id));SuccessHandler.send(res,req.requestId);});
	static dashboard = SyncFunction.handler(async (req: Request,res: Response)=>{
		const id=storeId(req);
		const [zones,tables,pickupQueueEnabled]=await Promise.all([RestaurantInterface.listZones(id),RestaurantInterface.listTables(id),RestaurantInterface.pickupQueueEnabled(id)]);
		SuccessHandler.send(res,req.requestId,{data:{zones,tables,pickup_queue_enabled:pickupQueueEnabled?1:0}});
	});
	static openOrders = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.listOpenOrders(storeId(req))}));
	static pickupQueue = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.listPickupQueue(storeId(req))}));
	static pickupQueueHistory = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.listPickupQueueHistory(storeId(req))}));
	static pickupCollected = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.markPickupCollected(storeId(req),String(req.params.id),actor(req))}));
	static availability = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.setMenuAvailability(storeId(req),String(req.params.productId),Boolean(req.body.sold_out))}));
	static profitability = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.profitability(storeId(req),typeof req.query.from==="string"?req.query.from:undefined)}));
	static open = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.created(res,req.requestId,{data:await RestaurantInterface.createOrder(storeId(req),{...req.body,idempotency_key:String(req.header("Idempotency-Key")||"")},actor(req))}));
	static order = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.getOrder(storeId(req),String(req.params.id))}));
	static addItem = SyncFunction.handler(async (req: Request,res: Response)=>{
		const startedAt = process.hrtime.bigint();
		const data = await RestaurantInterface.addItem(storeId(req),String(req.params.id),req.body,actor(req));
		appendServerTiming(res,"restaurant-add",Number(process.hrtime.bigint()-startedAt)/1_000_000);
		SuccessHandler.created(res,req.requestId,{data});
	});
	static updateItem = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.updateItem(storeId(req),String(req.params.id),String(req.params.itemId),req.body)}));
	static deleteItem = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.deleteItem(storeId(req),String(req.params.id),String(req.params.itemId),Number(req.body.expected_version))}));
	static cancelItem = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.cancelSentItem(storeId(req),String(req.params.id),String(req.params.itemId),req.body,actor(req))}));
	static send = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.sendRound(storeId(req),String(req.params.id),Number(req.body.expected_version),String(req.header("Idempotency-Key")||""),actor(req),req.body.items)}));
	static transfer = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.transfer(storeId(req),String(req.params.id),String(req.body.table_id),Number(req.body.expected_version),actor(req))}));
	static serviceMode = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.changeServiceMode(storeId(req),String(req.params.id),req.body,actor(req))}));
	static cancelOrder = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.cancelOrder(storeId(req),String(req.params.id),req.body,actor(req),false)}));
	static cancelSentOrder = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.cancelOrder(storeId(req),String(req.params.id),req.body,actor(req),true)}));
	static ready = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.markReady(storeId(req),String(req.params.id),Number(req.body.expected_version))}));
	static promotion = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.applyPromotion(storeId(req),String(req.params.id),String(req.params.promotionId),Number(req.body.expected_version))}));
	static checkout = SyncFunction.handler(async (req: Request,res: Response)=>SuccessHandler.send(res,req.requestId,{data:await RestaurantInterface.checkout(storeId(req),String(req.params.id),req.body,actor(req),String(req.header("Idempotency-Key")||""))}));
}
