import { Router } from "express";

import { PosController } from "@controllers/PosController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RestaurantController } from "@controllers/RestaurantController";
import RestaurantValidator from "@validators/RestaurantValidator";

export class PosRouter {
	private static instance: PosRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/products", PermissionMiddleware.require("pos.create_order"), PosController.getCatalog);
		this.router.get("/orders", PermissionMiddleware.require("pos.create_order"), PosController.listOrders);
		this.router.post("/checkout", PermissionMiddleware.require("pos.create_order"), PosController.checkout);
		this.router.get("/restaurant/tables", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.query, RestaurantController.dashboard);
		this.router.get("/restaurant/reports/profitability", PermissionMiddleware.require("reports.view"), RestaurantValidator.reportQuery, RestaurantController.profitability);
		this.router.patch("/restaurant/products/:productId/availability", PermissionMiddleware.require("products.update"), RestaurantValidator.availability, RestaurantController.availability);
		this.router.post("/restaurant/orders", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.open, RestaurantController.open);
		this.router.get("/restaurant/orders/open", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.query, RestaurantController.openOrders);
		this.router.get("/restaurant/pickup-queue", PermissionMiddleware.require("pos.create_order"), RestaurantValidator.query, RestaurantController.pickupQueue);
		this.router.get("/restaurant/pickup-queue/history", PermissionMiddleware.require("pos.create_order"), RestaurantValidator.query, RestaurantController.pickupQueueHistory);
		this.router.post("/restaurant/pickup-queue/:id/collected", PermissionMiddleware.require("pos.create_order"), RestaurantController.pickupCollected);
		this.router.get("/restaurant/orders/:id", PermissionMiddleware.require("pos.restaurant.open"), RestaurantController.order);
		this.router.post("/restaurant/orders/:id/items", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.addItem, RestaurantController.addItem);
		this.router.put("/restaurant/orders/:id/items/:itemId", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.updateItem, RestaurantController.updateItem);
		this.router.delete("/restaurant/orders/:id/items/:itemId", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.version, RestaurantController.deleteItem);
		this.router.post("/restaurant/orders/:id/items/:itemId/cancel", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.cancel, RestaurantController.cancelItem);
		this.router.post("/restaurant/orders/:id/send", PermissionMiddleware.require("pos.restaurant.send_kitchen"), RestaurantValidator.send, RestaurantController.send);
		this.router.post("/restaurant/orders/:id/transfer", PermissionMiddleware.require("pos.restaurant.transfer"), RestaurantValidator.transfer, RestaurantController.transfer);
		this.router.post("/restaurant/orders/:id/service-mode", PermissionMiddleware.require("pos.restaurant.transfer"), RestaurantValidator.serviceMode, RestaurantController.serviceMode);
		this.router.post("/restaurant/orders/:id/cancel", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.cancelOrder, RestaurantController.cancelOrder);
		this.router.post("/restaurant/orders/:id/cancel-sent", PermissionMiddleware.require("pos.restaurant.cancel_sent"), RestaurantValidator.cancelOrder, RestaurantController.cancelSentOrder);
		this.router.post("/restaurant/orders/:id/ready", PermissionMiddleware.require("pos.restaurant.open"), RestaurantValidator.version, RestaurantController.ready);
		this.router.post("/restaurant/orders/:id/promotions/:promotionId", PermissionMiddleware.require("pos.restaurant.apply_promotion"), RestaurantValidator.version, RestaurantController.promotion);
		this.router.post("/restaurant/orders/:id/checkout", PermissionMiddleware.require("pos.create_order"), RestaurantValidator.checkout, RestaurantController.checkout);
	}

	static getInstance(): PosRouter {
		if (!PosRouter.instance) {
			PosRouter.instance = new PosRouter();
		}
		return PosRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
